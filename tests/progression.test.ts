/**
 * F4 の進捗ルール（lib/progression.ts）。
 *
 * 「3セットとも規定回数に届いたときだけ次回上げる。1セットでも落ちたら据え置き」
 * （handover §5）を取り違えると、届いていないのに重量を上げる提案が出て、
 * 次回さらに届かない → カロリー不足と誤判定する、という連鎖になる。境界をここで固定する。
 * 値は架空のサンプル（seed と同じ形）で、実測値は使わない。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeJudgement,
  isSetAchieved,
  judgeProgress,
  nextWeight,
  suggestNext,
} from '../src/lib/progression.ts';
import type { JudgeTarget, SetInput } from '../src/lib/progression.ts';
import type { ExerciseTarget, Progression } from '../src/db/types.ts';

const repsTarget: JudgeTarget = { kind: 'weight_reps', sets: 3, reps: 10, seconds: null };
const timedTarget: JudgeTarget = { kind: 'timed', sets: 3, reps: null, seconds: 40 };
const r = (reps: number | null): SetInput => ({ reps, seconds: null });
const s = (seconds: number | null): SetInput => ({ reps: null, seconds });

test('3セットとも規定回数ちょうど（10,10,10）なら達成', () => {
  assert.equal(judgeProgress([r(10), r(10), r(10)], repsTarget), 'achieved');
});

test('3セット中2セットだけ規定回数（10,10,9）なら据え置き', () => {
  assert.equal(judgeProgress([r(10), r(10), r(9)], repsTarget), 'held');
});

test('規定回数に届いていても2セットしか入っていなければ据え置き', () => {
  assert.equal(judgeProgress([r(10), r(10)], repsTarget), 'held');
});

test('セットが1つも入っていなければ判定しない（unknown）', () => {
  assert.equal(judgeProgress([], repsTarget), 'unknown');
  assert.equal(judgeProgress([r(null), r(null)], repsTarget), 'unknown');
});

test('時間ベースの種目は秒数で判定する（40,40,40 は達成 / 40,40,39 は据え置き）', () => {
  assert.equal(judgeProgress([s(40), s(40), s(40)], timedTarget), 'achieved');
  assert.equal(judgeProgress([s(40), s(40), s(39)], timedTarget), 'held');
  // 回数が入っていても時間種目では読まない
  assert.equal(judgeProgress([r(10), r(10), r(10)], timedTarget), 'unknown');
});

test('限界までの種目は判定しない', () => {
  const amrap: JudgeTarget = { kind: 'amrap', sets: 3, reps: null, seconds: null };
  assert.equal(judgeProgress([r(12), r(10), r(8)], amrap), 'unknown');
  assert.equal(isSetAchieved(r(12), amrap), null);
});

test('セット単位の達成フラグ: 規定ちょうどは達成、1回足りなければ未到達', () => {
  assert.equal(isSetAchieved(r(10), repsTarget), true);
  assert.equal(isSetAchieved(r(9), repsTarget), false);
  assert.equal(isSetAchieved(r(null), repsTarget), null);
});

test('nextWeight: 増分を足す。増分 0 なら同じ重量', () => {
  assert.equal(nextWeight(80, 3.5), 83.5);
  assert.equal(nextWeight(35, 2.5), 37.5);
  assert.equal(nextWeight(40, 0), 40);
  assert.equal(nextWeight(0.1, 0.2), 0.3);
});

const benchUsed: ExerciseTarget = {
  load: { style: 'barbell', barType: 'short', plateKgPerSide: 12.5 },
  reps: 10,
  seconds: null,
};
const plus2_5: Progression = { metric: 'weight', amount: 2.5, basis: 'total' };

test('suggestNext: 達成ならバー種別を保ったままプレートを片側 増分/2 足す', () => {
  const next = suggestNext(benchUsed, 'achieved', plus2_5);
  assert.deepEqual(next.load, { style: 'barbell', barType: 'short', plateKgPerSide: 13.75 });
});

test('suggestNext: 据え置きなら同じ設定のまま', () => {
  assert.deepEqual(suggestNext(benchUsed, 'held', plus2_5), benchUsed);
});

test('suggestNext: 時間種目は秒数を足し、重量は変えない', () => {
  const used: ExerciseTarget = { load: { style: 'dumbbell', kgPerHand: 16, hands: 2 }, reps: null, seconds: 40 };
  const next = suggestNext(used, 'achieved', { metric: 'seconds', amount: 5, basis: 'total' });
  assert.equal(next.seconds, 45);
  assert.deepEqual(next.load, used.load);
});

test('describeJudgement: 達成は「次回 +○kg」、届かなければ「据え置き」', () => {
  assert.equal(describeJudgement('achieved', plus2_5, benchUsed, 'weight_reps'), '次回 +2.5kg（37.5kg）');
  assert.equal(describeJudgement('held', plus2_5, benchUsed, 'weight_reps'), '据え置き（次回も 35kg）');
});

test('describeJudgement: 増分 0 の達成は重量を上げない言い方にする', () => {
  const zero: Progression = { metric: 'weight', amount: 0, basis: 'total' };
  assert.equal(
    describeJudgement('achieved', zero, benchUsed, 'weight_reps'),
    '規定に届きました（増分が 0 なので次回も同じ設定）',
  );
});
