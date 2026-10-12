/**
 * 設定タブの「データ確認（開発用）」。件数・固定ベース（計画）・食品マスタ・体組成と骨密度を
 * 保存されている値のまま並べる。旧 App.tsx の確認ページから残したもの。
 */
import { db } from "../../db/db";
import { NutritionLine } from "../../components/NutritionLine";
import { Row } from "../../components/ui";
import { FoodBadges } from "../../components/FoodBadges";
import { aliasesOf } from "../../lib/aliases";
import { UNKNOWN_MARK } from "../../lib/format";
import {
  emptyNutrition,
  plannedNutrition,
  plannedTotal,
} from "../../lib/nutrition";
import { useLiveQuery } from "../../lib/useLiveQuery";
import { useFoods, useShortcutSets } from "../../lib/queries";
import { BACKUP_TABLE_LABELS } from "../../lib/backup";
import type { BackupTable } from "../../lib/backup";
import { DevRecordsSection } from "./DevRecordsSection";

/** 件数の表に並べるテーブルと順番（表示名は lib/backup.ts の BACKUP_TABLE_LABELS と同じ） */
const COUNT_TABLES: readonly BackupTable[] = [
  "foods",
  "mealEntries",
  "pendingTexts",
  "shortcutSets",
  "dayMeta",
  "exercises",
  "trainingSessions",
  "bodyCompositions",
  "boneDensities",
  "supplements",
];

/** 日の区分は、手動で決めた日の件数（自動の日は行を持たない）なので、そう書く */
function countLabel(table: BackupTable): string {
  return table === "dayMeta"
    ? `${BACKUP_TABLE_LABELS[table]}（手動）`
    : BACKUP_TABLE_LABELS[table];
}

export function DevDataSection() {
  const foods = useFoods();
  const shortcutSets = useShortcutSets();
  const counts = useLiveQuery(async () => {
    const rows = await Promise.all(
      COUNT_TABLES.map(
        async (table) => [table, await db.table(table).count()] as const,
      ),
    );
    return new Map<BackupTable, number>(rows);
  }, []);
  const foodById = new Map((foods ?? []).map((food) => [food.id, food]));

  return (
    <details className="rounded-xl bg-white p-3 shadow-sm">
      <summary className="min-h-11 cursor-pointer list-none py-2 text-sm font-bold text-slate-700">
        ▸ データ確認（開発用）
      </summary>

      <div className="mt-2 space-y-4">
        <div>
          <h3 className="mb-1 text-xs font-bold text-slate-500">件数</h3>
          <dl className="grid grid-cols-2 gap-x-3 text-sm">
            {COUNT_TABLES.map((table) => (
              <Row
                key={table}
                label={countLabel(table)}
                value={`${counts?.get(table) ?? 0} 件`}
              />
            ))}
          </dl>
        </div>

        {(shortcutSets ?? []).map((set) => {
          const rows = set.items.map((item) => {
            const food = foodById.get(item.foodId);
            return {
              item,
              food,
              value: plannedNutrition(food, item.quantity),
            };
          });
          const total = plannedTotal(rows.map((row) => row.value));
          return (
            <div key={set.id}>
              <h3 className="mb-1 text-xs font-bold text-slate-500">
                {set.name}（計画。実績ではない）
              </h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {rows.map((row, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap justify-between gap-x-2 py-1"
                  >
                    <span>
                      <span className="mr-1 text-xs text-slate-400">
                        {row.item.timing}
                      </span>
                      {row.food?.name ?? "(不明な食品)"} × {row.item.quantity}
                    </span>
                    <span className="text-xs tabular-nums text-slate-600">
                      <NutritionLine
                        value={row.value ?? emptyNutrition()}
                        kcal="stored"
                        unit={false}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 border-t border-slate-300 pt-1 text-sm font-medium tabular-nums">
                計 <NutritionLine value={total.value} kcal="stored" />
              </p>
            </div>
          );
        })}

        <div>
          <h3 className="mb-1 text-xs font-bold text-slate-500">
            食品マスタ（1単位あたりに正規化済み）
          </h3>
          <ul className="divide-y divide-slate-100">
            {(foods ?? []).map((food) => {
              const aliases = aliasesOf(food);
              return (
                <li key={food.id} className="py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{food.name}</span>
                    <FoodBadges
                      variantLabel={food.variantLabel}
                      estimated={food.source === "estimated"}
                      archived={food.archived}
                    />
                    {food.useCount > 0 && (
                      <span className="text-[11px] text-slate-400">
                        {food.useCount}回
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs tabular-nums text-slate-600">
                    {/* 保存値をそのままの精度で出す（開発用の確認なので丸めない） */}
                    {food.unitLabel} /{" "}
                    <NutritionLine
                      value={food.per}
                      kcal="stored"
                      grams="stored"
                      carb
                    />
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    入力時: {food.basis.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    呼び名:{" "}
                    {aliases.length > 0 ? aliases.join(" / ") : UNKNOWN_MARK}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <DevRecordsSection />
      </div>
    </details>
  );
}
