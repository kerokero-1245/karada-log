/**
 * F4: トレーニング記録の画面。
 *
 *  - 上部に「当日摂取 ○kcal / 残り ○kcal」を常に出す（F7）。この画面ではアラートは出さない。
 *    判断材料だけを出して、判断はユーザーに任せる。
 *  - 今日のトレーニングが無ければ A / B / C のメニューを選んで始める。
 *    始めると、その日は自動で「ジムの日」になる（lib/day.ts の resolveDayType がトレの件数で決める）。
 *    食事の記録には何も足さない。
 *  - 種目ごとに重量（バー種別 + プレート）/ 回数（時間種目は秒数）/ セット / 達成 / メモを記録し、
 *    進捗ルールで「次回 +○kg」か「据え置き」を出す。
 */
import { useMemo, useState } from "react";
import { db } from "../../db/db";
import type { MenuId, Settings } from "../../db/types";
import { DAY_TYPE_LABELS, MENU_IDS, MENU_LABELS } from "../../db/types";
import { Card, Note } from "../../components/ui";
import { formatLogDate, timeOf } from "../../lib/date";
import { resolveDayType } from "../../lib/day";
import { UNKNOWN_MARK } from "../../lib/format";
import { dayTargetKcal, formatAmount } from "../../lib/goals";
import { entryNutrition } from "../../lib/mealView";
import { sumNutrition } from "../../lib/nutrition";
import { DEFAULT_TARGET_REPS } from "../../lib/progression";
import {
  deleteSession,
  loadSessionRecords,
  nextMenuAfter,
  plannedTargetOf,
  startSession,
} from "../../lib/training";
import { useLiveQuery } from "../../lib/useLiveQuery";
import { useTodayLogDate } from "../../lib/useTodayLogDate";
import { describeLoadShort } from "../../lib/weight";
import { ExerciseCard } from "./ExerciseCard";

