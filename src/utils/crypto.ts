import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * AES-256-GCM symmetric encryption for storing credentials at rest.
 * Payload format (base64): [16-byte salt][12-byte iv][16-byte tag][ciphertext]
 *
 * The master key is derived from SECRETS_MASTER_KEY env var via scrypt.
 * NEVER commit SECRETS_MASTER_KEY to git; it must be set per environment.
 */
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getMasterKey(): string {
  const key = process.env.SECRETS_MASTER_KEY;
  if (!key || key.length < 32) {
    throw new Error(
      "SECRETS_MASTER_KEY must be set (>=32 chars) before encrypting/decrypting credentials."
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const masterKey = getMasterKey();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = scryptSync(masterKey, salt, KEY_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const masterKey = getMasterKey();
  const buf = Buffer.from(encoded, "base64");

  if (buf.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted payload is malformed (too short).");
  }

  const salt = buf.subarray(0, SALT_LENGTH);
  const iv = buf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buf.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = scryptSync(masterKey, salt, KEY_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Encrypt a JSON-serializable value (objects, arrays).
 */
export function encryptJSON(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJSON<T = unknown>(encoded: string): T {
  return JSON.parse(decryptSecret(encoded)) as T;
}
