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
import { useMemo, useState } from "react";
import type { Food, LogDate, Nutrition } from "../../db/types";
import { Sheet } from "../../components/Sheet";
import { CopyPromptButton } from "../../components/CopyPromptButton";
import { NutritionLine } from "../../components/NutritionLine";
import { TimeField } from "../../components/TimeField";
import {
  Button,
  EmptyState,
  ErrorText,
  Note,
  Notice,
  Panel,
} from "../../components/ui";
import { FieldLabel } from "../../components/Field";
import { formatLogDateShort, hasTime, nowTime } from "../../lib/date";
import { planEntries } from "../../lib/importText";
import type { EntryView } from "../../lib/importText";
import { scaleNutrition, sumNutrition } from "../../lib/nutrition";
import { commitQuickText } from "../../lib/quickRecord";
import type { QuickCommitResult } from "../../lib/quickRecord";
import { groupKeyOf, interpret, sortVariants } from "../../lib/quickText";
import type { QuickResolution } from "../../lib/quickText";
import { ModeTabs } from "./ModeTabs";
import { FoodPickerSheet } from "./FoodPickerSheet";
import { NewFoodForm } from "./NewFoodForm";
import { ResolvedItemRow } from "./ResolvedItemRow";
import type { EntrySub } from "./ResolvedItemRow";
import { CandidatePickerSheet } from "./CandidatePickerSheet";
import { errorMessage, SAVE_FAILED } from "../../lib/errors";
import { useFoods } from "../../lib/queries";
import { useEntryChoices } from "../../lib/useEntryChoices";

const NO_FOODS: Food[] = [];

const PLACEHOLDER =
  "ザバス2本 / マカダミア30g / スムージー\n21:30 家系ラーメン";

