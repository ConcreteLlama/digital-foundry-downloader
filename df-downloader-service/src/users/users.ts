import { configDir } from "../config/config.js";
import { FileUserService } from "./file-user-manager.js";

export const userService = FileUserService.create(configDir);
