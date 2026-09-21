/**
 * 写真の読み取り（Claude API）。
 *
 * ★ ここは「読み取った結果」を返すだけ。DB は触らない。★
 *   記録（MealEntry）や食品マスタ（Food）ができるのは、ユーザーが結果を見て
 *   「登録」「○件を記録」を押したときだけ（原則1）。
 *
 * 約束ごと:
 *  - 出力は構造化出力（output_config.format の json_schema）で受け取る。
 *    本文から JSON を探す・前置きを剥がす、といった当て推量をしない。
 *  - 返ってきた値は必ず検証する。数値でないものは null にする（0 で埋めない）。
 *  - stop_reason === 'refusal' を content より先に見る。refusal のとき content は空になりうる。
 *  - 例外は SDK の型付きクラスで分岐して、日本語の文言に変換する（lib/photoError.ts）。
 *
 * ブラウザから直接 api.anthropic.com を呼ぶ（サーバーを持たないため）。
 * キーは端末内の Settings にだけ置く。
 */
import Anthropic from '@anthropic-ai/sdk';
import type { PhotoMediaType } from './photo';
import { FORMAT_MESSAGE, OFFLINE_MESSAGE, PhotoError, REFUSAL_MESSAGE, toPhotoError } from './photoError';

/** 日付サフィックスを付けない（最新の Opus 5 を指す） */
export const VISION_MODEL = 'claude-opus-5';
/** 出力は短い JSON なので大きくしない */
export const VISION_MAX_TOKENS = 4096;
/** 接続テストはこれだけあれば足りる */
const TEST_MAX_TOKENS = 32;
/** fallbacks: 'default'（スカラー形式）を使うためのベータ */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function createClient(apiKey: string): Anthropic {
  if (apiKey.trim() === '') throw new PhotoError('auth', 'APIキーを設定してください。');
  return new Anthropic({
    apiKey,
    // 端末内で完結するアプリなので、キーはユーザー自身のものしか入らない
    dangerouslyAllowBrowser: true,
    // 店頭の電波で1回落ちる程度は拾う。やり直しを増やしすぎると料金が読めなくなる
    maxRetries: 1,
  });
}

function requireOnline(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new PhotoError('offline', OFFLINE_MESSAGE);
  }
}

/* ------------------------------------------------------------------ */
/* 応答の検証                                                           */
/* ------------------------------------------------------------------ */

/** 数値でないもの・負の数は null にする。0 で埋めない（原則1） */
function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 1000) / 1000;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function textOrNull(value: unknown): string | null {
  const out = text(value).trim();
  return out === '' ? null : out;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export type Confidence = 'high' | 'medium' | 'low';
const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: '読み取れています',
  medium: 'だいたい読み取れています',
  low: '自信は低めです',
};

/* ------------------------------------------------------------------ */
/* 栄養成分表示の読み取り                                                */
/* ------------------------------------------------------------------ */

export type LabelBasis = 'per_unit' | 'per_100g' | 'per_package';
const LABEL_BASES: readonly LabelBasis[] = ['per_unit', 'per_100g', 'per_package'];

export interface LabelRead {
  /** 商品名。写っていなければ null */
  name: string | null;
  /** 表示の基準 */
  basis: LabelBasis;
  /** ラベルの表記そのまま。例: '1食（80g）あたり' */
  basisLabel: string;
  /** その表記1つ分のグラム数。分からなければ null */
  gramsPerBasis: number | null;
  kcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbG: number | null;
  saltG: number | null;
  confidence: Confidence;
  /** 換算した・読めなかった項目などの但し書き */
  notes: string;
}

const LABEL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    name: { type: ['string', 'null'], description: '商品名。写っていなければ null' },
    basis: { type: 'string', enum: ['per_unit', 'per_100g', 'per_package'] },
    basisLabel: { type: 'string', description: 'ラベルの表記そのまま。例: 1食（80g）あたり' },
    gramsPerBasis: { type: ['number', 'null'], description: '表記1つ分のグラム数' },
    kcal: { type: ['number', 'null'] },
    proteinG: { type: ['number', 'null'] },
    fatG: { type: ['number', 'null'] },
    carbG: { type: ['number', 'null'] },
    saltG: { type: ['number', 'null'], description: '食塩相当量(g)' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: { type: 'string' },
  },
  required: [
    'name',
    'basis',
    'basisLabel',
    'gramsPerBasis',
    'kcal',
    'proteinG',
    'fatG',
    'carbG',
    'saltG',
    'confidence',
    'notes',
  ],
  additionalProperties: false,
};

