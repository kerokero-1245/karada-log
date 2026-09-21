/**
 * チャット風テキストの解釈（F2 の拡張）。
 *
 * ★ ここは純関数だけ。DB も React も触らない。★
 *   「こう解釈した」という結果を返すだけで、記録（MealEntry）は作らない。
 *   記録ができるのは、ユーザーがプレビューを見て「記録する」を押したときだけ（原則1）。
 *
 * 外部 API・LLM は使わない。照合はすべてこのファイルのルールで完結する。
 *
 * 解釈の流れ:
 *   1. 区切り（/ ／ 、 , ， 改行 ＋ + ・）で項目に割る
 *   2. 各項目から 時刻 → 数量 → 単位 を剥がし、残りを「名前部分」とする
 *   3. 名前部分を正規化して食品マスタと照合し、variantGroupId で束ねて候補を作る
 *   4. 最上位の候補が2位より厳密に強いときだけ「確定」。同点なら候補から選んでもらう
 */
import type { Food } from '../db/types';

/* ------------------------------------------------------------------ */
/* 正規化                                                               */
/* ------------------------------------------------------------------ */

/** ひらがな → カタカナ のオフセット（ぁ U+3041 → ァ U+30A1） */
const KATAKANA_OFFSET = 0x60;

/**
 * 照合キーを作る。NFKC → ひらがなをカタカナへ → 小文字 → 空白除去。
 *
 * 「ゆでたまご」と「ユデタマゴ」、「ＭＩＬＫ」と「milk」、「ザバス 2本」と「ザバス2本」を
 * 同じものとして扱うため。表示には使わない（表示は必ず原文のまま）。
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + KATAKANA_OFFSET))
    .toLowerCase()
    .replace(/\s+/g, '');
}

/* ------------------------------------------------------------------ */
/* 項目の切り出し                                                        */
/* ------------------------------------------------------------------ */

/**
 * 単位。長いものから先に並べる（'杯分' は '杯' より先）。
 * 'つ'（ゆで卵2つ）まで拾う。g / グラム / ml だけは重さ指定として別扱いする。
 */
const UNITS = ['杯分', 'グラム', 'パック', '切れ', '本', '杯', '個', '枚', '玉', '食', '袋', '缶', 'つ', 'ml', 'g'];

/** 重さ・容量の指定。Food.gramsPerUnit で割って「単位いくつ分か」に直す */
const GRAM_UNITS = new Set(['g', 'グラム', 'ml']);

const UNIT_GROUP = UNITS.join('|');
const TRAILING_AMOUNT = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_GROUP})?\\s*$`, 'i');
const LEADING_AMOUNT = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${UNIT_GROUP})?\\s*`, 'i');
/** 先頭の H:mm / HH:mm。'21:30 家系ラーメン' の 21:30 */
const TIME_AT_START = /^(\d{1,2}):(\d{2})(?![\d:])\s*/;

/** 区切り。NFKC 後なので ／→/ ，→, ＋→+ になっている */
const SEPARATORS = /[\n\/,、・+]/;

export interface ParsedItem {
  /** 分割後の原文（NFKC 済み・前後の空白だけ落としたもの）。記録の note に残す */
  raw: string;
  /** 名前部分。時刻・数量・単位を除いた表示用の元表記。エイリアス学習にも使う */
  name: string;
  /** 抽出した数量。書かれていなければ 1 */
  amount: number;
  /** 抽出した単位。無ければ null */
  unit: string | null;
  /** '2本' '300g' '3玉' のような数量トークン。商品名の一部かどうかの判定に使う */
  amountToken: string | null;
  /** 'HH:mm'。無ければ null（全体の時刻を使う） */
  time: string | null;
}

