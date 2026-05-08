import { createHash } from 'crypto';

export function hashFilename(originalName: string): string {
  return createHash('sha256').update(originalName).digest('hex');
}