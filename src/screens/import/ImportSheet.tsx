/**
 * 記録を貼り付けて取り込む（F2 の拡張）。
 *
 * ★ 貼った時点でも、解釈した時点でも、まだ何も起きない。★
 *   下の「○件を取り込む」を押したときに初めて、推定食品・記録・未処理ができる（原則1）。
 *   プレビューを開いている間、ダッシュボードのバーは動かない。
 *
 * 画面の約束（テキスト記録・写真のプレビューと同じ）:
 *  - 原文を必ず出す。「何と書いてあったものが、何になったか」を隠さない
 *  - マスタの値を使ったのか、貼り付けた値からの推定なのかをバッジで区別する
 *  - 確定できなかったものを「たぶんこれ」で埋めない。未処理として預かる
 *  - 時刻・日付を補ったときは、補ったと書く
 */
import { useMemo, useState } from 'react';
import { db } from '../../db/db';
import type { Food, LogDate, Nutrition } from '../../db/types';
import { Sheet } from '../../components/Sheet';
import { CopyPromptButton } from '../../components/CopyPromptButton';
import { Badge, Button, Chip, Note } from '../../components/ui';
import { formatLogDate, formatLogDateShort } from '../../lib/date';
import { formatQuantity } from '../../lib/meals';
import { fmtNum, scaleNutrition, sumNutrition } from '../../lib/nutrition';
import { commitImport } from '../../lib/importRecord';
import type { ImportCommitResult, ImportDayPlan } from '../../lib/importRecord';
import { DEFAULT_IMPORT_TIME, buildEntryView, parseImport } from '../../lib/importText';
import type { EntryView, ImportRow } from '../../lib/importText';
import type { QuickEntryPlan, QuickPendingPlan } from '../../lib/quickRecord';
import { QUICK_STATUS_LABELS } from '../../lib/quickText';
import type { QuickStatus } from '../../lib/quickText';
import { useLiveQuery } from '../../lib/useLiveQuery';
import { FoodPickerSheet } from '../meal/FoodPickerSheet';
import { NewFoodForm } from '../meal/NewFoodForm';

const NO_FOODS: Food[] = [];

const PLACEHOLDER = `2026/09/20
12:30 ご飯 1杯=252/3.8/0.5/55.7/0
21:00 味付ゆで玉子 2個=130/11.6/8.6/-/1.2`;

const STATUS_TONE: Record<QuickStatus, 'emerald' | 'amber' | 'red'> = {
  confirmed: 'emerald',
  estimated: 'amber',
  ambiguous: 'amber',
  missing: 'red',
};

type Sub =
  | { kind: 'preview' }
  | { kind: 'candidates'; index: number }
  | { kind: 'pick'; index: number }
  | { kind: 'newFood'; index: number; name: string };

interface Choice {
  foodId: number;
  manual: boolean;
}

interface ViewRow {
  row: ImportRow;
  view: EntryView;
  /** 数量ぶんの値（未確認は null のまま） */
  value: Nutrition;
}

