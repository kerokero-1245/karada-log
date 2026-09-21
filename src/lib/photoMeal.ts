/**
 * 料理の写真の見積もり → プレビューの行。
 *
 * ★ ここは純関数だけ。DB も React も触らない。★
 *   「こう読んだ」という結果を作るだけで、記録（MealEntry）も食品（Food）も作らない。
 *   作るのはユーザーが「○件を記録」を押したときだけ（原則1 / lib/photoRecord.ts）。
 *
 * 照合の考え方:
 *   写真から出てきた品目名は、ユーザー自身が書いた言葉ではなく、モデルが付けた一般名。
 *   なので「名前に含まれる」程度の弱い一致で食品マスタに当ててはいけない。
 *   例: 「ご飯」は「から揚げ弁当（ごはん大盛）」に部分一致で当たってしまう。
 *   そこで quickText.ts のスコアリングをそのまま使いつつ、
 *   **名前・呼び名・食べ方の名前が丸ごと一致したとき（85点以上）だけ** 採用する。
 *   当たらなかったものは「推定」として、API の概算値のまま出す。
 */
import type { Food, FoodCategory, Nutrition } from '../db/types';
import { toCalendarDate, toIsoDateTime } from './date';
import { formatQuantity } from './meals';
import { findCandidates, parseItem, quantityFor } from './quickText';
import type { QuickCandidate } from './quickText';
import { normalize } from './quickText';
import type { MealPhotoItem, MealPhotoRead } from './vision';

/**
 * マスタ照合を認める最低スコア。
 * 100=名前が一致 / 90=呼び名が一致 / 85=食べ方の名前が一致 までを採る。
 * 70（名前に含まれる）以下は採らない。
 */
export const MATCH_MIN_SCORE = 85;

export interface PhotoMealRow {
  index: number;
  /** API が返した品目そのもの */
  item: MealPhotoItem;
  /** 「ご飯 1杯」。照合にも、記録のメモにも使う原文 */
  raw: string;
  /** マスタ照合で当たった食品。当たらなければ null（＝推定） */
  matched: Food | null;
  /** 既定の数量。マスタ照合のときは quickText の換算を通した値 */
  quantity: number;
  /** 表示・保存に使う「1単位あたり」の値 */
  per: Nutrition;
  /** 表示に使う単位名 */
  unitLabel: string;
  /** 数量を黙って変えたときの説明（g換算など） */
  notes: string[];
}

/** 「ご飯 1杯」 */
export function rawTextOf(item: MealPhotoItem): string {
  return `${item.name} ${formatQuantity(item.quantity)}${item.unit}`.trim();
}

/** 記録に残すメモ。原文（写真から何と読んだか）をそのまま残す */
export function photoNoteOf(item: MealPhotoItem): string {
  return `写真: ${rawTextOf(item)}`;
}

/** API の値は quantity × unit ぶんの合計。1単位あたりに割る */
export function perUnitOf(item: MealPhotoItem): Nutrition {
  const quantity = item.quantity > 0 ? item.quantity : 1;
  const per = (value: number | null): number | null =>
    value === null ? null : Math.round((value / quantity) * 1000) / 1000;
  return {
    kcal: per(item.kcal),
    proteinG: per(item.proteinG),
    fatG: per(item.fatG),
    carbG: per(item.carbG),
    saltG: per(item.saltG),
  };
}

/** '杯' → '1杯' / '100g' → '100g'（既存の食品マスタと同じ書き方に揃える） */
export function unitLabelOf(unit: string): string {
  const trimmed = unit.normalize('NFKC').trim();
  if (trimmed === '') return '1食';
  return /^\d/.test(trimmed) ? trimmed : `1${trimmed}`;
}

