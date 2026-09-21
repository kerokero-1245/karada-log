/**
 * 初期データ投入を「アプリの起動につき1回だけ」にする。
 *
 * React StrictMode は開発時に effect を2回走らせる。seedIfEmpty 自体も
 * Settings.seedVersion で冪等だが、同時に2本走ると両方が「まだ空」と判断して
 * 二重投入になりうる。Promise を共有して直列化する。
 */
import { seedIfEmpty, type SeedResult } from '../db/seed';

let pending: Promise<SeedResult> | null = null;

export function ensureSeed(): Promise<SeedResult> {
  if (!pending) {
    pending = seedIfEmpty().catch((error) => {
      // 失敗したら次の呼び出しでやり直せるようにする
      pending = null;
      throw error;
    });
  }
  return pending;
}