/** 複数行・複数項目のテキストを項目ごとに割る */
export function splitItems(text: string): string[] {
  return text
    .normalize('NFKC')
    .split(SEPARATORS)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * 1項目ぶんの解釈。
 *
 * 数量は「末尾 → 先頭」の順に探す。ただし剥がした結果 名前が空になる場合は剥がさない
 * （'2本' だけの入力を数量2の無名項目にしてしまわないため）。
 */
export function parseItem(input: string): ParsedItem {
  const raw = input.normalize('NFKC').trim();
  let rest = raw;

  let time: string | null = null;
  const timeMatch = TIME_AT_START.exec(rest);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (hour <= 23 && minute <= 59) {
      time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      rest = rest.slice(timeMatch[0].length).trim();
    }
  }

  let amount = 1;
  let unit: string | null = null;
  let amountToken: string | null = null;

  const trailing = TRAILING_AMOUNT.exec(rest);
  const leading = trailing === null ? LEADING_AMOUNT.exec(rest) : null;

  if (trailing !== null && rest.slice(0, trailing.index).trim() !== '') {
    amount = Number(trailing[1]);
    unit = trailing[2] ?? null;
    amountToken = `${trailing[1]}${trailing[2] ?? ''}`;
    rest = rest.slice(0, trailing.index).trim();
  } else if (leading !== null && rest.slice(leading[0].length).trim() !== '') {
    amount = Number(leading[1]);
    unit = leading[2] ?? null;
    amountToken = `${leading[1]}${leading[2] ?? ''}`;
    rest = rest.slice(leading[0].length).trim();
  }

  if (!Number.isFinite(amount) || amount <= 0) amount = 1;

  return { raw, name: rest === '' ? raw : rest, amount, unit, amountToken, time };
}

/* ------------------------------------------------------------------ */
/* 照合                                                                */
/* ------------------------------------------------------------------ */

/**
 * 照合スコア。名前が一番強く、カテゴリが一番弱い。
 * 在庫切れ（archived）は −25。候補から消しはしないが、優先度は下げる。
 */
export interface FoodScore {
  score: number;
  /** 何で当たったか。プレビューに出して「なぜこれになったか」を隠さない */
  reason: string;
}

export function scoreFood(food: Food, key: string): FoodScore {
  if (key === '') return { score: 0, reason: '' };

  const name = normalize(food.name);
  const variant = food.variantLabel === null ? '' : normalize(food.variantLabel);
  const category = normalize(food.category);
  const aliases = (food.aliases ?? []).map(normalize).filter((alias) => alias !== '');

  let best = 0;
  let reason = '';
  const take = (score: number, why: string) => {
    if (score > best) {
      best = score;
      reason = why;
    }
  };

  if (name === key) take(100, '名前が一致');
  if (aliases.some((alias) => alias === key)) take(90, '呼び名が一致');
  if (variant !== '' && variant === key) take(85, '食べ方の名前が一致');
  if (name.includes(key)) take(70, '名前に含まれる');
  if (key.includes(name)) take(68, '入力に名前が含まれる');
  if (aliases.some((alias) => alias.includes(key) || key.includes(alias))) take(60, '呼び名が部分一致');
  if (variant !== '' && (variant.includes(key) || key.includes(variant))) take(55, '食べ方の名前が部分一致');
  if (category === key) take(40, 'カテゴリが一致');
  if (category.includes(key) || key.includes(category)) take(30, 'カテゴリが部分一致');

  if (best === 0) return { score: 0, reason: '' };
  if (food.archived) return { score: best - 25, reason: `${reason}・在庫切れ` };
  return { score: best, reason };
}

/** バリアントを束ねるキー。単独商品は食品ごとに別グループ */
export function groupKeyOf(food: Food): string {
  return food.variantGroupId ?? `food-${String(food.id)}`;
}

/**
 * 既定バリアントの順。useCount 降順 → 塩分の低い順（未確認は最後）→ バリアント名。
 * 「汁は必ず残す」側が既定に来るようにしてある（foodGroups.ts と同じ基準）。
 */
export function sortVariants(foods: Food[]): Food[] {
  return [...foods].sort(
    (a, b) =>
      b.useCount - a.useCount ||
      (a.per.saltG ?? Number.POSITIVE_INFINITY) - (b.per.saltG ?? Number.POSITIVE_INFINITY) ||
      (a.variantLabel ?? '').localeCompare(b.variantLabel ?? '', 'ja'),
  );
}

export interface QuickCandidate {
  key: string;
  /** 代表名（バリアントで共通） */
  name: string;
  /** 既定バリアント順。先頭が既定 */
  foods: Food[];
  score: number;
  reason: string;
}

