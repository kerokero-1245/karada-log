/**
 * 記録した1件の編集。数量と時刻を変えられる。削除はインライン確認を1回だけ挟む。
 * 時刻を変えても論理日付は動かさない（日付の移動は今回のスコープ外）。
 */
import { useState } from "react";
import type { MealEntry } from "../../db/types";
import { Sheet } from "../../components/Sheet";
import { QuantityStepper } from "../../components/QuantityStepper";
import { TimeField } from "../../components/TimeField";
import {
  Badge,
  Button,
  ErrorText,
  NutritionGrid,
  Panel,
} from "../../components/ui";
import { FoodBadges } from "../../components/FoodBadges";
import { formatLogDateShort, hasTime, timeOf } from "../../lib/date";
import { deleteMealEntry, updateMealEntry } from "../../lib/meals";
import { scaleNutrition } from "../../lib/nutrition";
import { errorMessage, SAVE_FAILED } from "../../lib/errors";

export function MealEditSheet({
  entry,
  boundaryHour,
  onClose,
}: {
  entry: MealEntry;
  boundaryHour: number;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(entry.quantity);
  const [time, setTime] = useState(() => timeOf(entry.recordedAt));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = scaleNutrition(entry.snapshot.per, quantity);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={entry.snapshot.name}
      subtitle={entry.snapshot.variantLabel ?? undefined}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="h-14 w-full"
          disabled={busy || !hasTime(time)}
          onClick={() =>
            run(() => updateMealEntry(entry, quantity, time, boundaryHour))
          }
        >
          保存する
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="slate">{entry.snapshot.category}</Badge>
          <FoodBadges estimated={entry.snapshot.source === "estimated"} />
          {entry.fromShortcutSetId !== null && (
            <Badge tone="slate">固定ベースから追加</Badge>
          )}
        </div>

        <Panel>
          <p className="mb-2 text-xs font-bold text-slate-600">数量</p>
          <QuantityStepper
            value={quantity}
            unitLabel={entry.snapshot.unitLabel}
            onChange={setQuantity}
          />
        </Panel>

        <Panel>
          <NutritionGrid value={value} />
        </Panel>

        <Panel>
          <TimeField
            value={time}
            onChange={setTime}
            logDate={entry.logDate}
            boundaryHour={boundaryHour}
          />
          <p className="mt-1 text-xs text-slate-500">
            時刻を変えても {formatLogDateShort(entry.logDate)}{" "}
            の記録のままです。
          </p>
        </Panel>

        <Panel>
          {confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-700">
                この記録を削除しますか？
              </span>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => run(() => deleteMealEntry(entry))}
              >
                削除する
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                やめる
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => setConfirmingDelete(true)}
            >
              この記録を削除
            </Button>
          )}
        </Panel>

        {error && <ErrorText label={SAVE_FAILED}>{error}</ErrorText>}
      </div>
    </Sheet>
  );
}
