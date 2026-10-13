/* Test helpers: a throwaway Ed25519 key + node-side signing (same as the owner tools). */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const makeTestKey = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sard-key-'));
  const pemPath = path.join(dir, 'k.pem');
  fs.writeFileSync(pemPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const pubHex = Buffer.from(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)).toString('hex');
  return { pemPath, pubHex, privateKey };
};

export const repoRoot = path.resolve(__dirname, '../../../..');

export const memoryKv = () => {
  const m = new Map<string, string>();
  return {
    map: m,
    getString: (k: string) => m.get(k),
    set: (k: string, v: string) => void m.set(k, v),
  };
};
