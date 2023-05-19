import { randomBytes } from "crypto";

export const generateSecretAsync = async (len: number, encoding: BufferEncoding = "hex") => {
  return new Promise<string>((resolve, reject) => {
    randomBytes(len, (err, buf) => {
      if (err) {
        reject(err);
      } else {
        resolve(buf.toString(encoding));
      }
    });
  });
};
