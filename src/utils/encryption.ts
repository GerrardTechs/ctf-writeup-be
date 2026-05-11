import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// Derive 32-byte key dari JWT_SECRET
function getKey(): Buffer {
  return createHash('sha256')
    .update(process.env.JWT_SECRET ?? 'fallback-key')
    .digest();
}

export function encryptFlag(plaintext: string): string {
  if (!plaintext) return plaintext;
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  // Format: iv:encrypted (hex)
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptFlag(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  // Kalau tidak ada ':' berarti plaintext lama — return as is
  if (!ciphertext.includes(':')) return ciphertext;
  try {
    const [ivHex, encHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', getKey(), iv);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Kalau decrypt gagal, kembalikan as is
    return ciphertext;
  }
}