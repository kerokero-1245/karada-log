/**
 * プレビューの 1 行（テキスト記録・取り込み・写真で共通）。
 *
 * 「何と書いたものが、何になったか」を隠さない。原文・状態のバッジ・食品名と数量・栄養値・注記を、
 * どの画面でも同じ並びで出す。画面ごとの違いは props で受ける:
 *  - variants / onPickVariant: 食べ方のチップ（テキスト記録だけ）
 *  - onOpenNewFood: 見つからなかった行の「この名前で新規登録」（テキスト記録だけ）
 *  - timeNote: 時刻を補ったときの注記（取り込みだけ）
 */
import type { ReactNode } from "react";
import { FoodBadges } from "../../components/FoodBadges";
import { NutritionLine } from "../../components/NutritionLine";
import { Badge, Button, Chip } from "../../components/ui";
import type { Food, Nutrition } from "../../db/types";
import { UNKNOWN_MARK } from "../../lib/format";
import type { EntryView } from "../../lib/importText";
import { formatQuantity } from "../../lib/mealView";
import { fmtNum, hasUnknownCore, scaleNutrition } from "../../lib/nutrition";
import { QUICK_STATUS_LABELS } from "../../lib/quickText";
import type { QuickResolution, QuickStatus } from "../../lib/quickText";

/** プレビューの下位の画面（候補から選ぶ・食品を選ぶ・新規登録）。index は行の位置 */
export type EntrySub =
  | { kind: "preview" }
  | { kind: "candidates"; index: number }
  | { kind: "pick"; index: number }
  | { kind: "newFood"; index: number; name: string };

const STATUS_TONE: Record<QuickStatus, "emerald" | "amber" | "red"> = {
  confirmed: "emerald",
  estimated: "amber",
  ambiguous: "amber",
  missing: "red",
};

/** 食品名・バッジ・「数量 × 単位」の 1 行 */
export function EntryNameLine({
  name,
  badges,
  quantity,
  unitLabel,
}: {
  name: string;
  badges: ReactNode;
  quantity: number;
  unitLabel: string;
}) {
  return (
    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
      <span className="text-sm font-bold text-slate-800">{name}</span>
      {badges}
      <span className="text-sm tabular-nums text-slate-700">
        {formatQuantity(quantity)} × {unitLabel}
      </span>
    </div>
  );
}

/** 栄養値の 1 行。未確認の値を含むときは、その印の意味を添える */
export function EntryValueLine({ value }: { value: Nutrition }) {
  return (
    <p className="mt-0.5 text-xs tabular-nums text-slate-600">
      <NutritionLine value={value} />
      {hasUnknownCore(value) && (
        <span className="ml-1 text-slate-500">
          {`（「${UNKNOWN_MARK}」は未確認）`}
        </span>
      )}
    </p>
  );
}

/** 数量を黙って変えたときなどの説明（行の下に 1 件ずつ） */
export function EntryNotes({ notes }: { notes: string[] }) {
  return (
    <>
      {notes.map((note) => (
        <p key={note} className="mt-0.5 text-[11px] text-amber-700">
          ※ {note}
        </p>
      ))}
    </>
  );
}

export function ResolvedItemRow({
  time,
  timeNote,
  resolution,
  view,
  variants = [],
  onPickVariant,
  onOpenCandidates,
  onOpenPicker,
  onOpenNewFood,
}: {
  /** 行の頭に出す時刻 */
  time: string;
  /** 時刻を補ったときの注記（無ければ出さない） */
  timeNote?: ReactNode;
  resolution: QuickResolution;
  view: EntryView;
  /** 同じ食品の兄弟（食べ方）。2 件以上ならチップで切り替えられる */
  variants?: Food[];
  onPickVariant?: (food: Food) => void;
  onOpenCandidates: () => void;
  onOpenPicker: () => void;
  /** 渡したときだけ、見つからなかった行に「この名前で新規登録」を出す */
  onOpenNewFood?: () => void;
}) {
  const parsed = resolution.parsed;
  const food = view.food;
  const resolved = food !== null || view.estimated !== null;
  const value = resolved ? scaleNutrition(view.per, view.quantity) : null;

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs tabular-nums text-slate-500">{time}</span>
        <span className="text-xs text-slate-500">「{parsed.raw}」</span>
        <Badge tone={STATUS_TONE[view.status]}>
          {QUICK_STATUS_LABELS[view.status]}
        </Badge>
        {view.usesMasterValues && <Badge tone="blue">マスタの値</Badge>}
        {view.manual && <Badge tone="violet">選んだ</Badge>}
      </div>

      {timeNote != null && (
        <p className="text-[11px] text-slate-500">{timeNote}</p>
      )}

      {value !== null ? (
        <>
          <EntryNameLine
            name={food?.name ?? parsed.name}
            badges={
              <FoodBadges
                variantLabel={food?.variantLabel}
                estimated={food?.source === "estimated"}
                archived={food?.archived === true}
              />
            }
            quantity={view.quantity}
            unitLabel={view.unitLabel}
          />

          <EntryValueLine value={value} />

          {view.usesMasterValues && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              マスタの値を使います。
            </p>
          )}

          {variants.length > 1 && food !== null && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {variants.map((variant) => (
                <Chip
                  key={variant.id}
                  size="sm"
                  selected={variant.id === food.id}
                  onClick={() => onPickVariant?.(variant)}
                >
                  {variant.variantLabel ?? "標準"}（塩分
                  {fmtNum(variant.per.saltG)}g）
                </Chip>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-0.5 text-sm text-slate-700">
          {view.status === "missing"
            ? "食品マスタに見つかりませんでした。"
            : `候補が${resolution.candidates.length}件あります。どれか選んでください。`}
        </p>
      )}

      <EntryNotes notes={view.notes} />

      <div className="mt-1 flex flex-wrap gap-2">
        {resolution.candidates.length > 1 && (
          <Button className="text-xs" onClick={onOpenCandidates}>
            候補から選ぶ（{resolution.candidates.length}件）
          </Button>
        )}
        <Button className="text-xs" onClick={onOpenPicker}>
          食品を選ぶ
        </Button>
        {view.status === "missing" && onOpenNewFood !== undefined && (
          <Button className="text-xs" onClick={onOpenNewFood}>
            この名前で新規登録
          </Button>
        )}
      </div>
    </li>
  );
}
