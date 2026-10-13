/**
 * «نسخة بيانات سَرد»: one JSON file with Sard tables (bookmarks, vocabulary,
 * tags, novel meta, highlights) and Sard settings; optional password
 * encryption (AES-256-GCM); daily/weekly auto backup into the app folder.
 * The app-lock PIN is never written to a backup.
 */
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as LegacyFS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import NativeFile from '@modules/native-file';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { ROOT_STORAGE } from '@utils/Storages';
import { db } from '@database/db';
import { ensureSardReaderTables, listHighlights } from '../reader/db';
import { SARD_READER_SETTINGS } from '../reader/settings';
import { dumpPlusTables, listBookmarks, listVocab, getAllNovelMeta, restorePlusTables, type PlusDump } from './db';
import { autoBackupStore, lockStore, PLUS_KEYS } from './store';
import { decryptJson, encryptJson, isEncryptedEnvelope } from './logic/crypto';
import { STATUS_LABELS } from './logic/library';
import { novelNames } from './data';

export const BACKUP_DIR = `${ROOT_STORAGE}/SardBackups`;
const EXCLUDED_KEYS = new Set([lockStore.key]);
export const BACKUP_SETTING_KEYS = [...PLUS_KEYS.filter(k => !EXCLUDED_KEYS.has(k)), SARD_READER_SETTINGS];

export interface SardBackup {
  sard: 'data-backup';
  v: 1;
  createdAt: string;
  settings: Record<string, string>;
  tables: PlusDump;
  highlights: Record<string, unknown>[];
}

export const buildBackup = async (): Promise<SardBackup> => {
  ensureSardReaderTables();
  const settings: Record<string, string> = {};
  for (const k of BACKUP_SETTING_KEYS) {
    const v = MMKVStorage.getString(k);
    if (v !== undefined) settings[k] = v;
  }
  return {
    sard: 'data-backup',
    v: 1,
    createdAt: new Date().toISOString(),
    settings,
    tables: await dumpPlusTables(),
    highlights: (await listHighlights({ sort: 'oldest' })) as unknown as Record<string, unknown>[],
  };
};

export const isSardBackup = (v: unknown): v is SardBackup => !!v && typeof v === 'object' && (v as SardBackup).sard === 'data-backup';

