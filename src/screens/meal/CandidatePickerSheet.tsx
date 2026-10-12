/**
 * 「候補から選ぶ」: 原文に当たりそうな食品の候補を並べ、タップで選ぶ（テキスト記録・取り込みで共通）。
 * 選んだあとの扱いの注記は画面ごとに違うので、note で受ける。
 */
import { FoodBadges } from "../../components/FoodBadges";
import { NutritionLine } from "../../components/NutritionLine";
import { Sheet } from "../../components/Sheet";
import { Badge, Button, Note } from "../../components/ui";
import type { Food } from "../../db/types";
import type { QuickCandidate } from "../../lib/quickText";

export function CandidatePickerSheet({
  raw,
  candidates,
  note,
  onChoose,
  onOpenPicker,
  onBack,
  onClose,
}: {
  /** 原文（サブタイトルに出す） */
  raw: string;
  candidates: QuickCandidate[];
  note: string;
  onChoose: (food: Food) => void;
  onOpenPicker: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      title="候補から選ぶ"
      subtitle={`「${raw}」`}
      onBack={onBack}
      onClose={onClose}
    >
      <div className="space-y-2">
        {candidates.map((candidate) => {
          const first = candidate.foods[0];
          return (
            <button
              key={candidate.key}
              type="button"
              onClick={() => onChoose(first)}
              className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm active:bg-slate-50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-sm font-bold text-slate-800">
                    {candidate.name}
                  </span>
                  {candidate.foods.length > 1 && (
                    <Badge tone="blue">
                      バリアント{candidate.foods.length}件
                    </Badge>
                  )}
                  <FoodBadges estimated={first.source === "estimated"} />
                </span>
                <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
                  {first.unitLabel} / <NutritionLine value={first.per} />
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  {candidate.reason}
                </span>
              </span>
              <span className="text-slate-300">›</span>
            </button>
          );
        })}

        <Button className="w-full" onClick={onOpenPicker}>
          一覧から探す
        </Button>
        <Note>{note}</Note>
      </div>
    </Sheet>
  );
}
