/**
 * 貼り付けたテキストの取り込み（F2 の拡張）。
 *
 * ★ ここは純関数だけ。DB も React も触らない。★
 *   「こう読んだ」という結果を作るだけで、記録（MealEntry）も食品（Food）も作らない。
 *   作るのはユーザーが「○件を取り込む」を押したときだけ（原則1 / lib/importRecord.ts）。
 *
 * 想定している使い方:
 *   写真は claude.ai に投げて栄養を見積もってもらい、返ってきた行をここに貼る。
 *   文法は lib/quickText.ts と同じ（1行1品目・'=kcal/P/脂質/炭水化物/塩分'・日付行）なので、
 *   1行だけなら既存のテキスト欄にそのまま貼れる。
 *
 * 値の扱いは3通り。どれになったかは必ず画面に出す:
 *   - マスタに確定で当たった → **マスタの値を使う**（貼った値は使わない）
 *   - 当たらない／候補が並ぶ が 値がある → 'estimated'。推定の食品を作って記録する
 *   - 当たらず値も無い → 'missing'。栄養値を付けずに原文のまま預かる（従来どおり）
 */
import type { Food, LogDate, Nutrition } from "../db/types";
import { groupBy } from "./collections";
import { toCalendarDate, toIsoDateTime } from "./date";
import { newFood } from "./foods";
import { formatQuantity } from "./mealView";
import { divideNutrition, emptyNutrition } from "./nutrition";
import { gramsPerUnitOf, guessCategory, unitLabelOf } from "./photoMeal";
import { isGramUnit, parseItems, quantityFor, resolveItem } from "./quickText";
import type { ParsedItem, QuickResolution, QuickStatus } from "./quickText";
import type { QuickEntryPlan, QuickPendingPlan } from "./quickRecord";

/** 時刻が書かれていない行の既定。昼に寄せる（朝4時境界の内側で、日付が動かない時刻） */
export const DEFAULT_IMPORT_TIME = "12:00";

/* ------------------------------------------------------------------ */
/* 推定食品の下書き                                                      */
/* ------------------------------------------------------------------ */

export interface EstimatedPlan {
  /** 記録時に作る Food。source='estimated' なので画面では「推定値」と出る */
  draft: Omit<Food, "id">;
  /** その下書きに対する数量 */
  quantity: number;
  per: Nutrition;
  unitLabel: string;
}

/**
 * 栄養値の付いた項目から、推定食品の下書きを作る。
 * 作り方は写真からの推定（photoMeal.estimatedFoodOf）に揃えてある。
 *
 * 値は「その行の数量ぶん全体」なので、1単位あたりに割ってから per に入れる。
 *   'ご飯 1杯=252/3.8/0.5/55.7/0'  → 1杯 あたり 252kcal
 *   '焼き鮭 2切れ=266/44/9/0.2/1.6' → 1切れ あたり 133kcal
 * '100g' のような重さ指定だけは「100g で1単位」として扱う（数量は1）。
 */