export function ImportSheet({
  today,
  boundaryHour,
  onClose,
}: {
  today: LogDate;
  boundaryHour: number;
  onClose: () => void;
}) {
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const foodList = foods ?? NO_FOODS;

  const [text, setText] = useState('');
  /** 「解釈する」を押した時点のテキスト。押すまでプレビューは出ない */
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [replacing, setReplacing] = useState<Record<LogDate, boolean>>({});
  const [sub, setSub] = useState<Sub>({ kind: 'preview' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  const parsed = useMemo(
    () => (submitted === null ? null : parseImport(submitted, foodList, today)),
    [submitted, foodList, today],
  );

  const dayKeys = (parsed?.days ?? []).map((day) => day.logDate).join(',');
  // その日にすでに何件あるか（置き換えの判断材料）。記録を入れると自動で追いつく
  const existing = useLiveQuery(async () => {
    const counts: Record<string, number> = {};
    for (const key of dayKeys === '' ? [] : dayKeys.split(',')) {
      counts[key] = await db.mealEntries.where('logDate').equals(key).count();
    }
    return counts;
  }, [dayKeys]);

  const viewOf = (row: ImportRow): ViewRow => {
    const choice = choices[row.index];
    const picked =
      choice === undefined ? null : (foodList.find((food) => food.id === choice.foodId) ?? null);
    const view = buildEntryView(row.resolution, picked, choice?.manual ?? false);
    return { row, view, value: scaleNutrition(view.per, view.quantity) };
  };

  const days = (parsed?.days ?? []).map((day) => {
    const rows = day.rows.map(viewOf);
    const entries: QuickEntryPlan[] = [];
    const pending: QuickPendingPlan[] = [];

    for (const item of rows) {
      const parsedItem = item.row.resolution.parsed;
      if (item.view.food !== null || item.view.estimated !== null) {
        entries.push({
          food: item.view.food,
          draft: item.view.estimated?.draft ?? null,
          quantity: item.view.quantity,
          time: item.row.time,
          raw: parsedItem.raw,
          manual: item.view.manual,
          learnText: parsedItem.name,
        });
      } else {
        pending.push({
          raw: parsedItem.raw,
          reason: item.view.status === 'missing' ? '見つかりませんでした' : '候補から選べていません',
          time: item.row.time,
        });
      }
    }

    const recorded = rows.filter((item) => item.view.food !== null || item.view.estimated !== null);
    const total = sumNutrition(recorded.map((item) => item.value));
    const unknown = recorded.filter(
      (item) =>
        item.value.kcal === null ||
        item.value.proteinG === null ||
        item.value.fatG === null ||
        item.value.saltG === null,
    ).length;

    return {
      logDate: day.logDate,
      rows,
      entries,
      pending,
      total,
      unknown,
      replace: replacing[day.logDate] === true,
      existingCount: existing?.[day.logDate] ?? 0,
    };
  });

  const plans: ImportDayPlan[] = days.map((day) => ({
    logDate: day.logDate,
    replace: day.replace,
    entries: day.entries,
    pending: day.pending,
  }));

  const addedCount = plans.reduce((sum, plan) => sum + plan.entries.length, 0);
  const pendingCount = plans.reduce((sum, plan) => sum + plan.pending.length, 0);

  const choose = (index: number, food: Food, manual: boolean) => {
    const id = food.id;
    if (id === undefined) return;
    setChoices((prev) => ({ ...prev, [index]: { foodId: id, manual } }));
    setSub({ kind: 'preview' });
  };

  const interpretText = () => {
    setChoices({});
    setReplacing({});
    setError(null);
    setSubmitted(text);
  };

  const run = async () => {
    if (addedCount === 0 && pendingCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      setResult(await commitImport(plans, boundaryHour));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  };

  /* --- 完了 --- */

  if (result !== null) {
    return (
      <Sheet
        title="取り込みました"
        onClose={onClose}
        footer={
          <Button variant="primary" className="h-14 w-full text-base" onClick={onClose}>
            閉じる
          </Button>
        }
      >
        <div className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="text-base font-bold">
            {result.added}件を取り込みました（{result.days}日分）
          </p>
          {result.createdFoods > 0 && <p>推定の食品を{result.createdFoods}件つくりました。</p>}
          {result.removed > 0 && (
            <p>
              置き換えた{result.replacedDays}日ぶんの、前の記録{result.removed}件を消しました。
            </p>
          )}
          {result.pending > 0 && (
            <p>{result.pending}件は未処理として預かりました。集計には入っていません。</p>
          )}
          {result.learned.map((item) => (
            <p key={item.text}>
              次回から「{item.text}」はこの食品として認識します（{item.foodName}）。
            </p>
          ))}
        </div>
        <Note>ダッシュボードの「今日の進捗」は、今日のぶんだけが動きます。</Note>
      </Sheet>
    );
  }

  /* --- 下位の画面 --- */

  const allRows = days.flatMap((day) => day.rows);
  const target = sub.kind === 'preview' ? undefined : allRows.find((item) => item.row.index === sub.index);

  if (sub.kind === 'pick' && target !== undefined) {
    return (
      <FoodPickerSheet
        subtitle={`「${target.row.resolution.parsed.raw}」に使う食品`}
        initialQuery={target.row.resolution.parsed.name}
        onPick={(food) => choose(sub.index, food, true)}
        onNewFood={(name) => setSub({ kind: 'newFood', index: sub.index, name })}
        onBack={() => setSub({ kind: 'preview' })}
        onClose={onClose}
      />
    );
  }

  if (sub.kind === 'newFood' && target !== undefined) {
    return (
      <NewFoodForm
        initialName={sub.name}
        onSaved={(food) => choose(sub.index, food, true)}
        onBack={() => setSub({ kind: 'preview' })}
        onClose={onClose}
      />
    );
  }

  if (sub.kind === 'candidates' && target !== undefined) {
    return (
      <Sheet
        title="候補から選ぶ"
        subtitle={`「${target.row.resolution.parsed.raw}」`}
        onBack={() => setSub({ kind: 'preview' })}
        onClose={onClose}
      >
        <div className="space-y-2">
          {target.row.resolution.candidates.map((candidate) => {
            const first = candidate.foods[0];
            return (
              <button
                key={candidate.key}
                type="button"
                onClick={() => choose(sub.index, first, true)}
                className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm active:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-sm font-bold text-slate-800">{candidate.name}</span>
                    {candidate.foods.length > 1 && (
                      <Badge tone="blue">バリアント{candidate.foods.length}件</Badge>
                    )}
                    {first.source === 'estimated' && <Badge tone="amber">推定値</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
                    {first.unitLabel} / {fmtNum(first.per.kcal)}kcal / P{fmtNum(first.per.proteinG)}g / 脂質
                    {fmtNum(first.per.fatG)}g / 塩分{fmtNum(first.per.saltG)}g
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">{candidate.reason}</span>
                </span>
                <span className="text-slate-300">›</span>
              </button>
            );
          })}

          <Button className="w-full" onClick={() => setSub({ kind: 'pick', index: sub.index })}>
            一覧から探す
          </Button>
          <Note>
            選んだ食品の値を使います（貼り付けた値は使いません）。この原文は、その食品の呼び名として覚えます。
          </Note>
        </div>
      </Sheet>
    );
  }

  /* --- プレビュー本体 --- */

  return (
    <Sheet
      title="記録を貼り付けて取り込む"
      subtitle="claude.ai で見積もった結果を、そのまま貼る"
      onClose={onClose}
      footer={
        parsed === null ? undefined : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              {days.length}日分 ・ 推定で新しく作る食品{' '}
              {plans.reduce(
                (sum, plan) => sum + plan.entries.filter((entry) => entry.draft !== null).length,
                0,
              )}
              件
            </p>
            <Button
              variant="primary"
              className="h-14 w-full text-base"
              disabled={saving || (addedCount === 0 && pendingCount === 0)}
              onClick={() => void run()}
            >
              {addedCount}件を取り込む
              {pendingCount > 0 ? `（${pendingCount}件は未処理として保存）` : ''}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <CopyPromptButton />
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <label className="block">
            <span className="block text-xs font-bold text-slate-600">貼り付けたテキスト</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={PLACEHOLDER}
              aria-label="貼り付けたテキスト"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </label>
          <Button
            variant="primary"
            className="mt-2 w-full"
            disabled={text.trim() === ''}
            onClick={interpretText}
          >
            解釈する
          </Button>
          <Note>
            1行に1品目。「時刻 品目名 数量単位=kcal/P/脂質/炭水化物/塩分」。値はその行の数量ぶんの合計で、
            分からない値は「-」。日付だけの行で日をまたげます。押しても、まだ記録には入りません。
          </Note>
        </div>

        {parsed !== null && parsed.rows.length === 0 && (
          <p className="rounded-xl bg-white p-4 text-center text-sm text-slate-500">
            読み取れる品目がありませんでした。1行に1品目で書いてください。
          </p>
        )}

        {parsed !== null && parsed.usedToday && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
            日付の行が無いので、すべて今日（{formatLogDateShort(today)}）の記録として読みました。
          </div>
        )}

        {days.map((day) => (
          <section key={day.logDate} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-slate-200 pb-1">
              <h3 className="text-sm font-bold text-slate-700">{formatLogDate(day.logDate)}</h3>
              <span className="text-[11px] tabular-nums text-slate-500">
                この日の記録 {day.existingCount}件
              </span>
            </div>

            <ul className="divide-y divide-slate-100">
              {day.rows.map((item) => (
                <PreviewRow
                  key={item.row.index}
                  item={item}
                  onOpenCandidates={() => setSub({ kind: 'candidates', index: item.row.index })}
                  onOpenPicker={() => setSub({ kind: 'pick', index: item.row.index })}
                />
              ))}
            </ul>

            <p className="mt-1 border-t border-slate-200 pt-1 text-sm font-medium tabular-nums text-slate-800">
              この日の合計 {fmtNum(day.total.value.kcal)}kcal / P{fmtNum(day.total.value.proteinG)}g / 脂質
              {fmtNum(day.total.value.fatG)}g / 塩分{fmtNum(day.total.value.saltG)}g
            </p>
            {day.unknown > 0 && (
              <p className="text-[11px] text-slate-500">未確認の値を含む項目が{day.unknown}件あります。</p>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              <Chip
                selected={!day.replace}
                aria-pressed={!day.replace}
                className="px-3 text-xs"
                onClick={() => setReplacing((prev) => ({ ...prev, [day.logDate]: false }))}
              >
                追加する
              </Chip>
              <Chip
                selected={day.replace}
                aria-pressed={day.replace}
                className="px-3 text-xs"
                onClick={() => setReplacing((prev) => ({ ...prev, [day.logDate]: true }))}
              >
                この日の既存記録を置き換える
              </Chip>
            </div>
            {day.replace && (
              <p className="mt-1 text-xs text-amber-800">
                取り込むときに、この日の既存の記録{day.existingCount}件を消してから入れます。この操作は戻せません。
              </p>
            )}
          </section>
        ))}

        {pendingCount > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            解決できていない{pendingCount}件は、栄養値を付けずに原文のまま預かります。
            集計には入りません。あとで「未処理のテキスト」から続きができます。
          </div>
        )}

        {error !== null && <p className="text-sm text-red-700">取り込めませんでした: {error}</p>}

        <Note>
          栄養値は取り込んだ時点の値をコピーして残します。原文もそのまま記録に残ります。
          マスタに当たった品目は、貼り付けた値ではなくマスタの値を使います。
        </Note>
      </div>
    </Sheet>
  );
}

function PreviewRow({
  item,
  onOpenCandidates,
  onOpenPicker,
}: {
  item: ViewRow;
  onOpenCandidates: () => void;
  onOpenPicker: () => void;
}) {
  const { row, view, value } = item;
  const parsed = row.resolution.parsed;
  const name = view.food?.name ?? parsed.name;
  const hasUnknown =
    value.kcal === null || value.proteinG === null || value.fatG === null || value.saltG === null;
  const resolved = view.food !== null || view.estimated !== null;

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs tabular-nums text-slate-500">{row.time}</span>
        <span className="text-xs text-slate-500">「{parsed.raw}」</span>
        <Badge tone={STATUS_TONE[view.status]}>{QUICK_STATUS_LABELS[view.status]}</Badge>
        {view.usesMasterValues && <Badge tone="blue">マスタの値</Badge>}
        {view.manual && <Badge tone="violet">選んだ</Badge>}
      </div>

      {row.timeMissing && (
        <p className="text-[11px] text-slate-500">時刻なし → {DEFAULT_IMPORT_TIME}</p>
      )}

      {resolved ? (
        <>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <span className="text-sm font-bold text-slate-800">{name}</span>
            {view.food?.variantLabel != null && <Badge tone="blue">{view.food.variantLabel}</Badge>}
            {view.food?.source === 'estimated' && <Badge tone="amber">推定値</Badge>}
            {view.food?.archived === true && <Badge tone="slate">在庫切れ</Badge>}
            <span className="text-sm tabular-nums text-slate-700">
              × {formatQuantity(view.quantity)} {view.unitLabel}
            </span>
          </div>

          <p className="mt-0.5 text-xs tabular-nums text-slate-600">
            {fmtNum(value.kcal)}kcal / P{fmtNum(value.proteinG)}g / 脂質{fmtNum(value.fatG)}g / 塩分
            {fmtNum(value.saltG)}g
            {hasUnknown && <span className="ml-1 text-slate-500">（「—」は未確認）</span>}
          </p>

          {view.usesMasterValues && (
            <p className="mt-0.5 text-[11px] text-slate-500">マスタの値を使います。</p>
          )}
        </>
      ) : (
        <p className="mt-0.5 text-sm text-slate-700">
          {view.status === 'missing'
            ? '食品マスタに見つかりませんでした。'
            : `候補が${row.resolution.candidates.length}件あります。どれか選んでください。`}
        </p>
      )}

      {view.notes.map((note) => (
        <p key={note} className="mt-0.5 text-[11px] text-amber-700">
          ※ {note}
        </p>
      ))}

      <div className="mt-1 flex flex-wrap gap-2">
        {row.resolution.candidates.length > 1 && (
          <Button className="px-3 text-xs" onClick={onOpenCandidates}>
            候補から選ぶ（{row.resolution.candidates.length}件）
          </Button>
        )}
        <Button className="px-3 text-xs" onClick={onOpenPicker}>
          食品を選ぶ
        </Button>
      </div>
    </li>
  );
}
