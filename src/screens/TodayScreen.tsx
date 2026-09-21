/**
 * F1: 今日のダッシュボード。
 * 一目で「あと何を摂ればいいか」が分かることが目的。
 * 表示するのは **記録されたものだけ**。固定ベースは開いて追加するまで入らない（原則1）。
 */
import { useMemo, useState } from 'react';
import { db } from '../db/db';
import type { DayType, MealEntry, Nutrition, Settings, TrainingSession } from '../db/types';
import { MENU_LABELS } from '../db/types';
import { NutrientBar } from '../components/NutrientBar';
import { Badge, Card, Note } from '../components/ui';
import { clearManualDayType, resolveDayType, setManualDayType, useTodayLogDate } from '../lib/day';
import { timeOf } from '../lib/date';
import { buildBars, dayTargetKcal } from '../lib/goals';
import { entryNutrition } from '../lib/meals';
import { fmtNum, scaleNutrition, sumNutrition } from '../lib/nutrition';
import { useLiveQuery } from '../lib/useLiveQuery';
import { DayHeader } from './today/DayHeader';
import { MealList } from './today/MealList';
import { MealAddSheet } from './meal/MealAddSheet';
import { MealEditSheet } from './meal/MealEditSheet';
import { ShortcutSheet } from './meal/ShortcutSheet';

const NO_ENTRIES: MealEntry[] = [];
const NO_SESSIONS: TrainingSession[] = [];

export function TodayScreen({ settings }: { settings: Settings }) {
  const boundaryHour = settings.dayBoundaryHour;
  const logDate = useTodayLogDate(boundaryHour);

  const entries = useLiveQuery(
    () => db.mealEntries.where('logDate').equals(logDate).sortBy('recordedAt'),
    [logDate],
  );
  const sessions = useLiveQuery(
    () => db.trainingSessions.where('logDate').equals(logDate).sortBy('startedAt'),
    [logDate],
  );
  const dayMeta = useLiveQuery(() => db.dayMeta.get(logDate), [logDate]);
  const shortcutSets = useLiveQuery(() => db.shortcutSets.orderBy('order').toArray(), []);
  const foods = useLiveQuery(() => db.foods.toArray(), []);

  const [addOpen, setAddOpen] = useState(false);
  const [shortcutId, setShortcutId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const list = entries ?? NO_ENTRIES;
  const sessionList = sessions ?? NO_SESSIONS;
  const totals = useMemo(() => sumNutrition(list.map(entryNutrition)), [list]);
  const { dayType, source } = resolveDayType(dayMeta, sessionList.length);
  const bars = buildBars(totals, settings, dayType);

  const editing = list.find((entry) => entry.id === editingId) ?? null;
  const shortcut = (shortcutSets ?? []).find((set) => set.id === shortcutId) ?? null;
  const foodById = useMemo(() => new Map((foods ?? []).map((food) => [food.id, food])), [foods]);

  const selectDayType = (next: DayType) => {
    void setManualDayType(logDate, next);
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-[calc(11rem+env(safe-area-inset-bottom))]">
      <DayHeader
        logDate={logDate}
        dayType={dayType}
        source={source}
        targetKcal={dayTargetKcal(settings, dayType)}
        trainingCount={sessionList.length}
        onSelect={selectDayType}
        onReset={() => void clearManualDayType(logDate)}
      />

      <main className="mx-auto max-w-md space-y-3 p-3">
        <Card title="今日の進捗">
          <div className="divide-y divide-slate-100">
            {bars.map((bar) => (
              <NutrientBar key={bar.key} bar={bar} />
            ))}
          </div>
        </Card>

        {(shortcutSets ?? []).length > 0 && (
          <Card title="固定ベース（ショートカット）">
            <ul className="space-y-2">
              {(shortcutSets ?? []).map((set) => {
                const planned = sumNutrition(
                  set.items
                    .map((item) => {
                      const food = foodById.get(item.foodId);
                      return food ? scaleNutrition(food.per, item.quantity) : null;
                    })
                    .filter((value): value is Nutrition => value !== null),
                );
                return (
                  <li key={set.id}>
                    <button
                      type="button"
                      onClick={() => setShortcutId(set.id ?? null)}
                      className="min-h-14 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left active:bg-slate-50"
                    >
                      <span className="block text-sm font-bold text-slate-800">{set.name}</span>
                      <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
                        {set.items.length}品 ・ 全部で {fmtNum(planned.value.kcal)}kcal / P
                        {fmtNum(planned.value.proteinG)}g / 脂質{fmtNum(planned.value.fatG)}g / 塩分
                        {fmtNum(planned.value.saltG)}g
                      </span>
                      <span className="mt-0.5 block text-[11px] text-amber-700">
                        これは計画です。タップして選んだぶんだけが記録に入ります。
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card title={`今日の記録（${list.length}件）`}>
          <MealList entries={list} onSelect={(entry) => setEditingId(entry.id ?? null)} />
        </Card>

        {sessionList.length > 0 && (
          <Card title="今日のトレーニング">
            <ul className="space-y-1">
              {sessionList.map((session) => (
                <li key={session.id} className="flex items-baseline gap-2 text-sm">
                  <span className="w-12 shrink-0 tabular-nums text-slate-500">{timeOf(session.startedAt)}</span>
                  <span className="font-medium text-slate-800">{MENU_LABELS[session.menu]}</span>
                  {session.startedAtIsEstimated && <Badge tone="slate">時刻は仮置き</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="あと何を食べればいいか">
          <p className="text-sm text-slate-600">提案は次のステップで追加します。</p>
          <Note>残りのカロリー・P・塩分の枠から、食品マスタで組み合わせを出す予定です（F6）。</Note>
        </Card>
      </main>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-3 pb-2">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="h-14 w-full rounded-full bg-emerald-600 text-base font-bold text-white shadow-lg active:bg-emerald-700"
          >
            ＋ 記録する
          </button>
        </div>
      </div>

      {addOpen && (
        <MealAddSheet logDate={logDate} boundaryHour={boundaryHour} onClose={() => setAddOpen(false)} />
      )}
      {shortcut && (
        <ShortcutSheet
          set={shortcut}
          logDate={logDate}
          boundaryHour={boundaryHour}
          onClose={() => setShortcutId(null)}
          onAdded={() => setShortcutId(null)}
        />
      )}
      {editing && (
        <MealEditSheet entry={editing} boundaryHour={boundaryHour} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}
