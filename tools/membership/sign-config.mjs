#!/usr/bin/env node
/**
 * Signs a Sard remote-config JSON (feature kill switches, revoked codes).
 *   node tools/membership/sign-config.mjs <config.json> [--key <private.pem>] > signed.json
 * Input shape: { "v":1, "issuedAt": <unix s>, "expiresAt"?: <unix s>,
 *   "flags": { "<feature.key>": false, ... }, "killAll"?: false,
 *   "revokedCodeIds"?: ["0a1b2c3d"], "message"?: { "ar": "...", "en": "..." } }
 * The app accepts it via More → Membership → "Remote config" (paste/file) and only
 * if the signature matches the embedded public key.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signConfig } from './codec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const i = argv.indexOf('--key');
const keyPath = i >= 0 ? argv.splice(i, 2)[1] : process.env.SARD_MEMBERSHIP_KEY
  || path.resolve(here, '../../../../work/keys/membership-private.pem');
const file = argv[0];
if (!file) { console.error('usage: sign-config.mjs <config.json> [--key file]'); process.exit(2); }
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!config.issuedAt) config.issuedAt = Math.floor(Date.now() / 1000);
if (!config.v) config.v = 1;
const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
process.stdout.write(JSON.stringify(signConfig(privateKey, config), null, 2) + '\n');
