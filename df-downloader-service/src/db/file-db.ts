import { logger } from "df-downloader-common";
import { copyFile } from "fs/promises";
import { WorkerQueue } from "../utils/queue-utils.js";
import z from "zod";
import fs from "fs";

type FileDbOpts<T = any, Z extends z.ZodType<T> = z.ZodType<T>> = {
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
    static async create<T = any, Z extends z.ZodType<T> = z.ZodType<T>>(opts: FileDbOpts<T, Z>) {
        const { filename, patchRoutine, backupDestination, schema } = opts;
        let data = await fs.promises.readFile(filename, "utf-8").catch(() => null).then((data) => data ? JSON.parse(data) : null);
        data = data || opts.initialData;
        const backupLocation = backupDestination ? typeof backupDestination === "string" ?
            backupDestination :
            await backupDestination(data) :
            `${filename}.bak`; 
        if (fs.existsSync(filename)) {
            await copyFile(filename, backupLocation);
        }
        try {
            const { data: patchedData, patched } = await patchRoutine(data);
            if (!patched) {
                logger.log("info", "Data not patched, removing backup");
                await fs.promises.rm(backupLocation);
            }
            const parsed = schema.safeParse(patchedData);
            if (!parsed.success) {
                throw new Error(parsed.error.errors.join("\n"));
            }
            data = parsed.data;
            await fs.promises.writeFile(filename, JSON.stringify(data, null, 2));
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
        });
    }
    public async updateDb(data: T) {
        this.data = data;
        await this.writeQueue
            .addWork(async () => {
                logger.log("info", "Writing to DB");
                await fs.promises.writeFile(this.filename, JSON.stringify(this.data, null, 2));
                logger.log("info", "Wrote to DB");
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
        await this.writeQueue.close();
    }
}
