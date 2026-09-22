/**
 * F10: 全データの JSON バックアップと復元。
 *
 * 端末が壊れたとき・機種を変えたときに、記録を丸ごと持ち運ぶためのもの。
 * 形は素直な「テーブル名 → 行の配列」。将来スキーマが増えたら formatVersion を上げる。
 *
 * ★ API キーはバックアップに入れない。★
 *   キーは端末の中だけに置く約束（lib/apiKey.ts）。ファイルにして持ち出せる形にすると
 *   その約束が崩れる。復元でも上書きせず、今の端末の値をそのまま残す。
 */
import { db } from '../db/db';
import type { IsoDateTime, Settings } from '../db/types';
import { apiKeyOf } from './apiKey';
import { toIsoDateTime } from './date';

export const BACKUP_APP = 'karada-log';
export const BACKUP_FORMAT_VERSION = 1;

/** 書き出す順。JSON のキーの並びもこの順になる */
export const BACKUP_TABLES = [
  'foods',
  'mealEntries',
  'shortcutSets',
  'dayMeta',
  'exercises',
  'trainingSessions',
  'sessionExercises',
  'setRecords',
  'bodyCompositions',
  'boneDensities',
  'supplements',
  'pendingTexts',
  'settings',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export const BACKUP_TABLE_LABELS: Record<BackupTable, string> = {
  foods: '食品マスタ',
  mealEntries: '食事記録',
  shortcutSets: '固定ベース',
  dayMeta: '日の区分',
  exercises: '種目マスタ',
  trainingSessions: 'トレ記録',
  sessionExercises: 'トレ種目',
  setRecords: 'セット記録',
  bodyCompositions: '体組成',
  boneDensities: '骨密度',
  supplements: 'サプリ',
  pendingTexts: '未処理テキスト',
  settings: '設定',
};

export interface BackupFile {
  app: string;
  formatVersion: number;
  exportedAt: IsoDateTime;
  seedVersion: number;
  tables: Record<BackupTable, unknown[]>;
}

export interface BackupCount {
  table: BackupTable;
  label: string;
  count: number;
  /** ファイルにこのテーブルが無かった（空として扱う） */
  missing: boolean;
}

export type ParsedBackup =
  | { ok: true; backup: BackupFile; counts: BackupCount[] }
  | { ok: false; reason: string };

/* ------------------------------------------------------------------ */
/* 書き出し                                                             */
/* ------------------------------------------------------------------ */

/** 設定行から API キーを落とす。ファイルにキーを載せない */
function stripApiKey(row: Settings): Settings {
  const copy = { ...row };
  delete copy.anthropicApiKey;
  return copy;
}

export async function buildBackup(): Promise<BackupFile> {
  const tables = {} as Record<BackupTable, unknown[]>;
  for (const name of BACKUP_TABLES) {
    tables[name] = await db.table(name).toArray();
  }
  tables.settings = (tables.settings as Settings[]).map(stripApiKey);

  const current = await db.settings.get(1);
  return {
    app: BACKUP_APP,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: toIsoDateTime(new Date()),
    seedVersion: current?.seedVersion ?? 0,
    tables,
  };
}

/** ファイル名。'karada-log-backup-20260922.json' */
export function backupFileName(at: Date = new Date()): string {
  return `karada-log-backup-${toIsoDateTime(at).slice(0, 10).replace(/-/g, '')}.json`;
}

/* ------------------------------------------------------------------ */
/* 読み込みの検証                                                        */
/* ------------------------------------------------------------------ */

/**
 * 壊れたファイル・別アプリのファイル・新しすぎる形式は、ここで弾く。
 * 中途半端に読み込んで記録を壊すより、読めないと言い切るほうがよい。
 */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = undefined;
  }
  if (raw === undefined) return { ok: false, reason: 'JSON として読み取れません' };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'JSON として読み取れません' };
  }

  const value = raw as Record<string, unknown>;
  if (value.app !== BACKUP_APP) {
    return { ok: false, reason: 'karada-log のバックアップではありません' };
  }

  const formatVersion = value.formatVersion;
  if (typeof formatVersion !== 'number' || !Number.isFinite(formatVersion)) {
    return { ok: false, reason: '形式のバージョンが書かれていません' };
  }
  if (formatVersion > BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      reason: `このアプリより新しい形式です（形式 ${formatVersion} / このアプリは ${BACKUP_FORMAT_VERSION} まで）`,
    };
  }

  const tablesValue = value.tables;
  if (typeof tablesValue !== 'object' || tablesValue === null || Array.isArray(tablesValue)) {
    return { ok: false, reason: 'tables がありません' };
  }
  const source = tablesValue as Record<string, unknown>;

  const tables = {} as Record<BackupTable, unknown[]>;
  const counts: BackupCount[] = [];
  for (const name of BACKUP_TABLES) {
    const rows = source[name];
    if (rows === undefined) {
      tables[name] = [];
      counts.push({ table: name, label: BACKUP_TABLE_LABELS[name], count: 0, missing: true });
      continue;
    }
    if (!Array.isArray(rows)) {
      return { ok: false, reason: `tables.${name} が配列ではありません` };
    }
    tables[name] = rows;
    counts.push({ table: name, label: BACKUP_TABLE_LABELS[name], count: rows.length, missing: false });
  }

  const exportedAt = typeof value.exportedAt === 'string' ? value.exportedAt : '';
  const seedVersion = typeof value.seedVersion === 'number' ? value.seedVersion : 0;

  return {
    ok: true,
    backup: { app: BACKUP_APP, formatVersion, exportedAt, seedVersion, tables },
    counts,
  };
}

/* ------------------------------------------------------------------ */
/* 復元                                                                 */
/* ------------------------------------------------------------------ */

export interface RestoreResult {
  restored: Record<BackupTable, number>;
  /** 端末に残っていた API キーを戻したか */
  keptApiKey: boolean;
  /** ファイルに設定行が無かったので、今の設定を残したか */
  keptCurrentSettings: boolean;
}

/**
 * 1トランザクションで全テーブルを空にしてから入れ直す。
 * 途中で止まっても中途半端な状態にならないように、必ず同じ transaction の中で行う。
 *
 * API キーだけは、ファイルの内容ではなく **今の端末の値** を書き戻す。
 * 設定行がファイルに無かった場合は、今の設定行を残す（設定が消えるとアプリが開けない）。
 */
export async function restoreBackup(backup: BackupFile): Promise<RestoreResult> {
  const before = await db.settings.get(1);
  const currentKey = apiKeyOf(before);
  const fallbackSettings = before ? stripApiKey(before) : null;

  const restored = {} as Record<BackupTable, number>;
  let keptCurrentSettings = false;

  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
    }
    for (const name of BACKUP_TABLES) {
      const rows = backup.tables[name] ?? [];
      restored[name] = rows.length;
      if (rows.length > 0) await db.table(name).bulkAdd(rows);
    }

    if ((await db.settings.count()) === 0 && fallbackSettings !== null) {
      await db.settings.put(fallbackSettings);
      keptCurrentSettings = true;
    }

    // キーは復元の対象外。今の端末の値に戻す
    for (const row of await db.settings.toArray()) {
      await db.settings.update(row.id, { anthropicApiKey: currentKey });
    }
  });

  return { restored, keptApiKey: currentKey !== null, keptCurrentSettings };
}