export function estimatedPlanOf(
  parsed: ParsedItem,
  now: Date = new Date(),
): EstimatedPlan | null {
  const values = parsed.inlineNutrition;
  if (values === null) return null;

  const amount = parsed.amount > 0 ? parsed.amount : 1;
  const gram = isGramUnit(parsed.unit);
  const quantity = gram ? 1 : amount;
  const unitLabel = gram
    ? `${formatQuantity(amount)}${parsed.unit ?? "g"}`
    : parsed.unit === null
      ? "1個"
      : unitLabelOf(parsed.unit);

  // 1単位あたりに割る。写真からの推定（lib/photoMeal.ts）と同じ丸め方
  const per = divideNutrition(values, quantity);
  const name = parsed.name.trim();
  const stamp = toIsoDateTime(now);

  return {
    quantity,
    per,
    unitLabel,
    // 呼び名は付けない。推定の名前で呼び名を増やすと、以後の照合が曖昧になる
    draft: newFood(
      {
        name: name === "" ? "貼り付けの品目" : name,
        unitLabel,
        gramsPerUnit: gram ? amount : gramsPerUnitOf(unitLabel),
        per,
        source: "estimated",
        basis: { label: "貼り付けの値（1単位あたり）", unitsPerBasis: 1 },
        category: guessCategory(name),
        note: `貼り付けから推定 ${toCalendarDate(now)}`,
      },
      stamp,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* 1項目ぶんの見え方                                                     */
/* ------------------------------------------------------------------ */

export interface EntryView {
  /** マスタの食品（確定 or 手で選んだ）。推定のときは null */
  food: Food | null;
  /** 推定の下書き。マスタを使うときは null */
  estimated: EstimatedPlan | null;
  quantity: number;
  /** 表示に使う1単位あたりの値 */
  per: Nutrition;
  unitLabel: string;
  /** 数量を黙って変えたときの説明（g換算など） */
  notes: string[];
  /** 値を貼ってあるが、マスタに当たったのでマスタの値を使う */
  usesMasterValues: boolean;
  status: QuickStatus;
  manual: boolean;
}

/**
 * プレビュー1行の中身。テキスト記録シートと取り込みシートで同じものを使う。
 * picked は「候補から選ぶ」「食品を選ぶ」で手で決めた食品。
 */
export function buildEntryView(
  resolution: QuickResolution,
  picked: Food | null,
  manual: boolean,
): EntryView {
  const parsed = resolution.parsed;
  const food = picked ?? resolution.food;

  if (food !== null) {
    const { quantity, notes } = quantityFor(parsed, food);
    return {
      food,
      estimated: null,
      quantity,
      per: food.per,
      unitLabel: food.unitLabel,
      notes,
      usesMasterValues: parsed.inlineNutrition !== null,
      status: "confirmed",
      manual,
    };
  }

  const estimated = estimatedPlanOf(parsed);
  if (estimated !== null) {
    return {
      food: null,
      estimated,
      quantity: estimated.quantity,
      per: estimated.per,
      unitLabel: estimated.unitLabel,
      notes: [],
      usesMasterValues: false,
      status: "estimated",
      manual: false,
    };
  }

  return {
    food: null,
    estimated: null,
    quantity: 1,
    per: emptyNutrition(),
    unitLabel: "",
    notes: [],
    usesMasterValues: false,
    status: resolution.status,
    manual: false,
  };
}

/* ------------------------------------------------------------------ */
/* 記録する行 / 未処理で預ける行の振り分け                                */
/* ------------------------------------------------------------------ */

/** 振り分ける 1 項目。時刻は呼ぶ側が決める（テキスト記録は行の時刻 or 時刻欄、取り込みは行の時刻） */
export interface PlanItem {
  parsed: ParsedItem;
  view: EntryView;
  /** 'HH:mm' */
  time: string;
}

/**
 * プレビューの各項目を、記録する行（entries）と未処理で預ける行（pending）に振り分ける。
 * 原則1: マスタの食品も推定の下書きも無い項目（解決できなかったもの）は、栄養値を付けずに原文のまま預ける。
 * 預ける理由は 2 つ（保存される PendingText.reason の文字列）:
 *   - 見つからなかった（missing）→「見つかりませんでした」
 *   - 候補はあるが選べていない →「候補から選べていません」
 * テキスト記録シートと取り込みシートで同じ振り分けを使う。並びは項目の並びのまま。
 */
export function planEntries(items: readonly PlanItem[]): {
  entries: QuickEntryPlan[];
  pending: QuickPendingPlan[];
} {
  const entries: QuickEntryPlan[] = [];
  const pending: QuickPendingPlan[] = [];
  for (const { parsed, view, time } of items) {
    if (view.food === null && view.estimated === null) {
      pending.push({
        raw: parsed.raw,
        reason:
          view.status === "missing"
            ? "見つかりませんでした"
            : "候補から選べていません",
        time,
      });
    } else {
      entries.push({
        food: view.food,
        draft: view.estimated?.draft ?? null,
        quantity: view.quantity,
        time,
        raw: parsed.raw,
        manual: view.manual,
        learnText: parsed.name,
      });
    }
  }
  return { entries, pending };
}

/* ------------------------------------------------------------------ */
/* 日付ごとのまとめ                                                      */
/* ------------------------------------------------------------------ */

export interface ImportRow {
  /** テキスト全体での通し番号。手で選んだ結果はこの番号で覚える */
  index: number;
  resolution: QuickResolution;
  /** その行の論理日付。日付行が無ければ今日 */
  logDate: LogDate;
  /** 'HH:mm'。書かれていなければ 12:00 */
  time: string;
  /** 時刻が書かれていなかった（画面に「時刻なし → 12:00」と出す） */
  timeMissing: boolean;
}

export interface ImportDay {
  logDate: LogDate;
  rows: ImportRow[];
}

export interface ImportParse {
  days: ImportDay[];
  rows: ImportRow[];
  /** 日付行が1つも無く、全部を今日として読んだ */
  usedToday: boolean;
}

/** 貼り付けたテキスト全体を、日付ごとにまとめて読む */
export function parseImport(
  text: string,
  foods: Food[],
  today: LogDate,
): ImportParse {
  const items = parseItems(text, today);

  const rows: ImportRow[] = items.map((parsed, index) => ({
    index,
    resolution: resolveItem(parsed, foods),
    logDate: parsed.logDate ?? today,
    time: parsed.time ?? DEFAULT_IMPORT_TIME,
    timeMissing: parsed.time === null,
  }));

  const grouped = groupBy(rows, (row) => row.logDate);

  const days = [...grouped]
    .map(([logDate, dayRows]) => ({ logDate, rows: dayRows }))
    .sort((a, b) => a.logDate.localeCompare(b.logDate));

  return {
    days,
    rows,
    usedToday: items.length > 0 && items.every((item) => item.logDate === null),
  };
}
