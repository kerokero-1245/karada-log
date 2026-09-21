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
 */
import { useMemo, useState } from 'react';
import { db } from '../../db/db';
import type { Food, LogDate, Nutrition } from '../../db/types';
import { Sheet } from '../../components/Sheet';
import { TimeField } from '../../components/TimeField';
import { Badge, Button, Note } from '../../components/ui';
import { useLiveQuery } from '../../lib/useLiveQuery';
import { formatLogDateShort, nowTime } from '../../lib/date';
import { formatQuantity } from '../../lib/meals';
import { fmtNum, scaleNutrition, sumNutrition } from '../../lib/nutrition';
import { commitQuickText } from '../../lib/quickRecord';
import type { QuickCommitResult, QuickEntryPlan, QuickPendingPlan } from '../../lib/quickRecord';
import { QUICK_STATUS_LABELS, groupKeyOf, interpret, quantityFor, sortVariants } from '../../lib/quickText';
import type { QuickResolution, QuickStatus } from '../../lib/quickText';
import { ModeTabs } from './ModeTabs';
import { FoodPickerSheet } from './FoodPickerSheet';
import { NewFoodForm } from './NewFoodForm';

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
  /** 確定した食品。決まっていなければ null */
  food: Food | null;
  status: QuickStatus;
  /** 手で解決したか（呼び名を覚える対象） */
  manual: boolean;
  quantity: number;
  notes: string[];
  /** 同じ variantGroupId の兄弟。2件以上ならチップで切り替えられる */
  variants: Food[];
}

const STATUS_TONE: Record<QuickStatus, 'emerald' | 'amber' | 'red'> = {
  confirmed: 'emerald',
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

  const resolutions = useMemo(() => interpret(text, foodList), [text, foodList]);

  const rows: Row[] = resolutions.map((resolution, index) => {
    const choice = choices[index];
    const picked = choice === undefined ? undefined : foodList.find((food) => food.id === choice.foodId);
    const food = picked ?? resolution.food;
    const quantity = food === null ? null : quantityFor(resolution.parsed, food);
    return {
      index,
      resolution,
      food,
      status: food === null ? resolution.status : 'confirmed',
      manual: choice?.manual ?? false,
      quantity: quantity === null ? 1 : quantity.quantity,
      notes: quantity === null ? [] : quantity.notes,
      variants:
        food === null ? [] : sortVariants(foodList.filter((item) => groupKeyOf(item) === groupKeyOf(food))),
    };
  });

  const entries: QuickEntryPlan[] = [];
  const pending: QuickPendingPlan[] = [];
  for (const row of rows) {
    const itemTime = row.resolution.parsed.time ?? time;
    if (row.food === null) {
      pending.push({
        raw: row.resolution.parsed.raw,
        reason: row.status === 'missing' ? '見つかりませんでした' : '候補から選べていません',
        time: itemTime,
      });
    } else {
      entries.push({
        food: row.food,
        quantity: row.quantity,
        time: itemTime,
        raw: row.resolution.parsed.raw,
        manual: row.manual,
        learnText: row.resolution.parsed.name,
      });
    }
  }

  const total = sumNutrition(
    rows
      .map((row) => (row.food === null ? null : scaleNutrition(row.food.per, row.quantity)))
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
              {fmtNum(total.value.kcal)}kcal / P{fmtNum(total.value.proteinG)}g / 脂質
              {fmtNum(total.value.fatG)}g / 塩分{fmtNum(total.value.saltG)}g
            </p>
          </div>
          <Button
            variant="primary"
            className="h-14 w-full text-base"
            disabled={saving || (entries.length === 0 && pending.length === 0)}
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
          </Note>
        </div>

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
  const food = row.food;
  const value = food === null ? null : scaleNutrition(food.per, row.quantity);
  const hasUnknown =
    value !== null &&
    (value.kcal === null || value.proteinG === null || value.fatG === null || value.saltG === null);

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs tabular-nums text-slate-500">{parsed.time ?? fallbackTime}</span>
        <span className="text-xs text-slate-500">「{parsed.raw}」</span>
        <Badge tone={STATUS_TONE[row.status]}>{QUICK_STATUS_LABELS[row.status]}</Badge>
        {row.manual && <Badge tone="violet">選んだ</Badge>}
      </div>

      {food !== null && value !== null ? (
        <>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <span className="text-sm font-bold text-slate-800">{food.name}</span>
            {food.variantLabel !== null && <Badge tone="blue">{food.variantLabel}</Badge>}
            {food.source === 'estimated' && <Badge tone="amber">推定値</Badge>}
            {food.archived && <Badge tone="slate">在庫切れ</Badge>}
            <span className="text-sm tabular-nums text-slate-700">
              × {formatQuantity(row.quantity)} {food.unitLabel}
            </span>
          </div>

          <p className="mt-0.5 text-xs tabular-nums text-slate-600">
            {fmtNum(value.kcal)}kcal / P{fmtNum(value.proteinG)}g / 脂質{fmtNum(value.fatG)}g / 塩分
            {fmtNum(value.saltG)}g
            {hasUnknown && <span className="ml-1 text-slate-500">（「—」は未確認）</span>}
          </p>

          {row.variants.length > 1 && (
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
          {row.status === 'missing'
            ? '食品マスタに見つかりませんでした。'
            : `候補が${row.resolution.candidates.length}件あります。どれか選んでください。`}
        </p>
      )}

      {row.notes.map((note) => (
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
        {row.status === 'missing' && (
          <Button className="px-3 text-xs" onClick={onOpenNewFood}>
            この名前で新規登録
          </Button>
        )}
      </div>
    </li>
  );
}
