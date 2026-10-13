#!/usr/bin/env node
/**
 * Generates the owner Ed25519 keypair for Sard membership codes.
 *   node tools/membership/keygen.mjs [--out <private.pem>] [--force]
 * Default private key path: <project>/work/keys/membership-private.pem (never commit it).
 * Prints the public key hex to paste into src/sard/membership/publicKey.ts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1]
  : process.env.SARD_MEMBERSHIP_KEY
  || path.resolve(here, '../../../../work/keys/membership-private.pem');
if (fs.existsSync(out) && !args.includes('--force')) {
  console.error(`refusing to overwrite ${out} (use --force; every issued code would stop working)`);
  process.exit(1);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
console.log(`private key → ${out}`);
console.log(`public key (hex) → ${raw.toString('hex')}`);
