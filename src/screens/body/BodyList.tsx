/**
 * 体組成の一覧（新しい順）。条件が悪い回は「⚠」の印と理由を出す。
 * rows の測定条件と警告は、呼ぶ側が今のトレの記録から計算し直したもの（withCurrentConditions）。
 * 数えたトレの開始時刻が仮置きなら「（開始時刻は仮置き）」を添える。
 * 行を開くと、部位別と測定条件まで見られる。削除は確認してから。
 */
import { useState } from "react";
import type { BodyComposition, TrainingSession } from "../../db/types";
import { SEGMENT_KEYS, SEGMENT_LABELS } from "../../db/types";
import { deleteBodyComposition } from "../../db/body";
import { Badge, Card, ErrorText, Row } from "../../components/ui";
import {
  BODY_MAIN_FIELDS,
  MEAL_HOURS_RULE,
  POOR_CONDITION_MARK,
  SALT_RULE,
  formatMeasure,
  isPoorCondition,
  trainingStartNote,
} from "../../lib/bodyComposition";
import { formatDateTime } from "../../lib/date";
import { errorMessage } from "../../lib/errors";

export function BodyList({
  rows,
  sessions,
}: {
  rows: BodyComposition[];
  sessions: TrainingSession[];
}) {
  const [error, setError] = useState<string | null>(null);

  const remove = async (row: BodyComposition) => {
    if (row.id === undefined) return;
    if (
      !window.confirm(
        `${formatDateTime(row.measuredAt)} の測定を削除しますか？`,
      )
    )
      return;
    setError(null);
    try {
      await deleteBodyComposition(row.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Card title="測定の一覧（新しい順）">
      {error && <ErrorText label="削除できませんでした">{error}</ErrorText>}
      <ul className="divide-y divide-slate-100" data-testid="body-list">
        {rows.map((row) => {
          const poor = isPoorCondition(row);
          const days = row.conditions.daysSinceLastTraining;
          return (
            <li key={row.id} className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold tabular-nums text-slate-800">
                  {formatDateTime(row.measuredAt)}
                </span>
                {poor && <Badge tone="amber">{POOR_CONDITION_MARK}</Badge>}
              </div>
              <p className="text-[11px] text-slate-500">
                {[row.device, row.place].filter((s) => s !== "").join(" ・ ")}
              </p>
              <p className="mt-1 flex flex-wrap gap-x-3 text-sm tabular-nums text-slate-700">
                <span>
                  脂肪 <b>{formatMeasure(row.fatMassKg, "kg")}</b>
                </span>
                <span>
                  除脂肪 <b>{formatMeasure(row.leanMassKg, "kg")}</b>
                </span>
                <span className="text-slate-500">
                  体重 {formatMeasure(row.weightKg, "kg")}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                最後のトレから {days === null ? "（記録なし）" : `${days}日`}
                {trainingStartNote(sessions, row.measuredAt)}
              </p>
              {row.warnings.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {row.warnings.map((w) => (
                    <li
                      key={w.code}
                      className={
                        w.severity === "info"
                          ? "text-slate-500"
                          : "text-amber-900"
                      }
                    >
                      ・{w.message}
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-1 text-xs text-slate-600">
                <summary className="min-h-8 cursor-pointer select-none py-1">
                  すべての値を見る
                </summary>
                <dl className="tabular-nums">
                  {BODY_MAIN_FIELDS.map((field) => (
                    <Row
                      key={field.key}
                      label={field.label}
                      value={formatMeasure(row[field.key], field.unit)}
                    />
                  ))}
                  {SEGMENT_KEYS.map((key) => (
                    <Row
                      key={key}
                      label={SEGMENT_LABELS[key]}
                      value={`筋肉 ${formatMeasure(row.segmentMuscle[key].muscleKg, "kg")} ／ 脂肪 ${formatMeasure(row.segmentFat[key].fatKg, "kg")}（${formatMeasure(row.segmentFat[key].fatPercent, "%")}）`}
                    />
                  ))}
                  <Row
                    label={SALT_RULE.label}
                    value={formatMeasure(
                      row.conditions.previousDaySaltG,
                      SALT_RULE.unit,
                    )}
                  />
                  <Row
                    label={MEAL_HOURS_RULE.label}
                    value={formatMeasure(
                      row.conditions.hoursSinceLastMeal,
                      MEAL_HOURS_RULE.unit,
                    )}
                  />
                  {row.note !== "" && <Row label="メモ" value={row.note} />}
                </dl>
                <button
                  type="button"
                  onClick={() => void remove(row)}
                  className="mt-1 min-h-11 rounded-lg px-2 text-xs text-slate-500 active:bg-slate-100"
                >
                  この測定を削除する
                </button>
              </details>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
