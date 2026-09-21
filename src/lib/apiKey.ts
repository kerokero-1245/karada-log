/**
 * Claude API キーの出し入れ。
 *
 * キーは Settings（IndexedDB）の中だけに置く。端末から出さない。
 * 画面に出すときは末尾4文字だけにして、全体は二度と表示しない。
 */
import { db } from '../db/db';
import type { Settings } from '../db/types';
import { toIsoDateTime } from './date';

/** 設定からキーを取り出す。未設定・空文字はすべて null に寄せる */
export function apiKeyOf(settings: Settings | undefined | null): string | null {
  const key = settings?.anthropicApiKey ?? null;
  if (key === null) return null;
  const trimmed = key.trim();
  return trimmed === '' ? null : trimmed;
}

/** 表示用。末尾4文字だけ見せる */
export function maskApiKey(key: string): string {
  const tail = key.slice(-4);
  return `••••••••${tail}`;
}

export async function saveApiKey(key: string): Promise<void> {
  await db.settings.update(1, {
    anthropicApiKey: key.trim(),
    updatedAt: toIsoDateTime(new Date()),
  });
}

export async function clearApiKey(): Promise<void> {
  await db.settings.update(1, {
    anthropicApiKey: null,
    updatedAt: toIsoDateTime(new Date()),
  });
}
