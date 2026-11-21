import crypto from 'crypto';

function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export async function verifyPasswordAsync(password: string, stored: string): Promise<boolean> {
  if (!stored || !password || !stored.startsWith('scrypt$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
  const [, salt, originalHash] = parts;
  const derived = await scryptAsync(password, salt, 64);
  try {
    const origBuf = Buffer.from(originalHash, 'hex');
    if (origBuf.length !== derived.length) return false;
    return crypto.timingSafeEqual(origBuf, derived);
  } catch {
    return false;
  }
}
