/**
 * 数量と時刻を決めて記録に追加する。
 * 「記録に追加」をタップして初めて MealEntry ができる（原則1）。
 */
import { useState } from "react";
import type { Food, LogDate } from "../../db/types";
import { Sheet } from "../../components/Sheet";
import { QuantityStepper } from "../../components/QuantityStepper";
import { TimeField } from "../../components/TimeField";
import { Badge, Button, ErrorText, NutritionGrid } from "../../components/ui";
import { FoodBadges } from "../../components/FoodBadges";
import { hasTime, nowTime } from "../../lib/date";
import { addMealEntries } from "../../lib/meals";
import { scaleNutrition } from "../../lib/nutrition";
import { errorMessage, SAVE_FAILED } from "../../lib/errors";

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
    if (!hasTime(time)) return;
    setSaving(true);
    setError(null);
    try {
      await addMealEntries(
        logDate,
        [{ food, quantity, time }],
        null,
        boundaryHour,
      );
      onAdded();
    } catch (e) {
      setError(errorMessage(e));
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
        <Button
          variant="primary"
          className="h-14 w-full"
          disabled={saving || !hasTime(time)}
          onClick={add}
        >
          記録に追加
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="slate">{food.category}</Badge>
          <FoodBadges
            estimated={food.source === "estimated"}
            archived={food.archived}
          />
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-bold text-slate-600">数量</p>
          <QuantityStepper
            value={quantity}
            unitLabel={food.unitLabel}
            onChange={setQuantity}
          />
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <NutritionGrid value={value} />
          <p className="mt-2 text-[11px] text-slate-500">
            「{food.unitLabel}」あたりの値 × 数量です（登録時の表記:{" "}
            {food.basis.label}）。
          </p>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <TimeField
            value={time}
            onChange={setTime}
            logDate={logDate}
            boundaryHour={boundaryHour}
          />
        </div>

        {error && <ErrorText label={SAVE_FAILED}>{error}</ErrorText>}
      </div>
    </Sheet>
  );
}
