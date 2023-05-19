import { ensureEnvString } from "../utils/env-utils.js";
import { FileUserService } from "./file-user-manager.js";

const configDir = ensureEnvString("CONFIG_DIR", "config");
export const userService = FileUserService.create(configDir);
