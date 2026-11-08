import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

// Stored as "salt:hash", both hex
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [saltHex = "", hashHex = ""] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scryptAsync(
    password,
    Buffer.from(saltHex, "hex"),
    KEY_LENGTH
  )) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