export const restoreBackup = async (b: SardBackup) => {
  if (!isSardBackup(b)) throw new Error('bad-format');
  for (const [k, v] of Object.entries(b.settings ?? {})) {
    if (BACKUP_SETTING_KEYS.includes(k) && typeof v === 'string') MMKVStorage.set(k, v);
  }
  await restorePlusTables(b.tables ?? {});
  ensureSardReaderTables();
  let highlights = 0;
  for (const h of b.highlights ?? []) {
    const cols = Object.keys(h).filter(c => /^[a-zA-Z]+$/.test(c));
    if (!cols.length) continue;
    const vals = cols.map(c => {
      const v = (h as any)[c];
      return typeof v === 'boolean' ? (v ? 1 : 0) : v;
    });
    await db.execute(`INSERT OR REPLACE INTO SardHighlight (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, vals as any);
    highlights++;
  }
  return {
    bookmarks: b.tables?.bookmarks?.length ?? 0,
    vocab: b.tables?.vocab?.length ?? 0,
    tags: b.tables?.tags?.length ?? 0,
    highlights,
  };
};

const randomBytes = (n: number) => Crypto.getRandomBytes(n);

/** Yields to the UI before running the (slow) scrypt step. */
const defer = <T>(fn: () => T) => new Promise<T>((res, rej) => setTimeout(() => {
  try {
    res(fn());
  } catch (e) {
    rej(e);
  }
}, 50));

export const serializeBackup = async (password?: string): Promise<string> => {
  const data = await buildBackup();
  if (!password) return JSON.stringify(data);
  return JSON.stringify(await defer(() => encryptJson(data, password, randomBytes)));
};

export const parseBackupText = async (text: string, password?: string): Promise<SardBackup> => {
  const parsed = JSON.parse(text);
  if (isEncryptedEnvelope(parsed)) {
    if (!password) throw new Error('needs-password');
    return defer(() => decryptJson<SardBackup>(parsed, password));
  }
  if (!isSardBackup(parsed)) throw new Error('bad-format');
  return parsed;
};

export const isEncryptedText = (text: string) => {
  try {
    return isEncryptedEnvelope(JSON.parse(text));
  } catch {
    return false;
  }
};

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

export const writeBackupFile = async (password?: string, prefix = 'sard-data'): Promise<string> => {
  await NativeFile.mkdir(BACKUP_DIR).catch(() => {});
  const path = `${BACKUP_DIR}/${prefix}-${stamp()}${password ? '.locked' : ''}.json`;
  await NativeFile.writeFile(path, await serializeBackup(password));
  return path;
};

export const shareFile = async (path: string, mimeType = 'application/json') => {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path.startsWith('file://') ? path : `file://${path}`, { mimeType });
  }
};

/** Opens the system picker and returns the file text (or null if cancelled). */
export const pickBackupText = async (): Promise<string | null> => {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  return LegacyFS.readAsStringAsync(res.assets[0].uri);
};

export const listBackupFiles = async () => {
  try {
    const items = await NativeFile.readDir(BACKUP_DIR);
    return items.filter(i => !i.isDirectory && i.name.endsWith('.json')).sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
};

/** Runs the auto backup when it is due; keeps the newest `keep` auto files. */
export const runAutoBackupIfDue = async (now = Date.now()): Promise<boolean> => {
  const s = autoBackupStore.get();
  if (!s.enabled) return false;
  const every = s.interval === 'daily' ? 86_400_000 : 7 * 86_400_000;
  if (s.lastAt && now - s.lastAt < every) return false;
  await writeBackupFile(undefined, 'sard-auto');
  autoBackupStore.set({ ...s, lastAt: now });
  const autos = (await listBackupFiles()).filter(f => f.name.startsWith('sard-auto-'));
  for (const old of autos.slice(Math.max(1, s.keep))) await NativeFile.unlink(old.path).catch(() => {});
  return true;
};

/** Bookmarks, vocabulary, ratings and notes as shareable Markdown. */
export const exportNotesMarkdown = async (ar = true): Promise<string> => {
  const [bookmarks, vocab, metas] = await Promise.all([listBookmarks(), listVocab(), getAllNovelMeta()]);
  const names = await novelNames([...metas.keys()]);
  const L = (a: string, e: string) => (ar ? a : e);
  const out: string[] = [`# ${L('ملاحظاتي في سَرد', 'My Sard notes')}`, ''];
  out.push(`## ${L('العلامات', 'Bookmarks')} (${bookmarks.length})`);
  for (const b of bookmarks) {
    out.push(`- **${b.novelName ?? ''}** — ${b.chapterName ?? ''} (${Math.round(b.progress * 100)}%)${b.note ? `\n  > ${b.note}` : ''}`);
  }
  out.push('', `## ${L('المفردات', 'Vocabulary')} (${vocab.length})`);
  for (const v of vocab) out.push(`- **${v.word}**${v.meaning ? `: ${v.meaning}` : ''}${v.sentence ? `\n  > ${v.sentence}` : ''}`);
  const rated = [...metas.values()].filter(m => m.rating || m.note || m.status);
  out.push('', `## ${L('التقييمات والملاحظات', 'Ratings & notes')} (${rated.length})`);
  for (const m of rated) {
    const stars = m.rating ? ' ' + '★'.repeat(m.rating) : '';
    const status = m.status ? ` · ${STATUS_LABELS[m.status][ar ? 'ar' : 'en']}` : '';
    out.push(`- **${names.get(m.novelId) ?? '#' + m.novelId}**${stars}${status}${m.note ? `\n  > ${m.note}` : ''}`);
  }
  return out.join('\n');
};
