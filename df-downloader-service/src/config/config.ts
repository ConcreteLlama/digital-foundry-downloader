import { ensureEnvString } from "../utils/env-utils.js";
import { FileConfig } from "./file-config.js";

export const configDir = ensureEnvString("CONFIG_DIR", "config");
export const configService = FileConfig.create(configDir);
