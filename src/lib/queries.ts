/**
 * 画面が読む DB の問い合わせ（liveQuery）。同じ問い合わせを画面ごとに書かず、ここから使う。
 * DB が書き換わると自動で再描画される（lib/useLiveQuery.ts）。読み込み前（undefined）の間は空として扱う。
 */
import { useMemo } from "react";
import { db } from "../db/db";
import type {
  LogDate,
  MealEntry,
  Settings,
  TrainingSession,
} from "../db/types";
import { resolveDayType } from "./day";
import { dayTargetKcal } from "./goals";
import { entryNutrition } from "./mealView";
import { sumNutrition } from "./nutrition";
import { useLiveQuery } from "./useLiveQuery";

const NO_ENTRIES: MealEntry[] = [];
const NO_SESSIONS: TrainingSession[] = [];

/** 食品マスタの全件（読み込み前は undefined） */
export function useFoods() {
  return useLiveQuery(() => db.foods.toArray(), []);
}

/** 固定ベース（計画）を並び順（order）で（読み込み前は undefined） */
export function useShortcutSets() {
  return useLiveQuery(() => db.shortcutSets.orderBy("order").toArray(), []);
}

/** 体組成の全件（測定日時の古い順。読み込み前は undefined） */
export function useBodyCompositions() {
  return useLiveQuery(
    () => db.bodyCompositions.orderBy("measuredAt").toArray(),
    [],
  );
}

/** 骨密度の全件（測定日時の古い順。読み込み前は undefined） */
export function useBoneDensities() {
  return useLiveQuery(
    () => db.boneDensities.orderBy("measuredAt").toArray(),
    [],
  );
}

/** トレーニングの全件（体組成の測定条件「最後のトレからの日数」の計算に使う。読み込み前は undefined） */
export function useAllTrainingSessions() {
  return useLiveQuery(() => db.trainingSessions.toArray(), []);
}

/**
 * その日（論理日付）の記録・トレーニングと、そこから決まるもの。
 * 日の区分（手動 > トレの有無 > 休養日）・その日のカロリー目標・摂取の合計（記録されたものだけ）。
 */
export function useDaySummary(logDate: LogDate, settings: Settings) {
  const entries = useLiveQuery(
    () => db.mealEntries.where("logDate").equals(logDate).sortBy("recordedAt"),
    [logDate],
  );
  const sessions = useLiveQuery(
    () =>
      db.trainingSessions.where("logDate").equals(logDate).sortBy("startedAt"),
    [logDate],
  );
  const dayMeta = useLiveQuery(() => db.dayMeta.get(logDate), [logDate]);

  const entryList = entries ?? NO_ENTRIES;
  const sessionList = sessions ?? NO_SESSIONS;
  const totals = useMemo(
    () => sumNutrition(entryList.map(entryNutrition)),
    [entryList],
  );
  const { dayType, source } = resolveDayType(dayMeta, sessionList.length);
  return {
    entries: entryList,
    sessions: sessionList,
    dayType,
    source,
    targetKcal: dayTargetKcal(settings, dayType),
    totals,
  };
}