export function TrainingScreen({ settings }: { settings: Settings }) {
  const logDate = useTodayLogDate(settings.dayBoundaryHour);

  const entries = useLiveQuery(
    () => db.mealEntries.where("logDate").equals(logDate).toArray(),
    [logDate],
  );
  const sessions = useLiveQuery(
    () =>
      db.trainingSessions.where("logDate").equals(logDate).sortBy("startedAt"),
    [logDate],
  );
  const dayMeta = useLiveQuery(() => db.dayMeta.get(logDate), [logDate]);
  const exercises = useLiveQuery(
    () => db.exercises.orderBy("[menu+order]").toArray(),
    [],
  );
  const lastBefore = useLiveQuery(
    () =>
      db.trainingSessions.where("logDate").below(logDate).sortBy("startedAt"),
    [logDate],
  );

  const sessionList = sessions ?? [];
  const session =
    sessionList.length > 0 ? sessionList[sessionList.length - 1] : null;
  const records = useLiveQuery(
    () =>
      session?.id === undefined
        ? Promise.resolve(null)
        : loadSessionRecords(session.id),
    [session?.id],
  );

  const [busy, setBusy] = useState(false);

  const { dayType } = resolveDayType(dayMeta, sessionList.length);
  const target = dayTargetKcal(settings, dayType);
  const intake = useMemo(
    () => sumNutrition((entries ?? []).map(entryNutrition)),
    [entries],
  );
  const intakeKcal = intake.value.kcal ?? 0;
  const remain = target - intakeKcal;
  const unknownKcal = intake.unknown.kcal ?? 0;

  // 直前のトレーニング（今日より前）のメニューから、ローテーションの次を出す
  const previous =
    (lastBefore ?? []).length > 0
      ? (lastBefore ?? [])[(lastBefore ?? []).length - 1]
      : null;
  const suggested = nextMenuAfter(previous?.menu ?? null);

  const begin = async (menu: MenuId) => {
    setBusy(true);
    try {
      await startSession(menu, logDate);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (session?.id === undefined) return;
    if (
      !window.confirm(
        "このトレーニングの記録を取り消しますか？（種目とセットの記録も消えます）",
      )
    )
      return;
    await deleteSession(session.id);
  };

  const menuExercises = (menu: MenuId) =>
    (exercises ?? []).filter((e) => e.menu === menu && e.active);

  return (
    <div className="min-h-screen bg-slate-100 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 bg-slate-900 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white">
        <div className="mx-auto max-w-md">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="text-xl font-bold">トレーニング</h1>
            <span className="text-xs text-slate-300">
              {formatLogDate(logDate)}
            </span>
          </div>
          <div
            className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg bg-slate-800 px-3 py-2 tabular-nums"
            data-testid="intake-strip"
          >
            <span className="text-sm">
              当日摂取{" "}
              <b className="text-base">{formatAmount("kcal", intakeKcal)}</b>{" "}
              kcal
            </span>
            <span className="text-sm">
              残り{" "}
              <b className="text-base">
                {formatAmount("kcal", Math.max(0, remain))}
              </b>{" "}
              kcal
              {remain < 0 && (
                <span className="ml-1 text-xs text-slate-300">
                  （目標に到達 +{formatAmount("kcal", -remain)}）
                </span>
              )}
            </span>
            <span className="w-full text-[11px] text-slate-400">
              {DAY_TYPE_LABELS[dayType]}の目標 {formatAmount("kcal", target)}{" "}
              kcal
              {unknownKcal > 0 &&
                ` ・ kcal が分からない記録 ${unknownKcal}件は含めていません`}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 p-3">
        {session === null ? (
          <>
            <Card title="メニューを選んで始める">
              <p className="text-sm text-slate-700">
                始めると、今日は自動で「ジムの日」になります（目標{" "}
                {formatAmount("kcal", settings.gymDayKcal)}{" "}
                kcal）。食事の記録は変わりません。
              </p>
              {previous && (
                <Note>
                  前回は {MENU_LABELS[previous.menu]}（{previous.logDate}
                  ）。ローテーションでは次は {MENU_LABELS[suggested]} です。
                </Note>
              )}
            </Card>
            {MENU_IDS.map((menu) => (
              <Card key={menu}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-800">
                    {MENU_LABELS[menu]}
                  </h2>
                  {menu === suggested && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800">
                      次はこれ
                    </span>
                  )}
                </div>
                <ol className="mt-1 space-y-0.5 text-sm text-slate-700">
                  {menuExercises(menu).map((exercise) => {
                    const planned = plannedTargetOf(exercise);
                    const detail =
                      exercise.kind === "amrap"
                        ? `限界まで × ${exercise.sets}`
                        : exercise.kind === "timed"
                          ? `${describeLoadShort(planned.load)} ${planned.seconds ?? UNKNOWN_MARK}秒 × ${exercise.sets}`
                          : `${describeLoadShort(planned.load)} × ${planned.reps ?? DEFAULT_TARGET_REPS}回 × ${exercise.sets}`;
                    return (
                      <li
                        key={exercise.id}
                        className="flex justify-between gap-2"
                      >
                        <span>
                          {exercise.order}. {exercise.name}
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-500">
                          {detail}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void begin(menu)}
                  className="mt-2 h-12 w-full rounded-lg bg-emerald-600 text-sm font-bold text-white active:bg-emerald-700 disabled:bg-slate-300"
                >
                  {menu} を始める
                </button>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    {MENU_LABELS[session.menu]}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {timeOf(session.startedAt)} 開始 ・
                    上から順に。時間がなければ下から切る
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void cancel()}
                  className="min-h-11 shrink-0 rounded-lg px-2 text-xs text-slate-500 active:bg-slate-100"
                >
                  取り消す
                </button>
              </div>
            </Card>
            {records === undefined
              ? null
              : menuExercises(session.menu).map((exercise) => {
                  const saved =
                    records?.items.find(
                      (item) => item.exerciseId === exercise.id,
                    ) ?? null;
                  const savedSets = saved
                    ? (records?.sets ?? [])
                        .filter((s) => s.sessionExerciseId === saved.id)
                        .sort((a, b) => a.setNo - b.setNo)
                    : [];
                  return (
                    <ExerciseCard
                      key={`${session.id}-${exercise.id}`}
                      sessionId={session.id as number}
                      exercise={exercise}
                      saved={saved}
                      savedSets={savedSets}
                    />
                  );
                })}
          </>
        )}
      </main>
    </div>
  );
}