interface Row {
  index: number;
  resolution: QuickResolution;
  view: EntryView;
  /** 同じ variantGroupId の兄弟。2件以上ならチップで切り替えられる */
  variants: Food[];
}

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
  const foods = useFoods();
  const foodList = foods ?? NO_FOODS;

  const [text, setText] = useState(initialText);
  const [time, setTime] = useState(() => nowTime());
  const [sub, setSub] = useState<EntrySub>({ kind: "preview" });
  const { viewOf, choose, reset } = useEntryChoices(foodList, () =>
    setSub({ kind: "preview" }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolutions = useMemo(
    () => interpret(text, foodList, logDate),
    [text, foodList, logDate],
  );

  const rows: Row[] = resolutions.map((resolution, index) => {
    const view = viewOf(index, resolution);
    const viewFood = view.food;
    return {
      index,
      resolution,
      view,
      variants:
        viewFood === null
          ? []
          : sortVariants(
              foodList.filter(
                (item) => groupKeyOf(item) === groupKeyOf(viewFood),
              ),
            ),
    };
  });

  // 下の時刻欄の値を使う項目があるか（先頭に「21:30」と書いた項目はそちらを使う）。
  // 使う項目があるのに時刻欄が空なら、時刻なしの記録にならないよう保存を止める
  const fallbackTimeUsed =
    rows.length === 0 ||
    rows.some((row) => row.resolution.parsed.time === null);
  const timeMissing = fallbackTimeUsed && !hasTime(time);

  // この画面は1日ぶんの記録なので、日付の行があっても日付は動かさない（取り込みシートの担当）
  const otherDates = rows
    .map((row) => row.resolution.parsed.logDate)
    .filter((date): date is LogDate => date !== null && date !== logDate);

  const { entries, pending } = planEntries(
    rows.map((row) => ({
      parsed: row.resolution.parsed,
      view: row.view,
      time: row.resolution.parsed.time ?? time,
    })),
  );

  const total = sumNutrition(
    rows
      .map((row) =>
        row.view.food === null && row.view.estimated === null
          ? null
          : scaleNutrition(row.view.per, row.view.quantity),
      )
      .filter((value): value is Nutrition => value !== null),
  );

  // テキストを直したら項目の位置がずれるので、手で選んだ結果はいったん捨てる
  const changeText = (next: string) => {
    setText(next);
    reset();
  };

  const record = async () => {
    if (entries.length === 0 && pending.length === 0) return;
    if (timeMissing) return;
    setSaving(true);
    setError(null);
    try {
      const result = await commitQuickText(
        logDate,
        entries,
        pending,
        pendingId,
        boundaryHour,
      );
      onRecorded(result);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  /* --- 下位の画面 --- */

  const target = sub.kind === "preview" ? undefined : rows[sub.index];

  if (sub.kind === "pick" && target !== undefined) {
    return (
      <FoodPickerSheet
        subtitle={`「${target.resolution.parsed.raw}」に使う食品`}
        initialQuery={target.resolution.parsed.name}
        onPick={(food) => choose(sub.index, food, true)}
        onNewFood={(name) =>
          setSub({ kind: "newFood", index: sub.index, name })
        }
        onBack={() => setSub({ kind: "preview" })}
        onClose={onClose}
      />
    );
  }

  if (sub.kind === "newFood" && target !== undefined) {
    return (
      <NewFoodForm
        initialName={sub.name}
        apiKey={apiKey}
        onSaved={(food) => choose(sub.index, food, true)}
        onBack={() => setSub({ kind: "preview" })}
        onClose={onClose}
      />
    );
  }

  if (sub.kind === "candidates" && target !== undefined) {
    return (
      <CandidatePickerSheet
        raw={target.resolution.parsed.raw}
        candidates={target.resolution.candidates}
        note="選んだ食品は、この原文の呼び名として覚えます（他の食品とぶつからないときだけ）。"
        onChoose={(food) => choose(sub.index, food, true)}
        onOpenPicker={() => setSub({ kind: "pick", index: sub.index })}
        onBack={() => setSub({ kind: "preview" })}
        onClose={onClose}
      />
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
            <p className="text-xs text-slate-500">
              記録する{entries.length}件の合計
            </p>
            <p className="text-sm font-bold tabular-nums text-slate-800">
              <NutritionLine value={total.value} kcal="total" />
            </p>
          </div>
          <Button
            variant="primary"
            className="h-14 w-full"
            disabled={
              saving ||
              timeMissing ||
              (entries.length === 0 && pending.length === 0)
            }
            onClick={record}
          >
            {entries.length}件を記録
            {pending.length > 0
              ? `（${pending.length}件は未処理として保存）`
              : ""}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <ModeTabs
          mode="text"
          onChange={(next) => {
            if (next === "search") onSwitchToSearch();
          }}
        />

        {apiKey !== null && onPhoto !== undefined && (
          <Button className="w-full" onClick={onPhoto}>
            写真から
          </Button>
        )}

        <Panel>
          <label className="block">
            <FieldLabel>食べたもの</FieldLabel>
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
            「/」「、」「＋」「・」改行
            で区切ります。数量は「2本」「30g」「3玉」のように書けます。
            先頭に「21:30」と書くと、その項目だけ時刻を変えられます。 「ご飯
            1杯=252/3.8/0.5/55.7/0」のように =kcal/P/脂質/炭水化物/塩分
            を付けると、 マスタに無いものもその値で記録できます。
          </Note>
        </Panel>

        <Panel>
          <CopyPromptButton />
        </Panel>

        {otherDates.length > 0 && (
          <Notice tone="sky">
            日付の行がありますが、この画面は{formatLogDateShort(logDate)}
            の記録として保存します。
            何日ぶんかをまとめて入れるときは、設定タブの「記録を貼り付けて取り込む」を使ってください。
          </Notice>
        )}

        {rows.length === 0 ? (
          <EmptyState>
            食べたものを書くと、ここに解釈した結果が出ます。まだ記録には入りません。
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl bg-white px-3">
            {rows.map((row) => (
              <ResolvedItemRow
                key={row.index}
                time={row.resolution.parsed.time ?? time}
                resolution={row.resolution}
                view={row.view}
                variants={row.variants}
                onPickVariant={(food) => choose(row.index, food, false)}
                onOpenCandidates={() =>
                  setSub({ kind: "candidates", index: row.index })
                }
                onOpenPicker={() => setSub({ kind: "pick", index: row.index })}
                onOpenNewFood={() =>
                  setSub({
                    kind: "newFood",
                    index: row.index,
                    name: row.resolution.parsed.name,
                  })
                }
              />
            ))}
          </ul>
        )}

        <Panel>
          <TimeField
            value={time}
            onChange={setTime}
            logDate={logDate}
            boundaryHour={boundaryHour}
            label="時刻（時刻を書いた項目はそちらが優先されます）"
            required={fallbackTimeUsed}
          />
        </Panel>

        {pending.length > 0 && (
          <Notice tone="amber">
            解決できていない{pending.length}
            件は、栄養値を付けずに原文のまま預かります。
            集計には入りません。あとで「未処理のテキスト」から続きができます。
          </Notice>
        )}

        {error !== null && <ErrorText label={SAVE_FAILED}>{error}</ErrorText>}

        <Note>
          栄養値は記録した時点の値をコピーして残します。原文もそのまま記録に残ります。
        </Note>
      </div>
    </Sheet>
  );
}
