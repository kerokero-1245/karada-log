/**
 * 数量と時刻を決めて記録に追加する。
 * 「記録に追加」をタップして初めて MealEntry ができる（原則1）。
 */
import { useState } from 'react';
import type { Food, LogDate } from '../../db/types';
import { Sheet } from '../../components/Sheet';
import { QuantityStepper } from '../../components/QuantityStepper';
import { TimeField } from '../../components/TimeField';
import { Badge, Button, NutritionGrid } from '../../components/ui';
import { nowTime } from '../../lib/date';
import { addMealEntries } from '../../lib/meals';
import { scaleNutrition } from '../../lib/nutrition';

export function QuantityStep({
  food,
  logDate,
  boundaryHour,
  onBack,
  onClose,
  onAdded,
}: {
  food: Food;
  logDate: LogDate;
  boundaryHour: number;
  onBack: () => void;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [time, setTime] = useState(() => nowTime());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = scaleNutrition(food.per, quantity);

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      await addMealEntries(logDate, [{ food, quantity, time }], null, boundaryHour);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={food.name}
      subtitle={food.variantLabel ?? undefined}
      onBack={onBack}
      onClose={onClose}
      footer={
        <Button variant="primary" className="h-14 w-full text-base" disabled={saving} onClick={add}>
          記録に追加
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="slate">{food.category}</Badge>
          {food.source === 'estimated' && <Badge tone="amber">推定値</Badge>}
          {food.archived && <Badge tone="slate">在庫切れ</Badge>}
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-bold text-slate-600">数量</p>
          <QuantityStepper value={quantity} unitLabel={food.unitLabel} onChange={setQuantity} />
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <NutritionGrid value={value} />
          <p className="mt-2 text-[11px] text-slate-500">
            「{food.unitLabel}」あたりの値 × 数量です（登録時の表記: {food.basis.label}）。
          </p>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <TimeField value={time} onChange={setTime} logDate={logDate} boundaryHour={boundaryHour} />
        </div>

        {error && <p className="text-sm text-red-700">保存できませんでした: {error}</p>}
      </div>
    </Sheet>
  );
}
