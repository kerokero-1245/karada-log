/**
 * チャット風テキストでまとめて記録する（F2 の拡張）。
 *
 * ★ 書いた時点では何も起きない。★
 *   解釈（lib/quickText.ts）は純関数で、DB を触らない。
 *   下の「○件を記録」を押したときに初めて MealEntry ができる（原則1）。
 *
 * 画面の約束:
 *  - 原文を必ず左に出す。「何と書いたものが、何になったか」を隠さない
 *  - 確定できなかったものを「たぶんこれ」で埋めない。未処理として預かる
 *  - 数量を勝手に変えたとき（商品名の一部だった / g換算できない）は、その理由を書く
 *  - 栄養値を書いた行（'ご飯 1杯=252/3.8/0.5/55.7/0'）は、マスタに無ければ「推定」として
 *    その値のまま記録する。マスタに当たったときは **マスタの値** を使い、そう書く
 */
import { useMemo, useState } from 'react';
import { db } from '../../db/db';
import type { Food, LogDate, Nutrition } from '../../db/types';
import { Sheet } from '../../components/Sheet';
import { CopyPromptButton } from '../../components/CopyPromptButton';
import { TimeField } from '../../components/TimeField';
import { Badge, Button, Note } from '../../components/ui';
import { useLiveQuery } from '../../lib/useLiveQuery';
import { formatLogDateShort, hasTime, nowTime } from '../../lib/date';
import { buildEntryView } from '../../lib/importText';
import type { EntryView } from '../../lib/importText';
import { formatQuantity } from '../../lib/meals';
import { fmtNum, scaleNutrition, sumNutrition } from '../../lib/nutrition';
import { commitQuickText } from '../../lib/quickRecord';
import type { QuickCommitResult, QuickEntryPlan, QuickPendingPlan } from '../../lib/quickRecord';
import { QUICK_STATUS_LABELS, groupKeyOf, interpret, sortVariants } from '../../lib/quickText';
import type { QuickResolution, QuickStatus } from '../../lib/quickText';
import { ModeTabs } from './ModeTabs';
import { FoodPickerSheet } from './FoodPickerSheet';
import { NewFoodForm } from './NewFoodForm';
import { fmtKcal, fmtKcalItem } from '../../lib/formatKcal';

const NO_FOODS: Food[] = [];

const PLACEHOLDER = 'ザバス2本 / マカダミア30g / スムージー\n21:30 家系ラーメン';

type Sub =
  | { kind: 'preview' }
  | { kind: 'candidates'; index: number }
  | { kind: 'pick'; index: number }
  | { kind: 'newFood'; index: number; name: string };

interface Row {
  index: number;
  resolution: QuickResolution;
  view: EntryView;
  /** 同じ variantGroupId の兄弟。2件以上ならチップで切り替えられる */
  variants: Food[];
}

const STATUS_TONE: Record<QuickStatus, 'emerald' | 'amber' | 'red'> = {
  confirmed: 'emerald',
  estimated: 'amber',
  ambiguous: 'amber',
  missing: 'red',
};