/** 単位が '100g' のように重さそのものなら、グラム数を拾う */
export function gramsPerUnitOf(unit: string): number | null {
  const matched = /^(\d+(?:\.\d+)?)\s*(g|ml|グラム)$/i.exec(unit.normalize('NFKC').trim());
  if (matched === null) return null;
  const grams = Number(matched[1]);
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

/* ------------------------------------------------------------------ */
/* カテゴリの推定                                                        */
/* ------------------------------------------------------------------ */

/**
 * 品目名からカテゴリの既定値を決める。当たらなければ「その他」。
 *
 * 麺類はアラート（麺類2日連続）の判定に使われるので、
 * 「麺そのもの」と言い切れる語だけを入れる。迷ったら その他 に落とす。
 */
const CATEGORY_HINTS: { category: FoodCategory; words: string[] }[] = [
  { category: '麺類', words: ['ラーメン', 'うどん', 'そば', 'パスタ', 'スパゲ', '焼きそば', 'つけ麺', '中華麺', 'ちゃんぽん'] },
  { category: '主食', words: ['ご飯', 'ごはん', 'ライス', '白米', '玄米', 'おにぎり', 'パン', 'トースト', '丼', '餅', 'もち'] },
  { category: '魚', words: ['鮭', 'さけ', 'しゃけ', '鯖', 'さば', '鯵', 'あじ', '鰯', 'いわし', 'まぐろ', '鮪', 'ぶり', '鰤', 'さんま', '秋刀魚', '刺身', '海老', 'えび', 'いか', 'たこ', 'ししゃも', '魚'] },
  { category: '卵', words: ['卵', 'たまご', '玉子', 'オムレツ', '目玉焼き'] },
  { category: '肉', words: ['鶏', '豚', '牛', '肉', 'ハム', 'ソーセージ', 'ベーコン', 'から揚げ', '唐揚げ', 'ステーキ', 'ハンバーグ', '生姜焼き'] },
  { category: '乳製品', words: ['ヨーグルト', 'チーズ', '牛乳', 'ミルク'] },
  { category: 'プロテイン', words: ['プロテイン'] },
  { category: 'ナッツ', words: ['ナッツ', 'アーモンド', 'カシュー', 'マカダミア', 'くるみ'] },
  { category: '果物', words: ['バナナ', 'りんご', 'みかん', 'ぶどう', 'いちご', 'キウイ', 'オレンジ'] },
  { category: '菓子', words: ['チョコ', 'クッキー', 'ケーキ', 'アイス', 'せんべい', 'スナック', 'ポテトチップ'] },
  { category: '飲料', words: ['コーラ', 'ジュース', 'コーヒー', 'お茶', 'ビール', 'スムージー'] },
  { category: '弁当・惣菜', words: ['弁当', '惣菜', 'サラダ', '味噌汁', 'みそ汁', 'スープ', '煮物', '漬物', '冷奴', '納豆'] },
];

const NORMALIZED_HINTS = CATEGORY_HINTS.map((hint) => ({
  category: hint.category,
  words: hint.words.map(normalize),
}));

export function guessCategory(name: string): FoodCategory {
  const key = normalize(name);
  if (key === '') return 'その他';
  for (const hint of NORMALIZED_HINTS) {
    if (hint.words.some((word) => key.includes(word))) return hint.category;
  }
  return 'その他';
}

/* ------------------------------------------------------------------ */
/* 行の組み立て                                                         */
/* ------------------------------------------------------------------ */

/**
 * 在庫切れの −25 を戻したスコア。
 * 「在庫を切らしている」ことと「同じ商品かどうか」は別の話なので、
 * 照合の判定には持ち込まない（表示のほうでは在庫切れのバッジが出る）。
 */
function matchScore(candidate: QuickCandidate): number {
  const allArchived = candidate.foods.length > 0 && candidate.foods.every((food) => food.archived);
  return allArchived ? candidate.score + 25 : candidate.score;
}

/** 品目1つをマスタに当ててみる。丸ごと一致したときだけ採用する */
export function matchFood(item: MealPhotoItem, foods: Food[]): Food | null {
  const candidates = findCandidates(item.name, foods);
  if (candidates.length === 0) return null;
  // 同点が並ぶときは決め打ちしない（原則1: 分からないものを埋めない）
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) return null;
  if (matchScore(candidates[0]) < MATCH_MIN_SCORE) return null;
  return candidates[0].foods[0] ?? null;
}

export function buildPhotoRows(read: MealPhotoRead, foods: Food[]): PhotoMealRow[] {
  return read.items.map((item, index) => {
    const raw = rawTextOf(item);
    const matched = matchFood(item, foods);

    if (matched === null) {
      return {
        index,
        item,
        raw,
        matched: null,
        quantity: item.quantity > 0 ? item.quantity : 1,
        per: perUnitOf(item),
        unitLabel: unitLabelOf(item.unit),
        notes: [],
      };
    }

    // 数量は「どの食品に当てたか」で変わる。既存の換算（g→単位など）をそのまま使う
    const parsed = parseItem(raw);
    const { quantity, notes } = quantityFor(parsed, matched);
    return {
      index,
      item,
      raw,
      matched,
      quantity,
      per: matched.per,
      unitLabel: matched.unitLabel,
      notes,
    };
  });
}

/* ------------------------------------------------------------------ */
/* 推定食品の下書き                                                      */
/* ------------------------------------------------------------------ */

/**
 * マスタに無かった品目の Food（下書き）。
 * source='estimated' なので、一覧でも記録でも「推定値」のバッジが付く。
 */
export function estimatedFoodOf(item: MealPhotoItem, now: Date = new Date()): Omit<Food, 'id'> {
  const stamp = toIsoDateTime(now);
  const quantity = item.quantity > 0 ? item.quantity : 1;
  const name = item.name.trim();

  return {
    name: name === '' ? '写真の品目' : name,
    unitLabel: unitLabelOf(item.unit),
    gramsPerUnit: gramsPerUnitOf(item.unit),
    per: perUnitOf(item),
    source: 'estimated',
    basis: {
      label: `写真からの推定（${formatQuantity(quantity)}${item.unit}あたり）`,
      unitsPerBasis: quantity,
    },
    category: guessCategory(name),
    note: `写真から推定 ${toCalendarDate(now)}`,
    // 呼び名は付けない。推定の名前で呼び名を増やすと、以後の照合が曖昧になる
    aliases: [],
    variantGroupId: null,
    variantLabel: null,
    useCount: 0,
    lastUsedAt: null,
    archived: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
}
