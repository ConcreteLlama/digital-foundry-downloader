import { spawn } from "child_process";
import { logger } from "df-downloader-common";

export const runCommand = async (command: string, args: string[], inputs?: string[]) => {
  let output = "";
  let lastErr: any;
  const process = spawn(command, args);
  await new Promise<void>((res, rej) => {
    process.once("close", (rc) => {
      if (rc !== 0) {
        logger.log("error", `Error running command:`, lastErr.toString());
        return rej(lastErr.toString());
      }
      res();
    });
    process.once("error", (err) => {
      logger.log("error", `Error running command:`, err);
      rej(err);
    });
    process.stdout.on("data", (chunk) => {
      output += chunk;
    });
    process.stderr.on("data", (chunk) => (lastErr = chunk));
    inputs?.forEach((input, index) => {
      process.stdin.write(input, "utf8", (err) => {
        if (err) {
          logger.log("error", `Error writing to pipe ${index}:`, err);
          rej(err);
        }
      });
    });
    process.stdin.end();
  });
  return output;
}