/** 名前部分に対する候補をスコア順で返す */
export function findCandidates(name: string, foods: Food[]): QuickCandidate[] {
  const key = normalize(name);
  if (key === '') return [];

  const hits = new Map<string, { score: number; reason: string; name: string }>();
  for (const food of foods) {
    const { score, reason } = scoreFood(food, key);
    if (score <= 0) continue;
    const groupKey = groupKeyOf(food);
    const current = hits.get(groupKey);
    if (current === undefined || score > current.score) {
      hits.set(groupKey, { score, reason, name: food.name });
    }
  }
  if (hits.size === 0) return [];

  // 片方のバリアントだけ当たった場合でも、切り替えられるように兄弟を全部集める
  const members = new Map<string, Food[]>();
  for (const food of foods) {
    const groupKey = groupKeyOf(food);
    if (!hits.has(groupKey)) continue;
    const list = members.get(groupKey);
    if (list === undefined) members.set(groupKey, [food]);
    else list.push(food);
  }

  const candidates: QuickCandidate[] = [];
  for (const [groupKey, hit] of hits) {
    candidates.push({
      key: groupKey,
      name: hit.name,
      foods: sortVariants(members.get(groupKey) ?? []),
      score: hit.score,
      reason: hit.reason,
    });
  }
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      totalUseCount(b.foods) - totalUseCount(a.foods) ||
      a.name.localeCompare(b.name, 'ja'),
  );
  return candidates;
}

function totalUseCount(foods: Food[]): number {
  return foods.reduce((sum, food) => sum + food.useCount, 0);
}

/* ------------------------------------------------------------------ */
/* 1項目の解決                                                          */
/* ------------------------------------------------------------------ */

export type QuickStatus = 'confirmed' | 'ambiguous' | 'missing';

export const QUICK_STATUS_LABELS: Record<QuickStatus, string> = {
  confirmed: '確定',
  ambiguous: '候補を選ぶ',
  missing: '見つからない',
};

export interface QuickResolution {
  parsed: ParsedItem;
  candidates: QuickCandidate[];
  status: QuickStatus;
  /** 確定したときの既定 Food。確定していなければ null */
  food: Food | null;
}

/**
 * 候補が1つだけ、または最上位のスコアが2位より **厳密に** 大きいときだけ確定する。
 * 同点は「たぶんこっち」で決めない（原則1: 分からないものを埋めない）。
 */
export function resolveItem(parsed: ParsedItem, foods: Food[]): QuickResolution {
  const candidates = findCandidates(parsed.name, foods);
  if (candidates.length === 0) {
    return { parsed, candidates, status: 'missing', food: null };
  }
  const confirmed = candidates.length === 1 || candidates[0].score > candidates[1].score;
  return {
    parsed,
    candidates,
    status: confirmed ? 'confirmed' : 'ambiguous',
    food: confirmed ? (candidates[0].foods[0] ?? null) : null,
  };
}

/** テキスト全体の解釈 */
export function interpret(text: string, foods: Food[]): QuickResolution[] {
  return splitItems(text).map((part) => resolveItem(parseItem(part), foods));
}

/* ------------------------------------------------------------------ */
/* 数量の決定                                                           */
/* ------------------------------------------------------------------ */

export interface QuickQuantity {
  quantity: number;
  /** 「そのまま受け取らなかった」ときの説明。黙って変えない */
  notes: string[];
}

/**
 * 数量は「どの食品に当てたか」で変わるので、食品が決まってから計算する。
 *
 *  1. 数量トークンが商品名・単位ラベルに含まれていたら、それは商品名の一部
 *     （丸亀 旨辛豚つけ汁うどん **3玉** / いきなりステーキ ワイルド **300g**）。数量は1に戻す
 *  2. g / グラム / ml 指定は Food.gramsPerUnit で割る（マカダミア30g → 10g単位 × 3）
 *  3. gramsPerUnit が無ければ換算せず1単位として扱い、そう書く
 */
export function quantityFor(parsed: ParsedItem, food: Food): QuickQuantity {
  const notes: string[] = [];

  if (parsed.amountToken !== null && parsed.amount !== 1) {
    const token = normalize(parsed.amountToken);
    if (normalize(food.name).includes(token) || normalize(food.unitLabel).includes(token)) {
      notes.push(`「${parsed.amountToken}」は商品名の一部として扱いました`);
      return { quantity: 1, notes };
    }
  }

  if (parsed.unit !== null && GRAM_UNITS.has(parsed.unit.toLowerCase())) {
    if (food.gramsPerUnit === null || food.gramsPerUnit <= 0) {
      notes.push('g 換算できないので1単位として扱いました');
      return { quantity: 1, notes };
    }
    const quantity = round2(parsed.amount / food.gramsPerUnit);
    return { quantity: quantity > 0 ? quantity : 1, notes };
  }

  return { quantity: parsed.amount, notes };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
