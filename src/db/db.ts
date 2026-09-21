/**
 * Dexie（IndexedDB）スキーマ。
 * データは端末内のみ。サーバーには出さない。
 *
 * インデックスは「実際に使う検索軸」だけ張る:
 *  - 論理日付での抽出（ダッシュボード・週次サマリー）
 *  - 使用頻度順の食品一覧（F2）
 *  - 機種ごとの体組成グルーピング（F5）
 */
import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyComposition,
  BoneDensity,
  DayMeta,
  Exercise,
  Food,
  MealEntry,
  SessionExercise,
  SetRecord,
  Settings,
  ShortcutSet,
  Supplement,
  TrainingSession,
} from './types';

export type KaradaLogDB = Dexie & {
  foods: EntityTable<Food, 'id'>;
  mealEntries: EntityTable<MealEntry, 'id'>;
  shortcutSets: EntityTable<ShortcutSet, 'id'>;
  dayMeta: EntityTable<DayMeta, 'logDate'>;
  exercises: EntityTable<Exercise, 'id'>;
  trainingSessions: EntityTable<TrainingSession, 'id'>;
  sessionExercises: EntityTable<SessionExercise, 'id'>;
  setRecords: EntityTable<SetRecord, 'id'>;
  bodyCompositions: EntityTable<BodyComposition, 'id'>;
  boneDensities: EntityTable<BoneDensity, 'id'>;
  supplements: EntityTable<Supplement, 'id'>;
  settings: EntityTable<Settings, 'id'>;
};

export const db = new Dexie('karada-log') as KaradaLogDB;

db.version(1).stores({
  // 頻度順表示のため useCount、バリアントの束ね表示のため variantGroupId
  foods: '++id, name, category, variantGroupId, useCount',
  // 日ごとの集計と、時刻順の並べ替え
  mealEntries: '++id, logDate, recordedAt, foodId, [logDate+recordedAt]',
  shortcutSets: '++id, order',
  // 論理日付そのものが主キー（1日1行）
  dayMeta: 'logDate, dayType',
  exercises: '++id, menu, [menu+order], name',
  trainingSessions: '++id, logDate, startedAt, menu',
  sessionExercises: '++id, sessionId, exerciseId, [sessionId+order]',
  setRecords: '++id, sessionExerciseId, [sessionExerciseId+setNo]',
  // 機種でグルーピングして時系列に並べる
  bodyCompositions: '++id, measuredAt, device, [device+measuredAt]',
  boneDensities: '++id, measuredAt, device',
  supplements: '++id, name',
  // 単一行（id=1）
  settings: 'id',
  // 注: boolean は IndexedDB のキーにできないため archived / active には索引を張らない
});
