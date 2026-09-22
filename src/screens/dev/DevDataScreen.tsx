/**
 * 「設定」タブ。
 * 目標値は読み取り専用で表示する（編集はまだ）。
 * 旧 App.tsx の確認ページは <details>「データ確認（開発用）」として残してある。
 */
import { db } from '../../db/db';
import type { Settings } from '../../db/types';
import { DAY_TYPE_LABELS } from '../../db/types';
import { Badge, Card, Note, Row } from '../../components/ui';
import { aliasesOf } from '../../lib/aliases';
import { formatLogDate } from '../../lib/date';
import { fmtNum, scaleNutrition, sumNutrition } from '../../lib/nutrition';
import { useLiveQuery } from '../../lib/useLiveQuery';
import { ApiKeyCard } from '../settings/ApiKeyCard';
import { ExportCard } from '../settings/ExportCard';
import { RestoreCard } from '../settings/RestoreCard';
import { DevRecordsSection } from './DevRecordsSection';

export function DevDataScreen({ settings }: { settings: Settings }) {
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const shortcutSets = useLiveQuery(() => db.shortcutSets.orderBy('order').toArray(), []);
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
    <div className="min-h-screen bg-slate-100 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="bg-slate-900 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
        <div className="mx-auto max-w-md">
          <h1 className="text-xl font-bold">設定</h1>
          <p className="mt-1 text-xs text-slate-300">データはこの端末の中だけに保存されます。</p>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 p-3">
        <Card title="目標値">
          <dl className="grid grid-cols-1 gap-x-3 text-sm">
            <Row label="基礎代謝（下限）" value={`${settings.bmrKcal} kcal`} />
            <Row label={DAY_TYPE_LABELS.rest} value={`${settings.restDayKcal} kcal`} />
            <Row label={DAY_TYPE_LABELS.gym} value={`${settings.gymDayKcal} kcal`} />
            <Row label="たんぱく質" value={`目標 ${settings.proteinTargetG}g / 上限 ${settings.proteinCapG}g`} />
            <Row label="脂質" value={`${settings.fatTargetG} g`} />
            <Row label="塩分" value={`${settings.saltLimitG}g以内 / 週平均${settings.weeklySaltAverageG}g`} />
            <Row
              label="週合計"
              value={`${settings.weeklyKcalTarget.toLocaleString('ja-JP')} ± ${settings.weeklyKcalTolerance} kcal`}
            />
            <Row label="日付の境界" value={`朝${settings.dayBoundaryHour}時`} />
            <Row label="週の起点" value={settings.weekStartsOn === 1 ? '月曜' : String(settings.weekStartsOn)} />
            <Row
              label="次回測定日"
              value={settings.nextMeasurementDate ? formatLogDate(settings.nextMeasurementDate) : '—'}
            />
            <Row
              label="目標ライン"
              value={`脂肪 ${settings.goal.fatMassKg}kg / 除脂肪 ${settings.goal.leanMassKg}kg`}
            />
          </dl>
          <Note>値の編集はまだできません。ダッシュボードの目標はここの値を読んでいます。</Note>
        </Card>

        <ApiKeyCard settings={settings} />

        <ExportCard settings={settings} />

        <RestoreCard />

        <Card title="このステップでできること">
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
            <li>「今日」タブ: 進捗バー・記録の一覧・固定ベースの追加・記録の編集と削除</li>
            <li>テキストでまとめて記録（ダッシュボードの入力欄 / 記録シートの「テキスト」タブ）</li>
            <li>写真から記録（APIキーを入れると、記録シートに「写真から」が出ます）</li>
            <li>期間を選んで Markdown を書き出す（チャットに貼る用）。全データの JSON バックアップと復元</li>
            <li>トレ / からだ / 週 タブは次のステップで作ります</li>
          </ul>
        </Card>

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
                <Row label="未処理テキスト" value={`${counts?.pendingTexts ?? 0} 件`} />
                <Row label="固定ベース" value={`${shortcutSets?.length ?? 0} 件`} />
                <Row label="日の区分（手動）" value={`${counts?.dayMeta ?? 0} 件`} />
                <Row label="種目マスタ" value={`${counts?.exercises ?? 0} 件`} />
                <Row label="トレ記録" value={`${counts?.trainingSessions ?? 0} 件`} />
                <Row label="体組成" value={`${counts?.bodyCompositions ?? 0} 件`} />
                <Row label="骨密度" value={`${counts?.boneDensities ?? 0} 件`} />
                <Row label="サプリ" value={`${counts?.supplements ?? 0} 件`} />
              </dl>
            </div>

            {(shortcutSets ?? []).map((set) => {
              const rows = set.items.map((item) => {
                const food = foodById.get(item.foodId);
                return { item, food, value: food ? scaleNutrition(food.per, item.quantity) : null };
              });
              const total = sumNutrition(rows.flatMap((row) => (row.value ? [row.value] : [])));
              return (
                <div key={set.id}>
                  <h3 className="mb-1 text-xs font-bold text-slate-500">{set.name}（計画。実績ではない）</h3>
                  <ul className="divide-y divide-slate-100 text-sm">
                    {rows.map((row, index) => (
                      <li key={index} className="flex flex-wrap justify-between gap-x-2 py-1">
                        <span>
                          <span className="mr-1 text-xs text-slate-400">{row.item.timing}</span>
                          {row.food?.name ?? '(不明な食品)'} × {row.item.quantity}
                        </span>
                        <span className="text-xs tabular-nums text-slate-600">
                          {fmtNum(row.value?.kcal ?? null)}kcal / P{fmtNum(row.value?.proteinG ?? null)} / 脂質
                          {fmtNum(row.value?.fatG ?? null)} / 塩分{fmtNum(row.value?.saltG ?? null)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 border-t border-slate-300 pt-1 text-sm font-medium tabular-nums">
                    計 {fmtNum(total.value.kcal)}kcal / P{fmtNum(total.value.proteinG)}g / 脂質
                    {fmtNum(total.value.fatG)}g / 塩分{fmtNum(total.value.saltG)}g
                  </p>
                </div>
              );
            })}

            <div>
              <h3 className="mb-1 text-xs font-bold text-slate-500">食品マスタ（1単位あたりに正規化済み）</h3>
              <ul className="divide-y divide-slate-100">
                {(foods ?? []).map((food) => {
                  const aliases = aliasesOf(food);
                  return (
                    <li key={food.id} className="py-2">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-sm font-medium">{food.name}</span>
                        {food.variantLabel && <Badge tone="blue">{food.variantLabel}</Badge>}
                        {food.source === 'estimated' && <Badge tone="amber">推定値</Badge>}
                        {food.archived && <Badge tone="slate">在庫切れ</Badge>}
                        {food.useCount > 0 && <span className="text-[11px] text-slate-400">{food.useCount}回</span>}
                      </div>
                      <div className="mt-0.5 text-xs tabular-nums text-slate-600">
                        {food.unitLabel} / {fmtNum(food.per.kcal)}kcal / P{fmtNum(food.per.proteinG)}g / 脂質
                        {fmtNum(food.per.fatG)}g / 炭水{fmtNum(food.per.carbG)}g / 塩分{fmtNum(food.per.saltG)}g
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">入力時: {food.basis.label}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        呼び名: {aliases.length > 0 ? aliases.join(' / ') : '—'}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <DevRecordsSection />
          </div>
        </details>
      </main>
    </div>
  );
}
