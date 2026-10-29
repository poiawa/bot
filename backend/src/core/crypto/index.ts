import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  // Derive a proper 32-byte key from the environment variable
  return crypto.scryptSync(key, 'salt', 32);
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function hashSensitiveData(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function generateApiKey(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(24).toString('base64url');
  return `vbn_${timestamp}_${randomPart}`;
}

export function encryptForStorage(data: string): string {
  return encrypt(data);
}

export function decryptFromStorage(encryptedData: string): string {
  return decrypt(encryptedData);
}
