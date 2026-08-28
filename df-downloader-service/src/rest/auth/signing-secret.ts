import { logger } from "df-downloader-common";
import fs from "fs";
import path from "path";
import YAML from "yaml";
import z from "zod";
import { ensureDirectory } from "../../utils/file-utils.js";
import { generateSecretAsync } from "./utils.js";

/**
 * Where the JWT signing secret lives, and why it isn't in config.yaml.
 *
 * The secret used to be minted fresh on every start, which silently logged
 * everyone out on every restart. It has to persist, but it deliberately does
 * not go in config.yaml: `GET /api/config` hands the whole config object to
 * the UI, and the settings forms are auto-generated from the config zod
 * schemas, so anything added there becomes both an API response field and a
 * visible text box. Instead it gets its own file in the config dir, next to
 * users.yaml - which is the existing precedent for "secret-bearing state
 * that lives in the config dir but isn't part of the user's configuration"
 * (users.yaml holds bcrypt password hashes). The config dir is gitignored
 * and, in Docker, is the bind mount that already has to survive restarts.
 */
const SECRET_FILENAME = "jwt-secret.yaml";
const SECRET_ENV_VAR = "JWT_SIGNING_SECRET";
const SECRET_BYTES = 32;

const FILE_HEADER = `# Secret used to sign the login tokens for this installation. Generated
# automatically on first run - there is nothing to configure here.
#
# Keep it private: anyone holding it can mint a valid login token.
#
# To deliberately log every signed-in browser out, delete this file and
# restart - a new secret is generated and every existing token stops
# verifying. The same happens if you change ${SECRET_ENV_VAR}, which
# overrides this file entirely when set.
`;

const SigningSecretFileSchema = z.object({
  signingSecret: z.string().trim().min(1),
});

/**
 * Returns this installation's persistent JWT signing secret, generating and
 * storing one the first time it's asked for.
 *
 * Never log the returned value.
 */
export const loadOrCreateSigningSecret = async (dir: string): Promise<string> => {
  const fromEnv = process.env[SECRET_ENV_VAR]?.trim();
  if (fromEnv) {
    logger.log("info", `Using the JWT signing secret supplied via ${SECRET_ENV_VAR}`);
    return fromEnv;
  }

  ensureDirectory(dir);
  const secretFilePath = path.join(dir, SECRET_FILENAME);

  let existing: string | undefined;
  try {
    const parsed = SigningSecretFileSchema.safeParse(YAML.parse(await fs.promises.readFile(secretFilePath, "utf-8")));
    existing = parsed.success ? parsed.data.signingSecret : undefined;
    if (!parsed.success) {
      logger.log("warn", `${secretFilePath} exists but holds no usable secret - a new one will be generated`);
    }
  } catch (e) {
    // Missing file is the normal first-run case. A file that exists but
    // can't be read or parsed is worth saying something about, since we're
    // about to replace it and log everyone out.
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
      logger.log("warn", `Could not read ${secretFilePath} - a new signing secret will be generated`, e);
    }
  }
  if (existing) {
    return existing;
  }

  const secret = await generateSecretAsync(SECRET_BYTES);
  // 0600 where the platform honours it - Windows ignores the mode, which is
  // fine, this is a best-effort narrowing rather than the protection itself.
  await fs.promises.writeFile(secretFilePath, `${FILE_HEADER}${YAML.stringify({ signingSecret: secret })}`, {
    mode: 0o600,
  });
  logger.log("info", `Generated a new JWT signing secret and stored it in ${secretFilePath}`);
  return secret;
};
