/**
 * 体組成の測定条件の評価（F5）。
 *
 * 「前日にトレをしたか」ではなく「最後のトレから何日空いたか」で判定する。
 * かつ、同じ日のトレでも **測定時刻より後に実施したものは数えない**。
 * 例えば同じ日に「測定 → 食事 → トレ」の順だった場合、単純な日付比較だと「0日前」に
 * なってしまうが、正しくは測定より前に実施した最後のトレからの日数で数える。
 */
import type {
  IsoDateTime,
  MeasurementConditions,
  MeasurementWarning,
  TrainingSession,
} from '../db/types';
import { diffDays, toLogDate } from './date';

/** 測定時刻より前に開始された最後のトレーニング */
export function lastTrainingBefore(
  sessions: TrainingSession[],
  measuredAt: IsoDateTime,
): TrainingSession | null {
  const before = sessions.filter((s) => s.startedAt < measuredAt);
  if (before.length === 0) return null;
  return before.reduce((a, b) => (a.startedAt >= b.startedAt ? a : b));
}

export interface MeasurementConditionInput {
  measuredAt: IsoDateTime;
  previousDaySaltG: number | null;
  hoursSinceLastMeal: number | null;
  note?: string;
}

export interface ConditionCheckOptions {
  /** 測定前に空けるべき日数。既定3 */
  minRestDays?: number;
  /** 測定前日に許容する塩分。パターンC 相当 */
  previousDaySaltLimitG?: number;
  /** 食後の目安時間の下限 */
  minHoursAfterMeal?: number;
}

export function evaluateConditions(
  input: MeasurementConditionInput,
  sessions: TrainingSession[],
  options: ConditionCheckOptions = {},
): { conditions: MeasurementConditions; warnings: MeasurementWarning[] } {
  const minRestDays = options.minRestDays ?? 3;
  const saltLimit = options.previousDaySaltLimitG ?? 3;
  const minHoursAfterMeal = options.minHoursAfterMeal ?? 2;

  const last = lastTrainingBefore(sessions, input.measuredAt);
  const daysSince = last ? diffDays(toLogDate(last.startedAt), toLogDate(input.measuredAt)) : null;

  const conditions: MeasurementConditions = {
    previousDaySaltG: input.previousDaySaltG,
    lastTrainingAt: last ? last.startedAt : null,
    daysSinceLastTraining: daysSince,
    hoursSinceLastMeal: input.hoursSinceLastMeal,
    note: input.note ?? '',
  };

  const warnings: MeasurementWarning[] = [];

  if (daysSince !== null && daysSince < minRestDays) {
    warnings.push({
      code: 'training_gap_lt3',
      severity: 'high',
      message: `最後のトレーニングから${daysSince}日です（${minRestDays}日以上空けたい条件）。水分で重く出ます`,
    });
  }
  if (input.previousDaySaltG !== null && input.previousDaySaltG > saltLimit) {
    warnings.push({
      code: 'previous_day_high_salt',
      severity: 'high',
      message: `前日の塩分が${input.previousDaySaltG}gです（測定前はパターンC 2〜3gが条件）`,
    });
  }
  if (input.hoursSinceLastMeal === null) {
    warnings.push({
      code: 'meal_timing_unknown',
      severity: 'info',
      message: '直前の食事からの経過時間が未記録です',
    });
  } else if (input.hoursSinceLastMeal < minHoursAfterMeal) {
    warnings.push({
      code: 'meal_too_recent',
      severity: 'medium',
      message: `食後${input.hoursSinceLastMeal}時間です（目安は2〜3時間）`,
    });
  }

  return { conditions, warnings };
}
