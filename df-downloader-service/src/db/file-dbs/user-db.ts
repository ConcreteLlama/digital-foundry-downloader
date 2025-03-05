import { DfUserInfo, logger, UserInfo, zodParse } from "df-downloader-common";
import path from "path";
import { ensureEnvString } from "../../utils/env-utils.js";
import { ensureDirectory } from "../../utils/file-utils.js";
import { CURRENT_VERSION } from "../../version.js";
import { DfUserDbSchema } from "../df-db-model.js";
import { FileDb } from "../file-db.js";

export class DfUserDb {
    static async create(dbDir: string) {
        const contentInfoDbFilename = path.join(dbDir, "user-db.json");
        ensureDirectory(dbDir);
        const fileDb = await FileDb.create<DfUserDbSchema>({
            schema: DfUserDbSchema,
            filename: contentInfoDbFilename,
            initialData: {
                version: CURRENT_VERSION,
                lastUpdated: new Date(),
            },
            backupDestination: async (data) => {
                const version = data?.version || "NO_VERSION";
                const backupDir = path.join(dbDir, "backups");
                const backupDbPath = path.join(backupDir, `user-db-${version}-${Date.now()}.json`);
                ensureDirectory(backupDir);
                return backupDbPath;
            },
            patchRoutine: async (data) => {
                const version = data.version;
                if (version === CURRENT_VERSION) {
                    logger.log("info", `DB already at version ${CURRENT_VERSION} - no patches to apply`);
                    data = zodParse(DfUserDbSchema, data);
                    return {
                        data,
                        patched: false,
                    };
                }
                while (data.version !== CURRENT_VERSION) {
                    data.version = "2.3.0";
                }
                logger.log("info", `DB patched to version ${CURRENT_VERSION}`);
                return {
                    data,
                    patched: true,
                };
            },
        });
        return new DfUserDb(fileDb);
    }
    private get data(): DfUserDbSchema {
        return this.fileDb.getData();
    }

    private constructor(private readonly fileDb: FileDb<DfUserDbSchema>) {
    }
    private updateDb() {
        this.data.lastUpdated = new Date();
        this.fileDb.scheduleUpdateDb(this.data);
    }
    async setDfUserInfo(user: DfUserInfo): Promise<void> {
        this.data.dfUser = user;
        this.updateDb();
    }
    async getDfUserInfo(): Promise<DfUserInfo | undefined> {
        return this.data.dfUser;
    }
}
