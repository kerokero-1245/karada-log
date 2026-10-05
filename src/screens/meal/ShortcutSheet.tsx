/**
 * 固定ベース（ShortcutSet）の確認シート。
 *
 * ★ このシートを開いただけでは集計に一切入らない。★
 * 「記録に追加」をタップしたときだけ MealEntry を作る（原則1）。
 * 過去に固定ベースを自動計上して、実際より大きく食べたと誤認した事故があるため。
 */
import { useState } from 'react';
import { db } from '../../db/db';
import type { LogDate, Nutrition, ShortcutSet } from '../../db/types';
import { Sheet } from '../../components/Sheet';
import { TimeField } from '../../components/TimeField';
import { Badge, Button, Note } from '../../components/ui';
import { useLiveQuery } from '../../lib/useLiveQuery';
import { hasTime, nowTime } from '../../lib/date';
import { addMealEntries, formatQuantity } from '../../lib/meals';
import { fmtNum, scaleNutrition, sumNutrition } from '../../lib/nutrition';
import { fmtKcal, fmtKcalItem } from '../../lib/formatKcal';

export function ShortcutSheet({
  set,
  logDate,
  boundaryHour,
  onClose,
  onAdded,
}: {
  set: ShortcutSet;
  logDate: LogDate;
  boundaryHour: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const foods = useLiveQuery(() => db.foods.bulkGet(set.items.map((item) => item.foodId)), [set.id]);
  const [checked, setChecked] = useState<boolean[]>(() => set.items.map(() => true));
  const [time, setTime] = useState(() => nowTime());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = set.items.map((item, index) => {
    const food = foods?.[index];
    return {
      item,
      food,
      index,
      checked: checked[index] ?? false,
      value: food ? scaleNutrition(food.per, item.quantity) : null,
    };
  });
  const selected = rows.filter((row) => row.checked && row.food);
  const total = sumNutrition(selected.map((row) => row.value).filter((v): v is Nutrition => v !== null));

  const toggle = (index: number) =>
    setChecked((prev) => prev.map((value, i) => (i === index ? !value : value)));

  const add = async () => {
    if (selected.length === 0 || !hasTime(time)) return;
    setSaving(true);
    setError(null);
    try {
      await addMealEntries(
        logDate,
        selected.map((row) => ({ food: row.food!, quantity: row.item.quantity, time })),
        set.id ?? null,
        boundaryHour,
      );
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={set.name}
      subtitle="食べたものだけチェックを残してください"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <div>
            <p className="text-xs text-slate-500">選んだ{selected.length}件の合計</p>
            <p className="text-sm font-bold tabular-nums text-slate-800">
              {fmtKcal(total.value.kcal)}kcal / P{fmtNum(total.value.proteinG)}g / 脂質
              {fmtNum(total.value.fatG)}g / 塩分{fmtNum(total.value.saltG)}g
            </p>
          </div>
          <Button
            variant="primary"
            className="h-14 w-full text-base"
            disabled={saving || selected.length === 0 || !hasTime(time)}
            onClick={add}
          >
            記録に追加（{selected.length}件）
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          これは「毎日これを食べる」という計画です。<strong>開いただけでは記録に入りません。</strong>
          下の「記録に追加」を押したぶんだけが今日の集計に入ります。
        </div>

        <ul className="divide-y divide-slate-100 rounded-xl bg-white">
          {rows.map((row) => (
            <li key={row.index}>
              <button
                type="button"
                onClick={() => toggle(row.index)}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-slate-50"
              >
                <span
                  aria-hidden
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold ${
                    row.checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {row.checked ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-1.5">
                    <Badge tone="slate">{row.item.timing}</Badge>
                    <span className="text-sm font-medium text-slate-800">
                      {row.food?.name ?? '（食品が見つかりません）'}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {formatQuantity(row.item.quantity)} × {row.food?.unitLabel ?? '—'}
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums text-slate-600">
                    {fmtKcalItem(row.value?.kcal ?? null)}kcal / P{fmtNum(row.value?.proteinG ?? null)}g / 脂質
                    {fmtNum(row.value?.fatG ?? null)}g / 塩分{fmtNum(row.value?.saltG ?? null)}g
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <TimeField
            value={time}
            onChange={setTime}
            logDate={logDate}
            boundaryHour={boundaryHour}
            label="時刻（全品目に同じ時刻が入ります）"
          />
          <p className="mt-1 text-xs text-slate-500">あとで1件ずつ変えられます。</p>
        </div>

        {set.note && <Note>※ {set.note}</Note>}
        {error && <p className="text-sm text-red-700">保存できませんでした: {error}</p>}
      </div>
    </Sheet>
  );
}
