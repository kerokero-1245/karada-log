/**
 * 料理の写真の見積もりプレビュー。
 *
 * ★ 出しただけでは何も起きない。★
 *   下の「○件を記録」を押したときに初めて、推定食品と記録ができる（原則1）。
 *   プレビューを開いている間、ダッシュボードのバーは動かない。
 *
 * 画面の約束（テキスト記録のプレビューと同じ）:
 *  - 写真から何と読んだか（原文）を必ず出す
 *  - マスタの食品を使ったのか、写真からの推定値なのかをバッジで区別する
 *  - 数量は直せる
 */
import { useMemo, useState } from "react";
import type { Food, LogDate, Nutrition } from "../../db/types";
import { Sheet } from "../../components/Sheet";
import { QuantityStepper } from "../../components/QuantityStepper";
import { NutritionLine } from "../../components/NutritionLine";
import { TimeField } from "../../components/TimeField";
import {
  Badge,
  Button,
  EmptyState,
  ErrorText,
  Note,
  Notice,
  Panel,
} from "../../components/ui";
import { FoodBadges } from "../../components/FoodBadges";
import { formatLogDateShort, hasTime, nowTime } from "../../lib/date";
import { scaleNutrition, sumNutrition } from "../../lib/nutrition";
import { buildPhotoRows } from "../../lib/photoMeal";
import type { PhotoMealRow } from "../../lib/photoMeal";
import { errorMessage, SAVE_FAILED } from "../../lib/errors";
import { commitPhotoMeal } from "../../lib/photoRecord";
import type { PhotoCommitResult, PhotoEntryPlan } from "../../lib/photoRecord";
import { CONFIDENCE_LABELS } from "../../lib/vision";
import type { MealPhotoRead } from "../../lib/vision";
import { useFoods } from "../../lib/queries";
import { EntryNameLine, EntryNotes, EntryValueLine } from "./ResolvedItemRow";

const NO_FOODS: Food[] = [];

export function PhotoMealSheet({
  read,
  logDate,
  boundaryHour,
  onBack,
  onClose,
  onRecorded,
}: {
  read: MealPhotoRead;
  logDate: LogDate;
  boundaryHour: number;
  onBack: () => void;
  onClose: () => void;
  onRecorded: (result: PhotoCommitResult) => void;
}) {
  const foods = useFoods();
  const rows = useMemo(
    () => buildPhotoRows(read, foods ?? NO_FOODS),
    [read, foods],
  );

  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [time, setTime] = useState(() => nowTime());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantityOf = (row: PhotoMealRow) =>
    quantities[row.index] ?? row.quantity;

  const total = sumNutrition(
    rows.map((row): Nutrition => scaleNutrition(row.per, quantityOf(row))),
  );

  const record = async () => {
    if (rows.length === 0 || !hasTime(time)) return;
    setSaving(true);
    setError(null);
    try {
      const plans: PhotoEntryPlan[] = rows.map((row) => ({
        row,
        quantity: quantityOf(row),
        time,
      }));
      onRecorded(await commitPhotoMeal(logDate, plans, boundaryHour));
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="写真から記録する"
      subtitle={`${formatLogDateShort(logDate)} の記録`}
      onBack={onBack}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <div>
            <p className="text-xs text-slate-500">
              記録する{rows.length}件の合計（概算）
            </p>
            <p className="text-sm font-bold tabular-nums text-slate-800">
              <NutritionLine value={total.value} kcal="total" />
            </p>
          </div>
          <Button
            variant="primary"
            className="h-14 w-full"
            disabled={saving || rows.length === 0 || !hasTime(time)}
            onClick={record}
          >
            {rows.length}件を記録
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {rows.length === 0 ? (
          <EmptyState>
            写真からは品目を読み取れませんでした。テキストで書くか、検索から選んでください。
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl bg-white px-3">
            {rows.map((row) => (
              <PhotoRow
                key={row.index}
                row={row}
                quantity={quantityOf(row)}
                onQuantity={(value) =>
                  setQuantities((prev) => ({ ...prev, [row.index]: value }))
                }
              />
            ))}
          </ul>
        )}

        {read.notes.trim() !== "" && (
          <Notice tone="sky">読み取りのメモ: {read.notes.trim()}</Notice>
        )}

        <Panel>
          <TimeField
            value={time}
            onChange={setTime}
            logDate={logDate}
            boundaryHour={boundaryHour}
          />
        </Panel>

        {error !== null && <ErrorText label={SAVE_FAILED}>{error}</ErrorText>}

        <Note>
          写真は保存されません。「推定」の値は写真からの概算です。ラベルのある食品は、
          あとから栄養成分表示で登録し直すと値が確かになります。
        </Note>
      </div>
    </Sheet>
  );
}

function PhotoRow({
  row,
  quantity,
  onQuantity,
}: {
  row: PhotoMealRow;
  quantity: number;
  onQuantity: (value: number) => void;
}) {
  const value = scaleNutrition(row.per, quantity);
  const food = row.matched;

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs text-slate-500">「{row.raw}」</span>
        {food === null ? (
          <Badge tone="amber">推定</Badge>
        ) : (
          <Badge tone="emerald">マスタ照合</Badge>
        )}
        {row.item.confidence === "low" && (
          <Badge tone="slate">{CONFIDENCE_LABELS.low}</Badge>
        )}
      </div>

      <EntryNameLine
        name={food === null ? row.item.name : food.name}
        badges={
          <FoodBadges
            variantLabel={food?.variantLabel}
            archived={food?.archived}
          />
        }
        quantity={quantity}
        unitLabel={row.unitLabel}
      />

      <EntryValueLine value={value} />

      <EntryNotes notes={row.notes} />

      <div className="mt-1.5">
        {/* 食品マスタの読み込みで既定の数量が変わったら、入力欄も入れ直す（古い数字を残さない） */}
        <QuantityStepper
          key={row.quantity}
          value={quantity}
          unitLabel={row.unitLabel}
          onChange={onQuantity}
        />
      </div>
    </li>
  );
}
