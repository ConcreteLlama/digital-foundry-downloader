import { writeFileAtomic } from "../utils/file-utils.js";
import { logger } from "df-downloader-common";
import { copyFile } from "fs/promises";
import { WorkerQueue } from "../utils/queue-utils.js";
import z from "zod";
import fs from "fs";

// Z's Input intentionally left as `any` (not constrained to T) - a schema
// with a .default()'d field naturally has an Input type narrower than its
// Output (default() makes the field optional on input, present on output),
// and requiring Input === T here was an overly strict bound that just never
// surfaced until a nested schema (DfContentInfo.legacy/.unpatchable) used
// .default() for the first time.
type FileDbOpts<T = any, Z extends z.ZodType<T, any, any> = z.ZodType<T, any, any>> = {
    schema: Z;
    filename: string;
    patchRoutine: (data: any) => Promise<{
        data: any,
        patched: boolean,
    }>;
    initialData: T;
    backupDestination?: ((data: any) => Promise<string> | string) | string;
}
export class FileDb<T> {
    private writeQueue: WorkerQueue;
    static async create<T = any, Z extends z.ZodType<T, any, any> = z.ZodType<T, any, any>>(opts: FileDbOpts<T, Z>) {
        const { filename, patchRoutine, backupDestination, schema } = opts;
        let data = await fs.promises.readFile(filename, "utf-8").catch(() => null).then((data) => data ? JSON.parse(data) : null);
        data = data || opts.initialData;
        const backupLocation = backupDestination ? typeof backupDestination === "string" ?
            backupDestination :
            await backupDestination(data) :
            `${filename}.bak`; 
        const dbExists = fs.existsSync(filename);
        if (dbExists) {
            await copyFile(filename, backupLocation);
        }
        try {
            const { data: patchedData, patched } = await patchRoutine(data);
            if (!patched && dbExists && fs.existsSync(backupLocation)) {
                logger.log("info", "Data not patched, removing backup");
                await fs.promises.rm(backupLocation);
            }
            const parsed = schema.safeParse(patchedData);
            if (!parsed.success) {
                throw new Error(parsed.error.issues.map((issue) => issue.message).join("\n"));
            }
            data = parsed.data;
            // Atomic, and retried: this is the first write of startup, and on a
            // synced folder something else can briefly hold the file open -
            // observed here as EBUSY from the Nextcloud client, which killed the
            // service before it finished booting. writeFileAtomic already treats
            // EBUSY/EPERM/EACCES/ENOENT as worth retrying; a raw write does not.
            await writeFileAtomic(filename, JSON.stringify(data, null, 2));
            return new FileDb<T>(filename, data);
        } catch (e) {
            if (fs.existsSync(backupLocation)) {
                await copyFile(backupLocation, filename);
            }
            throw e;
        }

    }
    private constructor(readonly filename: string, private data: T) {
        this.writeQueue = new WorkerQueue({
            namePrefix: "file-db-write-queue",
            concurrent: 1,
            maxRetries: 5,
            retryDelay: 200,
            // A write can be scheduled (scheduleUpdateDb) moments before shutdown and
            // still be merely queued, not yet active, when close() runs - the default
            // close mode would silently drop it. DB writes must never be dropped.
            dropPendingOnClose: false,
        });
    }
    /**
     * Collapses writes that would produce the same file.
     *
     * The queued write serialises `this.data` when it runs, not when it was
     * queued, so a write already waiting will include anything changed since.
     * Queueing a second one therefore rewrites the same file with the same
     * bytes - which was invisible while callers trickled in one at a time, and
     * became the dominant cost the moment a bulk run queued three hundred
     * pipelines at once: three hundred full rewrites of a file holding all
     * three hundred, back to back.
     *
     * The flag is cleared as the write begins rather than when it finishes, so
     * a change arriving mid-write schedules another rather than being folded
     * into one that has already serialised. Erring towards an extra write is
     * the right direction for something whose whole job is not losing data.
     */
    private writePending = false;
    public async updateDb(data: T) {
        this.data = data;
        if (this.writePending) {
            return;
        }
        this.writePending = true;
        await this.writeQueue
            .addWork(async () => {
                this.writePending = false;
                logger.log("debug", "Writing to DB");
                await fs.promises.writeFile(this.filename, JSON.stringify(this.data, null, 2));
                logger.log("debug", "Wrote to DB");
            });
    }
    public scheduleUpdateDb(data: T) {
        this.updateDb(data).catch((e) => {
            logger.log("error", e, "Error writing to DB");
        });
    }
    public updateDbSync(data: T) {
        this.data = data;
        fs.writeFileSync(this.filename, JSON.stringify(this.data, null, 2));
    }
    public getData() {
        return this.data;
    }
    public async close() {
        await this.writeQueue.close(60000, "wait_for_all_jobs");
    }
}
