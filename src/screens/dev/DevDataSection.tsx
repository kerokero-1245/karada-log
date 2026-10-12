/**
 * 設定タブの「データ確認（開発用）」。件数・固定ベース（計画）・食品マスタ・体組成と骨密度を
 * 保存されている値のまま並べる。旧 App.tsx の確認ページから残したもの。
 */
import { db } from "../../db/db";
import { Badge, Row } from "../../components/ui";
import { aliasesOf } from "../../lib/aliases";
import { fmtStored } from "../../lib/format";
import { fmtNum, scaleNutrition, sumNutrition } from "../../lib/nutrition";
import { useLiveQuery } from "../../lib/useLiveQuery";
import { DevRecordsSection } from "./DevRecordsSection";

export function DevDataSection() {
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const shortcutSets = useLiveQuery(
    () => db.shortcutSets.orderBy("order").toArray(),
    [],
  );
  const counts = useLiveQuery(async () => {
    const [
      mealEntries,
      pendingTexts,
      dayMeta,
      trainingSessions,
      bodyCompositions,
      boneDensities,
      supplements,
      exercises,
    ] = await Promise.all([
      db.mealEntries.count(),
      db.pendingTexts.count(),
      db.dayMeta.count(),
      db.trainingSessions.count(),
      db.bodyCompositions.count(),
      db.boneDensities.count(),
      db.supplements.count(),
      db.exercises.count(),
    ]);
    return {
      mealEntries,
      pendingTexts,
      dayMeta,
      trainingSessions,
      bodyCompositions,
      boneDensities,
      supplements,
      exercises,
    };
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
            <Row label="食品マスタ" value={`${foods?.length ?? 0} 件`} />
            <Row label="食事記録" value={`${counts?.mealEntries ?? 0} 件`} />
            <Row
              label="未処理テキスト"
              value={`${counts?.pendingTexts ?? 0} 件`}
            />
            <Row label="固定ベース" value={`${shortcutSets?.length ?? 0} 件`} />
            <Row
              label="日の区分（手動）"
              value={`${counts?.dayMeta ?? 0} 件`}
            />
            <Row label="種目マスタ" value={`${counts?.exercises ?? 0} 件`} />
            <Row
              label="トレ記録"
              value={`${counts?.trainingSessions ?? 0} 件`}
            />
            <Row label="体組成" value={`${counts?.bodyCompositions ?? 0} 件`} />
            <Row label="骨密度" value={`${counts?.boneDensities ?? 0} 件`} />
            <Row label="サプリ" value={`${counts?.supplements ?? 0} 件`} />
          </dl>
        </div>

        {(shortcutSets ?? []).map((set) => {
          const rows = set.items.map((item) => {
            const food = foodById.get(item.foodId);
            return {
              item,
              food,
              value: food ? scaleNutrition(food.per, item.quantity) : null,
            };
          });
          const total = sumNutrition(
            rows.flatMap((row) => (row.value ? [row.value] : [])),
          );
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
                      {fmtStored(row.value?.kcal ?? null)}kcal / P
                      {fmtNum(row.value?.proteinG ?? null)} / 脂質
                      {fmtNum(row.value?.fatG ?? null)} / 塩分
                      {fmtNum(row.value?.saltG ?? null)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 border-t border-slate-300 pt-1 text-sm font-medium tabular-nums">
                計 {fmtStored(total.value.kcal)}kcal / P
                {fmtNum(total.value.proteinG)}g / 脂質
                {fmtNum(total.value.fatG)}g / 塩分
                {fmtNum(total.value.saltG)}g
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
                    {food.variantLabel && (
                      <Badge tone="blue">{food.variantLabel}</Badge>
                    )}
                    {food.source === "estimated" && (
                      <Badge tone="amber">推定値</Badge>
                    )}
                    {food.archived && <Badge tone="slate">在庫切れ</Badge>}
                    {food.useCount > 0 && (
                      <span className="text-[11px] text-slate-400">
                        {food.useCount}回
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs tabular-nums text-slate-600">
                    {/* 保存値をそのままの精度で出す（開発用の確認なので丸めない） */}
                    {food.unitLabel} / {fmtStored(food.per.kcal)}kcal / P
                    {fmtStored(food.per.proteinG)}g / 脂質
                    {fmtStored(food.per.fatG)}g / 炭水
                    {fmtStored(food.per.carbG)}g / 塩分
                    {fmtStored(food.per.saltG)}g
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    入力時: {food.basis.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    呼び名: {aliases.length > 0 ? aliases.join(" / ") : "—"}
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
