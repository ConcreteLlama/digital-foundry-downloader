import forge from "node-forge";
import { ensureDirectory } from "./file-utils.js";
import fs from "fs/promises";
import { logger } from "df-downloader-common";
import path from "path";

export type CertData = {
  cert: string;
  key: string;
  ca?: string;
};

export const setupCert = async (certDir: string, publicAddress: string) => {
  ensureDirectory(certDir);
  const certPath = path.join(certDir, "cert.pem");
  const keyPath = path.join(certDir, "key.pem");
  const existingCertStr = await fs.readFile(certPath, "utf8").catch(() => null);
  const existingCert = existingCertStr ? forge.pki.certificateFromPem(existingCertStr) : null;
  const existingKeyStr = await fs.readFile(keyPath, "utf8").catch(() => null);
  const existingKey = existingKeyStr ? forge.pki.privateKeyFromPem(existingKeyStr) : null;
  const now = new Date();
  if (!existingCert) {
    logger.log("info", "No certificate exists - generating new self-signed certificate");
    return await generateSelfSignedCert(certDir, publicAddress);
  } else if (!existingKey) {
    logger.log("info", "No key exists - regenerating new self-signed certificate");
    return await generateSelfSignedCert(certDir, publicAddress);
  } else if (existingCert.validity.notAfter < now) {
    logger.log("info", "Existing certificate has expired - generating new self-signed certificate");
    return await generateSelfSignedCert(certDir, publicAddress);
  } else if (existingCert.subject.getField("CN").value !== publicAddress) {
    logger.log(
      "info",
      `Existing certificate is for ${
        existingCert.subject.getField("CN").value
      } - generating new self-signed certificate for ${publicAddress}`
    );
    return await generateSelfSignedCert(certDir, publicAddress);
  }
  return {
    cert: existingCertStr!,
    key: existingKeyStr!,
  };
};

export const generateSelfSignedCert = async (certDir: string, publicAddress: string) => {
  // generate a keypair and create an X.509v3 certificate
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;

  // set the certificate's attributes
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs: forge.pki.CertificateField[] = [{ name: "commonName", value: publicAddress }];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    {
      name: "basicConstraints",
      cA: true,
    },
    {
      name: "keyUsage",
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true,
    },
  ]);

  // self-sign this certificate
  cert.sign(keys.privateKey);

  // convert a Forge certificate to PEM
  const pem = forge.pki.certificateToPem(cert);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

  // Write keys to files
  await fs.writeFile(path.join(certDir, "cert.pem"), pem);
  await fs.writeFile(path.join(certDir, "key.pem"), privateKeyPem);
  return {
    key: privateKeyPem,
    cert: pem,
  };
};
