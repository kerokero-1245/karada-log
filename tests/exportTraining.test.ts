/**
 * F4 で記録したトレーニングが、F10 の書き出しに既存の「#### トレーニング」の形で出る。
 *
 * トレ画面の保存（lib/training.ts の saveExerciseRecord）が書く行を受け取り、
 * そのまま書き出し（lib/exportMarkdown.ts の buildMarkdown）に渡す。
 * 重量はバー種別とプレートの内訳つきで出ること（原則2）、判定（達成 / 据え置き）とメモが出ることを確かめる。
 * Node には IndexedDB が無いので、db の書き込み口を差し替えて書かれた行を拾う。値は架空のサンプル。
 */
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/db.ts';
import type { Exercise, SessionExercise, SetRecord, Settings, TrainingSession } from '../src/db/types.ts';
import { buildMarkdown } from '../src/lib/exportMarkdown.ts';
import { saveExerciseRecord } from '../src/lib/training.ts';

const originals: { target: object; key: string; value: unknown }[] = [];
function stub(target: object, key: string, value: (...args: unknown[]) => unknown) {
  originals.push({ target, key, value: (target as Record<string, unknown>)[key] });
  (target as Record<string, unknown>)[key] = value;
}

let addedItems: SessionExercise[] = [];
let addedSets: SetRecord[] = [];
let exerciseUpdates: unknown[] = [];

beforeEach(() => {
  addedItems = [];
  addedSets = [];
  exerciseUpdates = [];
  stub(db, 'transaction', async (...args: unknown[]) => (args[args.length - 1] as () => Promise<unknown>)());
  stub(db.sessionExercises, 'where', () => ({ equals: () => ({ count: async () => addedItems.length }) }));
  stub(db.sessionExercises, 'add', async (item: unknown) => {
    addedItems.push({ ...(item as SessionExercise), id: 100 + addedItems.length });
    return 100 + addedItems.length - 1;
  });
  stub(db.setRecords, 'bulkAdd', async (rows: unknown) => {
    addedSets.push(...(rows as SetRecord[]));
    return 0;
  });
  stub(db.exercises, 'update', async (...args: unknown[]) => {
    exerciseUpdates.push(args);
    return 1;
  });
});

afterEach(() => {
  while (originals.length > 0) {
    const o = originals.pop()!;
    (o.target as Record<string, unknown>)[o.key] = o.value;
  }
});

const bench: Exercise = {
  id: 1,
  menu: 'A',
  name: 'ベンチプレス',
  kind: 'weight_reps',
  order: 1,
  current: { load: { style: 'barbell', barType: 'short', plateKgPerSide: 12.5 }, reps: 10, seconds: null },
  next: { load: { style: 'barbell', barType: 'short', plateKgPerSide: 13.75 }, reps: 10, seconds: null },
  sets: 3,
  progression: { metric: 'weight', amount: 2.5, basis: 'total' },
  verified: true,
  note: '',
  active: true,
};

const settings = {
  id: 1,
  bmrKcal: 1500,
  restDayKcal: 2000,
  gymDayKcal: 2200,
  proteinTargetG: 130,
  proteinCapG: 150,
  fatTargetG: 50,
  saltLimitG: 7,
  weeklySaltAverageG: 6,
  weeklyKcalTarget: 14600,
  weeklyKcalTolerance: 300,
  trainingPerWeek: 3,
  weekStartsOn: 1,
  dayBoundaryHour: 4,
  goal: { fatMassKg: 12, leanMassKg: 55, targetDate: '2026-12-31', label: '年末' },
  alerts: { lowFatDayG: 20 },
} as unknown as Settings;

test('トレ画面で保存した種目が、書き出しの「#### トレーニング」に内訳・回数・判定・メモつきで出る', async () => {
  const planned = bench.next!;
  const result = await saveExerciseRecord({
    sessionId: 7,
    exercise: bench,
    planned,
    load: planned.load,
    sets: [
      { reps: 10, seconds: null },
      { reps: 10, seconds: null },
      { reps: 10, seconds: null },
    ],
    note: '順番が1番目',
    existing: null,
  });
  assert.equal(result.outcome, 'achieved');
  // 重量はバー種別 + プレートのまま保存されている（合計の数値だけにしない）
  assert.deepEqual(addedItems[0].load, { style: 'barbell', barType: 'short', plateKgPerSide: 13.75 });
  assert.equal(exerciseUpdates.length, 1);

  const session: TrainingSession = {
    id: 7,
    menu: 'A',
    startedAt: '2026-10-09T18:30',
    startedAtIsEstimated: false,
    logDate: '2026-10-09',
    note: '',
  };
  const markdown = buildMarkdown({
    range: { start: '2026-10-09', end: '2026-10-09' },
    generatedAt: '2026-10-09T21:00',
    settings,
    days: [
      {
        logDate: '2026-10-09',
        dayType: 'gym',
        entries: [],
        sessions: [{ session, items: [{ item: addedItems[0], sets: addedSets }] }],
      },
    ],
    bodies: [],
    bodiesOutOfRange: false,
    pendingTexts: [],
  });

  const lines = markdown.split('\n');
  const head = lines.indexOf('#### トレーニング A（押す） 18:30 開始');
  assert.ok(head >= 0, '「#### トレーニング A（押す） 18:30 開始」が無い');
  assert.deepEqual(lines.slice(head + 2, head + 4), [
    '- ベンチプレス 37.5kg（ショートバー10kg + 13.75kg×2）× 10,10,10 → 達成',
    '  - メモ: 順番が1番目',
  ]);
});
