/**
 * 保存処理の入口で、時刻なしの日時を弾く。
 *
 * <input type="time"> は消すと '' になり、そのまま isoDateTimeIn に渡ると
 * '2026-10-05T' のような時刻なしの日時が保存されてしまう。画面側でもボタンを止めているが、
 * 保存処理（lib/meals.ts・lib/quickRecord.ts）でも弾くことをここで確かめる。
 *
 * Node には IndexedDB が無いので、db の書き込み口を差し替えて「書き込みに進んだか」だけを見る。
 */
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/db.ts';
import type { Food, MealEntry } from '../src/db/types.ts';
import { addMealEntries, assertTime, updateMealEntry } from '../src/lib/meals.ts';
import { addEntryPlans, addPendingPlans } from '../src/lib/quickRecord.ts';
import type { QuickEntryPlan, QuickPendingPlan } from '../src/lib/quickRecord.ts';

const TIME_ERROR = /時刻が入っていません/;

const food: Food = {
  id: 1,
  name: 'サンプル食品',
  unitLabel: '1個',
  gramsPerUnit: null,
  per: { kcal: 100, proteinG: 10, fatG: 1, carbG: 1, saltG: 0.1 },
  source: 'label',
  basis: { label: '1個あたり', unitsPerBasis: 1 },
  category: 'その他',
  note: '',
  aliases: [],
  variantGroupId: null,
  variantLabel: null,
  useCount: 0,
  lastUsedAt: null,
  archived: false,
  createdAt: '2026-10-05T12:00',
  updatedAt: '2026-10-05T12:00',
} as Food;

/** 書き込みに進んだ呼び出しの記録 */
let writes: string[] = [];
const originals: { target: object; key: string; value: unknown }[] = [];

function stub(target: object, key: string, value: (...args: unknown[]) => unknown) {
  originals.push({ target, key, value: (target as Record<string, unknown>)[key] });
  (target as Record<string, unknown>)[key] = value;
}

beforeEach(() => {
  writes = [];
  stub(db, 'transaction', async (...args: unknown[]) => {
    writes.push('transaction');
    const scope = args[args.length - 1] as () => Promise<unknown>;
    return scope();
  });
  stub(db.mealEntries, 'add', async () => {
    writes.push('mealEntries.add');
    return 10;
  });
  stub(db.mealEntries, 'update', async () => {
    writes.push('mealEntries.update');
    return 1;
  });
  stub(db.foods, 'get', async () => food);
  stub(db.foods, 'add', async () => {
    writes.push('foods.add');
    return 2;
  });
  stub(db.foods, 'update', async () => {
    writes.push('foods.update');
    return 1;
  });
  stub(db.pendingTexts, 'bulkAdd', async () => {
    writes.push('pendingTexts.bulkAdd');
    return 1;
  });
});

afterEach(() => {
  while (originals.length > 0) {
    const { target, key, value } = originals.pop()!;
    (target as Record<string, unknown>)[key] = value;
  }
});

test('assertTime: HH:mm 以外は弾く', () => {
  assert.doesNotThrow(() => assertTime('08:30'));
  assert.throws(() => assertTime(''), TIME_ERROR);
  assert.throws(() => assertTime('8:30'), TIME_ERROR);
  assert.throws(() => assertTime('--:--'), TIME_ERROR);
});

test('meals.addMealEntries: 時刻が空なら書き込まずに弾く', async () => {
  await assert.rejects(
    addMealEntries('2026-10-05', [{ food, quantity: 1, time: '' }], null, 4),
    TIME_ERROR,
  );
  // 1 件でも空があれば、ほかの行も書かない
  await assert.rejects(
    addMealEntries(
      '2026-10-05',
      [
        { food, quantity: 1, time: '08:00' },
        { food, quantity: 1, time: '' },
      ],
      null,
      4,
    ),
    TIME_ERROR,
  );
  assert.deepEqual(writes, []);
});

test('meals.addMealEntries: 時刻があれば時刻つきの日時で保存に進む', async () => {
  let saved: MealEntry | null = null;
  stub(db.mealEntries, 'add', async (...args: unknown[]) => {
    saved = args[0] as MealEntry;
    return 10;
  });
  await addMealEntries('2026-10-05', [{ food, quantity: 1, time: '08:30' }], null, 4);
  assert.equal((saved as MealEntry | null)?.recordedAt, '2026-10-05T08:30');
});

test('meals.updateMealEntry: 時刻が空なら書き込まずに弾く', async () => {
  const entry = {
    id: 5,
    foodId: 1,
    quantity: 1,
    recordedAt: '2026-10-05T08:30',
    logDate: '2026-10-05',
    snapshot: { name: 'サンプル食品', unitLabel: '1個', per: food.per },
    fromShortcutSetId: null,
    note: '',
  } as unknown as MealEntry;
  await assert.rejects(updateMealEntry(entry, 2, '', 4), TIME_ERROR);
  assert.deepEqual(writes, []);

  await updateMealEntry(entry, 2, '09:00', 4);
  assert.deepEqual(writes, ['mealEntries.update']);
});

test('quickRecord.addEntryPlans: 時刻が空なら推定食品も作らずに弾く', async () => {
  const plans = [
    { food: null, draft: { ...food, id: undefined }, quantity: 1, time: '', raw: '推定の品', manual: false, learnText: '' },
  ] as unknown as QuickEntryPlan[];
  await assert.rejects(addEntryPlans('2026-10-05', plans, 4), TIME_ERROR);
  assert.deepEqual(writes, []);
});

test('quickRecord.addEntryPlans: 時刻があれば保存に進む', async () => {
  const plans = [
    { food, draft: null, quantity: 1, time: '12:00', raw: 'サンプル', manual: false, learnText: '' },
  ] as unknown as QuickEntryPlan[];
  const result = await addEntryPlans('2026-10-05', plans, 4);
  assert.equal(result.added, 1);
  assert.ok(writes.includes('mealEntries.add'));
});

test('quickRecord.addPendingPlans: 時刻が空なら書き込まずに弾く', async () => {
  const pending = [{ raw: '分からない品', reason: '候補なし', time: '' }] as unknown as QuickPendingPlan[];
  await assert.rejects(addPendingPlans('2026-10-05', pending, 4), TIME_ERROR);
  assert.deepEqual(writes, []);

  const ok = [{ raw: '分からない品', reason: '候補なし', time: '21:30' }] as unknown as QuickPendingPlan[];
  await addPendingPlans('2026-10-05', ok, 4);
  assert.deepEqual(writes, ['pendingTexts.bulkAdd']);
});
