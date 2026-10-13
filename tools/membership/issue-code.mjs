#!/usr/bin/env node
/**
 * Issues a signed Sard membership code (works offline in the app).
 *   node tools/membership/issue-code.mjs <plus|pro|legend> <days|lifetime> [deviceId]
 *     [--key <private.pem>] [--issuer owner|general_manager|membership_manager] [--admin] [--json]
 * deviceId = the "معرّف الجهاز" shown in the app's membership screen (binds the code to that phone).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES, signCode } from './codec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = name => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const bool = name => {
  const i = argv.indexOf(name);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
};
const keyPath = flag('--key') || process.env.SARD_MEMBERSHIP_KEY
  || path.resolve(here, '../../../../work/keys/membership-private.pem');
const issuerName = flag('--issuer') || 'owner';
const admin = bool('--admin');
const asJson = bool('--json');
const [tier, duration, device] = argv;
const usage = () => {
  console.error('usage: issue-code.mjs <plus|pro|legend> <days|lifetime> [deviceId] [--key file] [--issuer role] [--admin] [--json]');
  process.exit(2);
};
if (!['plus', 'pro', 'legend'].includes(tier) || !duration) usage();
const days = duration === 'lifetime' ? 0 : Number(duration);
if (!Number.isInteger(days) || days < 1 && duration !== 'lifetime' || days > 65535) usage();
const issuer = ROLES.indexOf(issuerName);
if (issuer < 0) usage();
if (!fs.existsSync(keyPath)) {
  console.error(`private key not found: ${keyPath} (run keygen.mjs first)`);
  process.exit(1);
}
const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
const codeId = crypto.randomBytes(4).readUInt32BE(0);
const issuedAt = Math.floor(Date.now() / 1000);
const code = signCode(privateKey, { tier, issuer, admin, codeId, issuedAt, days, device });
if (asJson) {
  console.log(JSON.stringify({ code, tier, days, lifetime: days === 0, device: device || null,
    codeId: codeId.toString(16).padStart(8, '0'), issuedAt, issuer: issuerName }));
} else {
  console.log(code);
  console.error(`tier=${tier} ${days ? days + ' days' : 'lifetime'}${device ? ' device=' + device : ' (any device)'} codeId=${codeId.toString(16).padStart(8, '0')}`);
}
