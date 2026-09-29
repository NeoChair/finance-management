import crypto from "crypto";

// .NET's Encoding.ASCII.GetBytes replaces any char above 0x7F with '?' (0x3F),
// unlike Node's Buffer 'ascii' encoding which truncates the high bits instead.
function toDotNetAsciiBytes(input: string): Buffer {
  const bytes = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    bytes[i] = code > 127 ? 0x3f : code;
  }
  return bytes;
}

function md5HexLower(input: string): string {
  return crypto.createHash("md5").update(toDotNetAsciiBytes(input)).digest("hex");
}

function sha256HexLower(input: string): string {
  return crypto.createHash("sha256").update(toDotNetAsciiBytes(input)).digest("hex");
}

// Port of Dul.Security.CryptorEngine.EncryptPassword (https://github.com/VisualAcademy/Dul):
// EncryptPassword(password) = SHA256Hash(MD5Hash(password))
export function encryptPassword(password: string): string {
  return sha256HexLower(md5HexLower(password));
}