const LABEL_SYSTEM = [
  '日本の食品パッケージの栄養成分表示を読み取ります。',
  '',
  '- 写真に表示されている数値だけを使います。見えない項目・読み取れない項目は null にします。推測で埋めません。',
  '- 「1食（○g）あたり」「1個あたり」は per_unit、「100gあたり」は per_100g、「1袋あたり」「1包装あたり」は per_package を basis に入れます。',
  '- basisLabel には表示されている表記をそのまま入れます（例: 「1食（80g）あたり」）。',
  '- gramsPerBasis には、その表記1つ分のグラム数を入れます。表示が無ければ null。',
  '- 数値の単位は kcal と g です。mg 表記の項目は g に直します。',
  '- 食塩相当量の表示が無く、ナトリウム(mg)だけがある場合は 食塩相当量(g) = ナトリウム(mg) × 2.54 ÷ 1000 で換算し、換算したことを notes に明記します。',
  '- 商品名が写っていれば name に入れます。写っていなければ null。',
  '- 文字がぼやけている・一部しか写っていないなど、読み取りに自信が持てないときは confidence を low にします。',
  '- notes は日本語で、1〜2文にします。',
].join('\n');

/**
 * 栄養成分表示の写真から、ラベルの数値をそのまま読み取る。
 * 返すのは「読み取った結果」だけ。保存はしない。
 */
export async function readNutritionLabel(
  imageBase64: string,
  mediaType: PhotoMediaType,
  apiKey: string,
): Promise<LabelRead> {
  const data = await requestJson({
    apiKey,
    imageBase64,
    mediaType,
    system: LABEL_SYSTEM,
    prompt: 'この写真の栄養成分表示を読み取ってください。',
    schema: LABEL_SCHEMA,
    // ラベルは「書いてある数字を写す」作業。medium で足りる
    effort: 'medium',
  });

  const row = data as Record<string, unknown>;
  return {
    name: textOrNull(row.name),
    basis: oneOf(row.basis, LABEL_BASES, 'per_unit'),
    basisLabel: text(row.basisLabel),
    gramsPerBasis: numberOrNull(row.gramsPerBasis),
    kcal: numberOrNull(row.kcal),
    proteinG: numberOrNull(row.proteinG),
    fatG: numberOrNull(row.fatG),
    carbG: numberOrNull(row.carbG),
    saltG: numberOrNull(row.saltG),
    confidence: oneOf(row.confidence, CONFIDENCES, 'low'),
    notes: text(row.notes),
  };
}

/* ------------------------------------------------------------------ */
/* 料理の写真の見積もり                                                  */
/* ------------------------------------------------------------------ */

export interface MealPhotoItem {
  name: string;
  /** 「1杯」の 1 */
  quantity: number;
  /** 「1杯」の 杯 */
  unit: string;
  /** 以下は quantity × unit ぶん全体の概算値 */
  kcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbG: number | null;
  saltG: number | null;
  confidence: Confidence;
}

export interface MealPhotoRead {
  items: MealPhotoItem[];
  notes: string;
}

