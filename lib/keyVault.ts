import crypto from 'crypto';
import { cookies } from 'next/headers';
import { ProviderId } from '@/types/framecode';

const COOKIE_NAME = 'fc_keys';

export interface KeyVaultData {
  claude?: string;
  openrouter?: string;
  gemini?: string;
}

function getDerivedKey(): Buffer {
  const secret = process.env.KEYS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('KEYS_SECRET is not set on the server (minimum 32 characters).');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function seal(data: KeyVaultData): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const jsonStr = JSON.stringify(data);
  const ciphertext = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine iv (12 bytes) + authTag (16 bytes) + ciphertext
  const combined = Buffer.concat([iv, authTag, ciphertext]);
  return combined.toString('base64url');
}

function unseal(sealed: string): KeyVaultData {
  try {
    const key = getDerivedKey();
    const combined = Buffer.from(sealed, 'base64url');
    if (combined.length < 28) return {};

    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(12, 28);
    const ciphertext = combined.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return {};
  }
}

export async function readKeys(): Promise<KeyVaultData> {
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(COOKIE_NAME)?.value;
  if (!cookieVal) return {};
  return unseal(cookieVal);
}

export async function writeKeys(keysData: KeyVaultData): Promise<void> {
  const cookieStore = await cookies();
  const sealed = seal(keysData);
  cookieStore.set(COOKIE_NAME, sealed, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 31536000,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function getKey(provider: ProviderId): Promise<string | undefined> {
  const keysData = await readKeys();
  const key = keysData[provider]?.trim();
  return key || undefined;
}