export function QuickTextSheet({
  logDate,
  boundaryHour,
  apiKey = null,
  initialText,
  pendingId,
  onClose,
  onRecorded,
  onSwitchToSearch,
  onPhoto,
}: {
  logDate: LogDate;
  boundaryHour: number;
  /** 設定済みの Claude API キー。null なら「写真から」は出さない */
  apiKey?: string | null;
  initialText: string;
  /** 未処理テキストから開いたときの元の行。記録したら消す */
  pendingId: number | null;
  onClose: () => void;
  onRecorded: (result: QuickCommitResult) => void;
  onSwitchToSearch: () => void;
  onPhoto?: () => void;
}) {
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const foodList = foods ?? NO_FOODS;

  const [text, setText] = useState(initialText);
  const [time, setTime] = useState(() => nowTime());
  const [choices, setChoices] = useState<Record<number, { foodId: number; manual: boolean }>>({});
  const [sub, setSub] = useState<Sub>({ kind: 'preview' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolutions = useMemo(() => interpret(text, foodList, logDate), [text, foodList, logDate]);

  const rows: Row[] = resolutions.map((resolution, index) => {
    const choice = choices[index];
    const picked =
      choice === undefined ? null : (foodList.find((food) => food.id === choice.foodId) ?? null);
    const view = buildEntryView(resolution, picked, choice?.manual ?? false);
    return {
      index,
      resolution,
      view,
      variants:
        view.food === null
          ? []
          : sortVariants(foodList.filter((item) => groupKeyOf(item) === groupKeyOf(view.food as Food))),
    };
  });

  // 下の時刻欄の値を使う項目があるか（先頭に「21:30」と書いた項目はそちらを使う）。
  // 使う項目があるのに時刻欄が空なら、時刻なしの記録にならないよう保存を止める
  const fallbackTimeUsed = rows.length === 0 || rows.some((row) => row.resolution.parsed.time === null);
  const timeMissing = fallbackTimeUsed && !hasTime(time);

  // この画面は1日ぶんの記録なので、日付の行があっても日付は動かさない（取り込みシートの担当）
  const otherDates = rows
    .map((row) => row.resolution.parsed.logDate)
    .filter((date): date is LogDate => date !== null && date !== logDate);

  const entries: QuickEntryPlan[] = [];
  const pending: QuickPendingPlan[] = [];
  for (const row of rows) {
    const parsed = row.resolution.parsed;
    const itemTime = parsed.time ?? time;
    if (row.view.food === null && row.view.estimated === null) {
      pending.push({
        raw: parsed.raw,
        reason: row.view.status === 'missing' ? '見つかりませんでした' : '候補から選べていません',
        time: itemTime,
      });
    } else {
      entries.push({
        food: row.view.food,
        draft: row.view.estimated?.draft ?? null,
        quantity: row.view.quantity,
        time: itemTime,
        raw: parsed.raw,
        manual: row.view.manual,
        learnText: parsed.name,
      });
    }
  }

  const total = sumNutrition(
    rows
      .map((row) =>
        row.view.food === null && row.view.estimated === null
          ? null
          : scaleNutrition(row.view.per, row.view.quantity),
      )
      .filter((value): value is Nutrition => value !== null),
  );

  const choose = (index: number, food: Food, manual: boolean) => {
    const id = food.id;
    if (id === undefined) return;
    setChoices((prev) => ({ ...prev, [index]: { foodId: id, manual } }));
    setSub({ kind: 'preview' });
  };

  // テキストを直したら項目の位置がずれるので、手で選んだ結果はいったん捨てる
  const changeText = (next: string) => {
    setText(next);
    setChoices({});
  };

  const record = async () => {
    if (entries.length === 0 && pending.length === 0) return;
    if (timeMissing) return;
    setSaving(true);
    setError(null);
    try {
      const result = await commitQuickText(logDate, entries, pending, pendingId, boundaryHour);
      onRecorded(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  /* --- 下位の画面 --- */

  const target = sub.kind === 'preview' ? undefined : rows[sub.index];

  if (sub.kind === 'pick' && target !== undefined) {
    return (
      <FoodPickerSheet
        subtitle={`「${target.resolution.parsed.raw}」に使う食品`}
        initialQuery={target.resolution.parsed.name}
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
        apiKey={apiKey}
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
        subtitle={`「${target.resolution.parsed.raw}」`}
        onBack={() => setSub({ kind: 'preview' })}
        onClose={onClose}
      >
        <div className="space-y-2">
          {target.resolution.candidates.map((candidate) => {
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
                    {first.unitLabel} / {fmtKcalItem(first.per.kcal)}kcal / P{fmtNum(first.per.proteinG)}g / 脂質
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
          <Note>選んだ食品は、この原文の呼び名として覚えます（他の食品とぶつからないときだけ）。</Note>
        </div>
      </Sheet>
    );
  }

  /* --- プレビュー本体 --- */

  return (
    <Sheet
      title="記録する"
      subtitle={`${formatLogDateShort(logDate)} の記録`}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <div>
            <p className="text-xs text-slate-500">記録する{entries.length}件の合計</p>
            <p className="text-sm font-bold tabular-nums text-slate-800">
              {fmtKcal(total.value.kcal)}kcal / P{fmtNum(total.value.proteinG)}g / 脂質
              {fmtNum(total.value.fatG)}g / 塩分{fmtNum(total.value.saltG)}g
            </p>
          </div>
          <Button
            variant="primary"
            className="h-14 w-full text-base"
            disabled={saving || timeMissing || (entries.length === 0 && pending.length === 0)}
            onClick={record}
          >
            {entries.length}件を記録
            {pending.length > 0 ? `（${pending.length}件は未処理として保存）` : ''}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <ModeTabs
          mode="text"
          onChange={(next) => {
            if (next === 'search') onSwitchToSearch();
          }}
        />

        {apiKey !== null && onPhoto !== undefined && (
          <Button className="w-full" onClick={onPhoto}>
            写真から
          </Button>
        )}

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <label className="block">
            <span className="block text-xs font-bold text-slate-600">食べたもの</span>
            <textarea
              value={text}
              onChange={(e) => changeText(e.target.value)}
              rows={3}
              placeholder={PLACEHOLDER}
              aria-label="食べたもの"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
            />
          </label>
          <Note>
            「/」「、」「＋」「・」改行 で区切ります。数量は「2本」「30g」「3玉」のように書けます。
            先頭に「21:30」と書くと、その項目だけ時刻を変えられます。
            「ご飯 1杯=252/3.8/0.5/55.7/0」のように =kcal/P/脂質/炭水化物/塩分 を付けると、
            マスタに無いものもその値で記録できます。
          </Note>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <CopyPromptButton />
        </div>

        {otherDates.length > 0 && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
            日付の行がありますが、この画面は{formatLogDateShort(logDate)}の記録として保存します。
            何日ぶんかをまとめて入れるときは、設定タブの「記録を貼り付けて取り込む」を使ってください。
          </div>
        )}

        {rows.length === 0 ? (
          <p className="rounded-xl bg-white p-4 text-center text-sm text-slate-500">
            食べたものを書くと、ここに解釈した結果が出ます。まだ記録には入りません。
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl bg-white px-3">
            {rows.map((row) => (
              <PreviewRow
                key={row.index}
                row={row}
                fallbackTime={time}
                onPickVariant={(food) => choose(row.index, food, false)}
                onOpenCandidates={() => setSub({ kind: 'candidates', index: row.index })}
                onOpenPicker={() => setSub({ kind: 'pick', index: row.index })}
                onOpenNewFood={() =>
                  setSub({ kind: 'newFood', index: row.index, name: row.resolution.parsed.name })
                }
              />
            ))}
          </ul>
        )}

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <TimeField
            value={time}
            onChange={setTime}
            logDate={logDate}
            boundaryHour={boundaryHour}
            label="時刻（時刻を書いた項目はそちらが優先されます）"
            required={fallbackTimeUsed}
          />
        </div>

        {pending.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            解決できていない{pending.length}件は、栄養値を付けずに原文のまま預かります。
            集計には入りません。あとで「未処理のテキスト」から続きができます。
          </div>
        )}

        {error !== null && <p className="text-sm text-red-700">保存できませんでした: {error}</p>}

        <Note>栄養値は記録した時点の値をコピーして残します。原文もそのまま記録に残ります。</Note>
      </div>
    </Sheet>
  );
}

function PreviewRow({
  row,
  fallbackTime,
  onPickVariant,
  onOpenCandidates,
  onOpenPicker,
  onOpenNewFood,
}: {
  row: Row;
  fallbackTime: string;
  onPickVariant: (food: Food) => void;
  onOpenCandidates: () => void;
  onOpenPicker: () => void;
  onOpenNewFood: () => void;
}) {
  const parsed = row.resolution.parsed;
  const view = row.view;
  const food = view.food;
  const resolved = food !== null || view.estimated !== null;
  const value = resolved ? scaleNutrition(view.per, view.quantity) : null;
  const hasUnknown =
    value !== null &&
    (value.kcal === null || value.proteinG === null || value.fatG === null || value.saltG === null);

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs tabular-nums text-slate-500">{parsed.time ?? fallbackTime}</span>
        <span className="text-xs text-slate-500">「{parsed.raw}」</span>
        <Badge tone={STATUS_TONE[view.status]}>{QUICK_STATUS_LABELS[view.status]}</Badge>
        {view.usesMasterValues && <Badge tone="blue">マスタの値</Badge>}
        {view.manual && <Badge tone="violet">選んだ</Badge>}
      </div>

      {resolved && value !== null ? (
        <>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <span className="text-sm font-bold text-slate-800">{food?.name ?? parsed.name}</span>
            {food?.variantLabel != null && <Badge tone="blue">{food.variantLabel}</Badge>}
            {food?.source === 'estimated' && <Badge tone="amber">推定値</Badge>}
            {food?.archived === true && <Badge tone="slate">在庫切れ</Badge>}
            <span className="text-sm tabular-nums text-slate-700">
              {formatQuantity(view.quantity)} × {view.unitLabel}
            </span>
          </div>

          <p className="mt-0.5 text-xs tabular-nums text-slate-600">
            {fmtKcalItem(value.kcal)}kcal / P{fmtNum(value.proteinG)}g / 脂質{fmtNum(value.fatG)}g / 塩分
            {fmtNum(value.saltG)}g
            {hasUnknown && <span className="ml-1 text-slate-500">（「—」は未確認）</span>}
          </p>

          {view.usesMasterValues && (
            <p className="mt-0.5 text-[11px] text-slate-500">マスタの値を使います。</p>
          )}

          {row.variants.length > 1 && food !== null && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {row.variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => onPickVariant(variant)}
                  className={`min-h-11 rounded-full px-3 text-xs font-bold ${
                    variant.id === food.id
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-300 bg-white text-slate-600'
                  }`}
                >
                  {variant.variantLabel ?? '標準'}（塩分{fmtNum(variant.per.saltG)}g）
                </button>
              ))}
            </div>
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
        {view.status === 'missing' && (
          <Button className="px-3 text-xs" onClick={onOpenNewFood}>
            この名前で新規登録
          </Button>
        )}
      </div>
    </li>
  );
}
