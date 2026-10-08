/**
 * F4: 進捗ルールの自動判定（純関数）。
 *
 * ルール（app-spec-prompt.md F4 / handover §5「進捗ルール」）:
 *  - 規定のセット数（通常3）すべてで規定回数（通常10）に届いた → 次回 +増分 を提案
 *  - 1セットでも届かなかった、またはセット数が足りない → 据え置き
 *  - 時間ベースの種目（ファーマーズウォーク等）は回数ではなく秒数で同じ判定をする
 *  - 限界まで（アブローラー等）は進捗判定をしない
 *
 * 文言のルール: 届かなかったときは「据え置き」とだけ言う。否定的な語は使わない。
 * DB も React も触らない。
 */
import type { ExerciseKind, ExerciseOutcome, ExerciseTarget, Progression } from '../db/types';
import { applyProgression, applySecondsProgression, describeLoadShort } from './weight';

/** 1セットぶんの入力。回数か秒数のどちらか。未入力は null */
export interface SetInput {
  reps: number | null;
  seconds: number | null;
}

/** 判定に使う規定値 */
export interface JudgeTarget {
  kind: ExerciseKind;
  /** 規定のセット数。通常3 */
  sets: number;
  /** 規定回数。時間ベース・限界まで は null */
  reps: number | null;
  /** 時間ベースの規定秒数 */
  seconds: number | null;
}

/** 規定回数の既定値（ExerciseTarget.reps が無いとき） */
export const DEFAULT_TARGET_REPS = 10;

/** そのセットの値（回数 or 秒数）。種目の種類で読む側を決める */
export function setValue(set: SetInput, kind: ExerciseKind): number | null {
  return kind === 'timed' ? set.seconds : set.reps;
}

/** 規定値（回数 or 秒数） */
export function targetValue(target: JudgeTarget): number | null {
  if (target.kind === 'timed') return target.seconds;
  if (target.kind === 'amrap') return null;
  return target.reps ?? DEFAULT_TARGET_REPS;
}

/**
 * 1セットが規定に届いたか。
 * 限界まで の種目、規定値が無い、値が未入力のときは null（判定しない）。
 */
export function isSetAchieved(set: SetInput, target: JudgeTarget): boolean | null {
  const goal = targetValue(target);
  const value = setValue(set, target.kind);
  if (goal === null || value === null) return null;
  return value >= goal;
}

/**
 * 種目の結果を判定する。
 *  - 'achieved' … 規定セット数すべてで規定値に届いた
 *  - 'held'     … 1セットでも届かなかった、または入力されたセットが規定セット数より少ない
 *  - 'unknown'  … 判定しない（限界まで の種目 / 1セットも入力が無い）
 */
export function judgeProgress(sets: SetInput[], target: JudgeTarget): ExerciseOutcome {
  if (target.kind === 'amrap' || targetValue(target) === null) return 'unknown';
  const results = sets.map((set) => isSetAchieved(set, target)).filter((r): r is boolean => r !== null);
  if (results.length === 0) return 'unknown';
  if (results.some((r) => !r)) return 'held';
  return results.length >= target.sets ? 'achieved' : 'held';
}

/** 次回の重量 = 今回 + 増分。小数第2位で丸める（1.25kg プレートを扱うため） */
export function nextWeight(current: number, increment: number): number {
  return Math.round((current + increment) * 100) / 100;
}

/**
 * 判定から次回の設定を作る。達成なら増分を当て、それ以外は今回と同じ（据え置き）。
 * 重量はバー種別とプレートの組（LoadSpec）のまま上げる（原則2）。
 */
export function suggestNext(
  used: ExerciseTarget,
  outcome: ExerciseOutcome,
  progression: Progression | null,
): ExerciseTarget {
  if (outcome !== 'achieved' || !progression) return { ...used };
  if (progression.metric === 'seconds') {
    return { ...used, seconds: applySecondsProgression(used.seconds, progression) };
  }
  return { ...used, load: applyProgression(used.load, progression) };
}

/** 判定の表示。'次回 +2.5kg（37.5kg）' / '据え置き（次回も 35kg）' など */
export function describeJudgement(
  outcome: ExerciseOutcome,
  progression: Progression | null,
  used: ExerciseTarget,
  kind: ExerciseKind,
): string {
  if (kind === 'amrap') return '限界までの種目なので判定はしません';
  if (outcome === 'unknown') return 'セットを入れると判定します';
  const next = suggestNext(used, outcome, progression);
  if (outcome === 'held') {
    return kind === 'timed'
      ? `据え置き（次回も ${used.seconds ?? '—'}秒）`
      : `据え置き（次回も ${describeLoadShort(used.load)}）`;
  }
  if (!progression || progression.amount === 0) {
    return '規定に届きました（増分が 0 なので次回も同じ設定）';
  }
  if (progression.metric === 'seconds') {
    return `次回 +${progression.amount}秒（${next.seconds ?? '—'}秒）`;
  }
  const unit = progression.basis === 'perHand' ? 'kg（片側）' : 'kg';
  return `次回 +${progression.amount}${unit}（${describeLoadShort(next.load)}）`;
}