const MEAL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '品目名。例: ご飯 / 焼き鮭' },
          quantity: { type: 'number', description: '量の数。例: 1杯 の 1' },
          unit: { type: 'string', description: '量の単位。例: 杯 / 切れ / 個 / 100g' },
          kcal: { type: ['number', 'null'] },
          proteinG: { type: ['number', 'null'] },
          fatG: { type: ['number', 'null'] },
          carbG: { type: ['number', 'null'] },
          saltG: { type: ['number', 'null'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'quantity', 'unit', 'kcal', 'proteinG', 'fatG', 'carbG', 'saltG', 'confidence'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['items', 'notes'],
  additionalProperties: false,
};

const MEAL_SYSTEM = [
  '写真に写っている食事を、日本の一般的な食事として品目に分けて見積もります。',
  '',
  '- 「ご飯」「焼き鮭」「味噌汁」のように、日常の呼び名で品目に分けます。まとめすぎず、分けすぎません。',
  '- 量は「1杯」「1切れ」「1個」「100g」のように、日常的に使う単位で表します。quantity に数、unit に単位を入れます。',
  '- 栄養値は、その品目の quantity × unit ぶん全体の概算値を入れます。',
  '- 概算で構いませんが、根拠のない細かい精度は出しません。写真から分かる範囲で丸めた値にします。',
  '- 塩分が写真から見当もつかないときは saltG を null にします。0 とは書きません。',
  '- 量や中身が見えにくい品目は confidence を low にします。',
  '- notes には見積もりの前提（量の見え方、隠れていそうな料理、味付けの仮定）を日本語で1〜2文書きます。',
].join('\n');

/**
 * 料理の写真から品目と概算値を見積もる。
 * 返すのは「見積もった結果」だけ。保存はしない。
 */
export async function estimateMealPhoto(
  imageBase64: string,
  mediaType: PhotoMediaType,
  apiKey: string,
): Promise<MealPhotoRead> {
  const data = await requestJson({
    apiKey,
    imageBase64,
    mediaType,
    system: MEAL_SYSTEM,
    prompt: 'この写真の食事の内容を見積もってください。',
    schema: MEAL_SCHEMA,
    // 品目の切り分けと量の見積もりは推論の重い作業。high を使う
    effort: 'high',
  });

  const row = data as Record<string, unknown>;
  const rawItems = Array.isArray(row.items) ? row.items : [];
  const items: MealPhotoItem[] = [];
  for (const entry of rawItems) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const name = text(item.name).trim();
    if (name === '') continue;
    const quantity = numberOrNull(item.quantity);
    items.push({
      name,
      quantity: quantity === null || quantity <= 0 ? 1 : quantity,
      unit: text(item.unit).trim(),
      kcal: numberOrNull(item.kcal),
      proteinG: numberOrNull(item.proteinG),
      fatG: numberOrNull(item.fatG),
      carbG: numberOrNull(item.carbG),
      saltG: numberOrNull(item.saltG),
      confidence: oneOf(item.confidence, CONFIDENCES, 'low'),
    });
  }

  return { items, notes: text(row.notes) };
}

/* ------------------------------------------------------------------ */
/* 接続テスト                                                           */
/* ------------------------------------------------------------------ */

/** 設定画面の「接続テスト」。最小の呼び出しでキーが通るかだけ見る */
export async function testConnection(apiKey: string): Promise<void> {
  requireOnline();
  const client = createClient(apiKey);
  try {
    const response = await client.beta.messages.create({
      model: VISION_MODEL,
      max_tokens: TEST_MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'OK とだけ返してください。' }],
    });
    if (response.stop_reason === 'refusal') {
      throw new PhotoError('refusal', REFUSAL_MESSAGE);
    }
  } catch (error) {
    throw toPhotoError(error);
  }
}

/* ------------------------------------------------------------------ */
/* 呼び出し本体                                                         */
/* ------------------------------------------------------------------ */

interface JsonRequest {
  apiKey: string;
  imageBase64: string;
  mediaType: PhotoMediaType;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  effort: 'medium' | 'high';
}

/**
 * 画像1枚 + 指示 → 構造化出力の JSON。
 *
 * thinking は指定しない（Opus 5 は既定で adaptive）。
 * fallbacks: 'default' を付けて、安全側の判定で止まったときは代替モデルに回してもらう。
 */
async function requestJson(request: JsonRequest): Promise<unknown> {
  requireOnline();
  const client = createClient(request.apiKey);

  let response;
  try {
    response = await client.beta.messages.create({
      model: VISION_MODEL,
      max_tokens: VISION_MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      system: request.system,
      output_config: {
        effort: request.effort,
        format: { type: 'json_schema', schema: request.schema },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: request.mediaType, data: request.imageBase64 },
            },
            { type: 'text', text: request.prompt },
          ],
        },
      ],
    });
  } catch (error) {
    throw toPhotoError(error);
  }

  // content より先に見る。refusal のとき content は空でありうる
  if (response.stop_reason === 'refusal') {
    throw new PhotoError('refusal', REFUSAL_MESSAGE);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new PhotoError('format', '読み取りの途中で出力が切れました。もう一度お試しください。');
  }

  const body = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (body === '') throw new PhotoError('format', FORMAT_MESSAGE);

  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new PhotoError('format', FORMAT_MESSAGE);
    }
    return parsed;
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError('format', FORMAT_MESSAGE);
  }
}
