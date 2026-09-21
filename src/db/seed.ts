/**
 * 初期データ投入（handover-20260914.md より）。
 *
 * DB が空のときだけ1回だけ走る。Settings.seedVersion で冪等性を担保する。
 * すでに settings 行があるときは **フル投入はしない**。版数が古ければ差分だけ当てる
 * （upgradeSeed）。フル投入をやり直すと食品マスタが二重になり、
 * 「同じ食品が2行ある」状態からユーザーが手で直す羽目になる。
 *
 * ★ 食事記録（MealEntry）は投入しない。★
 *   handover §9 の日次実績は「その日の合計」であって品目単位の記録が揃っていない日がある
 *   （P も塩分も欠けている日がある）。
 *   合計だけを実績として入れると、内訳が無いのに数字だけある状態になり、
 *   §10-① と同じ「信用できない記録」を作ることになる。
 *   固定ベース（§7）も計画なので MealEntry には入れない（原則1）。
 */
import { db } from './db';
import type {
  BodyComposition,
  BoneDensity,
  EntryBasis,
  Exercise,
  ExerciseTarget,
  Food,
  FoodCategory,
  LoadSpec,
  Nutrition,
  Progression,
  SegmentFat,
  SegmentKey,
  SegmentMuscle,
  SessionExercise,
  SetRecord,
  Settings,
  ShortcutItem,
  Supplement,
  TrainingSession,
  ValueSource,
} from './types';
import { toIsoDateTime, toLogDate } from '../lib/date';
import { evaluateConditions } from '../lib/measurement';
import { aliasesOf, mergeAliases } from '../lib/aliases';

/**
 * 2: 呼び名（Food.aliases）と未処理テキスト（pendingTexts）を追加した版。
 * 上げたら upgradeSeed に差分処理を足すこと。
 */
export const SEED_VERSION = 2;

export interface SeedResult {
  /** すでに投入済みで何もしなかった */
  skipped: boolean;
  counts: Record<string, number>;
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* 食品マスタ（handover §8）                                            */
/* ------------------------------------------------------------------ */

function n(
  kcal: number | null,
  proteinG: number | null,
  fatG: number | null,
  carbG: number | null,
  saltG: number | null,
): Nutrition {
  return { kcal, proteinG, fatG, carbG, saltG };
}

interface FoodSeed {
  key: string;
  name: string;
  unitLabel: string;
  gramsPerUnit: number | null;
  per: Nutrition;
  basis: EntryBasis;
  category: FoodCategory;
  source?: ValueSource;
  note?: string;
  variantGroupId?: string | null;
  variantLabel?: string | null;
  archived?: boolean;
}

const FOOD_SEEDS: FoodSeed[] = [
  {
    key: 'ajitsuke-tamago',
    name: '味付ゆで玉子',
    unitLabel: '1個',
    gramsPerUnit: null,
    per: n(65, 5.8, 4.3, null, 0.6),
    basis: { label: '2個あたり 130kcal / P11.6 / 脂質8.6 / 塩分1.2', unitsPerBasis: 2 },
    category: '卵',
    note: '1個単位に正規化して登録（固定ベースは2個）',
  },
  {
    key: 'seven-hanjuku-tamago',
    name: 'セブン 味付き半熟ゆでたまご',
    unitLabel: '1個',
    gramsPerUnit: null,
    per: n(65, 5.8, 4.3, null, 0.6),
    basis: { label: '2個あたり 130kcal（65kcal/個）', unitsPerBasis: 2 },
    category: '卵',
  },
  {
    key: 'belegend',
    name: 'ビーレジェンド',
    unitLabel: '1杯(40g)',
    gramsPerUnit: 40,
    per: n(150, 15.9, 1.0, null, 0.1),
    basis: { label: '1杯40gあたり', unitsPerBasis: 1 },
    category: 'プロテイン',
    note: '在庫切れにしてある例（一覧で「在庫切れ」と表示される）',
    archived: true,
  },
  {
    key: 'zavas-milk-protein',
    name: 'ザバス MILK PROTEIN',
    unitLabel: '1本(240ml)',
    gramsPerUnit: null,
    per: n(138, 25.0, 0, null, 0.31),
    basis: { label: '1本240mlあたり', unitsPerBasis: 1 },
    category: 'プロテイン',
  },
  {
    key: 'zavas-yogurt-mango',
    name: 'ザバス ヨーグルト（マンゴー）',
    unitLabel: '1個',
    gramsPerUnit: null,
    per: n(95, 12.0, 0, null, 0.15),
    basis: { label: '1個あたり', unitsPerBasis: 1 },
    category: '乳製品',
    source: 'estimated',
    note: '推定値・要ラベル確認（TODO）',
  },
  {
    key: 'high-protein-yogurt',
    name: '高たんぱくヨーグルト',
    unitLabel: '1個',
    gramsPerUnit: null,
    per: n(62, 11.8, 0.1, null, 0.1),
    basis: { label: '1個あたり', unitsPerBasis: 1 },
    category: '乳製品',
  },
  {
    key: 'saijirushi-soy',
    name: 'SAIJIRUSHI ソイプロテイン プレーン',
    unitLabel: '1杯(20g)',
    gramsPerUnit: 20,
    per: n(72.2, 18.0, 0.6, 0.8, 0.64),
    basis: { label: '20gあたり', unitsPerBasis: 1 },
    category: 'プロテイン',
    note: '含有率90% / 1,000g入。1杯0.64gと塩分が高め',
  },
  {
    key: 'mixfruit-protein',
    name: 'ミックスフルーツ風味プロテイン',
    unitLabel: '1杯(30g)',
    gramsPerUnit: 30,
    per: n(118.5, 21.7, 1.8, 4.7, 0.11),
    basis: { label: '30gあたり', unitsPerBasis: 1 },
    category: 'プロテイン',
    note: '含有率72%。塩分が低め',
  },
  {
    key: 'protein-blend',
    name: 'プロテインブレンド（SAIJIRUSHI20g + ミックスフルーツ30g）',
    unitLabel: '1杯(50g)',
    gramsPerUnit: 50,
    per: n(190.7, 39.7, 2.4, 5.5, 0.75),
    basis: { label: '20g+30g の1杯あたり', unitsPerBasis: 1 },
    category: 'プロテイン',
    note: '水300ml推奨。炭水5.5gは2種の合計値',
  },
  {
    key: 'macadamia',
    name: 'トップバリュ 素焼きマカダミア',
    unitLabel: '10g',
    gramsPerUnit: 10,
    per: n(76, 0.8, 7.6, null, 0.0),
    basis: { label: '10gあたり', unitsPerBasis: 1 },
    category: 'ナッツ',
    note: '1袋51g = 388kcal/4.1/38.8/0。10g単位で記録する（30gなら数量3）',
  },
  {
    key: 'goldgym-smoothie',
    name: 'ゴールドジム スムージー',
    unitLabel: '1杯',
    gramsPerUnit: null,
    per: n(300, 30, 0, null, null),
    basis: { label: '1杯あたり', unitsPerBasis: 1 },
    category: '飲料',
    note: '塩分は未確認',
  },
  {
    key: 'marugame-udon-tsuyunokoshi',
    name: '丸亀 旨辛豚つけ汁うどん 3玉',
    unitLabel: '1食',
    gramsPerUnit: null,
    per: n(1300, 40, 38, null, 6.5),
    basis: { label: '1食あたり', unitsPerBasis: 1 },
    category: '麺類',
    variantGroupId: 'marugame-umakara-tsukejiru-udon-3',
    variantLabel: 'つゆ残し',
    note: '塩分は備考「つゆ残しで6〜7g」の中央値。kcal/P/脂質は全量と同値で登録（つゆ分の差は未確認）',
  },
  {
    key: 'marugame-udon-zenryo',
    name: '丸亀 旨辛豚つけ汁うどん 3玉',
    unitLabel: '1食',
    gramsPerUnit: null,
    per: n(1300, 40, 38, null, 10.0),
    basis: { label: '1食あたり', unitsPerBasis: 1 },
    category: '麺類',
    variantGroupId: 'marugame-umakara-tsukejiru-udon-3',
    variantLabel: '全量',
  },
  {
    key: 'ikinari-wild-300',
    name: 'いきなりステーキ ワイルド 300g',
    unitLabel: '1食',
    gramsPerUnit: 300,
    per: n(700, 57, 50, null, 2.0),
    basis: { label: '1食(300g)あたり', unitsPerBasis: 1 },
    category: '肉',
  },
  {
    key: 'ikinari-blade-300',
    name: 'いきなりステーキ ブレードミート 300g',
    unitLabel: '1食',
    gramsPerUnit: 300,
    per: n(null, 60, 35, null, null),
    basis: { label: '1食(300g)あたり', unitsPerBasis: 1 },
    category: '肉',
    note: 'kcalと塩分は未確認',
  },
  {
    key: 'ikinari-hire-300',
    name: 'いきなりステーキ 特選ヒレ 300g',
    unitLabel: '1食',
    gramsPerUnit: 300,
    per: n(null, 63, 15, null, null),
    basis: { label: '1食(300g)あたり', unitsPerBasis: 1 },
    category: '肉',
    note: 'kcalと塩分は未確認',
  },
  {
    key: 'seven-onigiri-kombu',
    name: 'セブン おにぎり（昆布）',
    unitLabel: '1個',
    gramsPerUnit: null,
    per: n(175, 3.5, 0.6, null, 1.2),
    basis: { label: '1個あたり', unitsPerBasis: 1 },
    category: '主食',
  },
  {
    key: 'seven-onigiri-okaka',
    name: 'セブン おにぎり（おかか）',
    unitLabel: '1個',
    gramsPerUnit: null,
    per: n(170, 4.0, 0.8, null, 1.3),
    basis: { label: '1個あたり', unitsPerBasis: 1 },
    category: '主食',
  },
  {
    key: 'karaage-bento',
    name: 'から揚げ弁当（ごはん大盛）',
    unitLabel: '1食',
    gramsPerUnit: null,
    per: n(940, 28.6, 31.9, 136.9, 2.4),
    basis: { label: '1食あたり', unitsPerBasis: 1 },
    category: '弁当・惣菜',
  },
  {
    key: 'peperoncino',
    name: 'ソーセージとベーコンのペペロンチーノ',
    unitLabel: '1食',
    gramsPerUnit: null,
    per: n(787, 26.7, 23.5, 116.9, 5.1),
    basis: { label: '1食あたり', unitsPerBasis: 1 },
    category: '麺類',
    note: 'パスタなので麺類として扱う',
  },
  {
    key: 'iekei-ramen',
    name: '家系ラーメン（大盛＋チャーシュー丼）',
    unitLabel: '1食',
    gramsPerUnit: null,
    per: n(null, null, null, null, 7.3),
    basis: { label: '1食あたり（汁残し時）', unitsPerBasis: 1 },
    category: '麺類',
    note: '汁残し時の塩分のみ判明。kcal/P/脂質は未確認',
  },
  {
    key: 'cupnoodle-big-soup-left',
    name: 'カップヌードルBIG',
    unitLabel: '1食',
    gramsPerUnit: null,
    per: n(473, 12.2, 18.8, null, 3.0),
    basis: { label: '1食あたり', unitsPerBasis: 1 },
    category: '麺類',
    variantGroupId: 'cupnoodle-big',
    variantLabel: 'スープ残し',
    note: 'kcal/P/脂質は完飲と同値で登録（スープ分の差は未確認）',
  },
  {
    key: 'cupnoodle-big-soup-all',
    name: 'カップヌードルBIG',
    unitLabel: '1食',
    gramsPerUnit: null,
    per: n(473, 12.2, 18.8, null, 6.1),
    basis: { label: '1食あたり', unitsPerBasis: 1 },
    category: '麺類',
    variantGroupId: 'cupnoodle-big',
    variantLabel: 'スープ完飲',
  },
  {
    key: 'metz-cola',
    name: 'メッツコーラ',
    unitLabel: '1本',
    gramsPerUnit: null,
    per: n(0, 0, 0, 0, 0),
    basis: { label: '1本あたり', unitsPerBasis: 1 },
    category: '飲料',
  },
];

/* ------------------------------------------------------------------ */
/* 既定の呼び名（エイリアス）                                             */
/* ------------------------------------------------------------------ */

/**
 * チャット風テキストで実際に打つであろう短い言い方。
 *
 * 方針:
 *  - 曖昧なままになる言葉（「ステーキ」など）は **既定では付けない**。
 *    3種すべてに付けると、どれか1つを選んでも「他の食品がその呼び名を持っている」＝衝突
 *    と判定されて学習が永久に効かない。付けなければ名前の部分一致（70）で3候補が出るので
 *    候補選択の挙動は同じまま、一度手で選べばその食品に「ステーキ」が学習されて次から確定する。
 *  - 1つに決まる言い方だけを付ける: ワイルドステーキ/ワイルド → ワイルド、
 *    ブレードミート → ブレード、ヒレ → 特選ヒレ
 *  - 「たまご」系は味付ゆで玉子だけ。セブンの半熟には付けない（片方に寄せて確定させる）
 *  - バリアントを持つものは両方に同じ呼び名を付ける。候補は variantGroupId で束ねられ、
 *    どちらを食べたかはプレビューのチップで選ぶ
 *
 * フル投入と、既存端末への差分適用（upgradeSeed）の両方から使う。
 * ユーザーが付けた呼び名は消さず、足りないものだけ足す。
 */
export const DEFAULT_ALIASES: Record<string, string[]> = {
  'zavas-milk-protein': ['ザバス', 'ザバスミルク'],
  'ajitsuke-tamago': ['卵', 'ゆで卵', 'ゆでたまご', 'たまご', '味玉'],
  'goldgym-smoothie': ['スムージー'],
  macadamia: ['マカダミア', 'ナッツ'],
  'high-protein-yogurt': ['ヨーグルト', '高タンパクヨーグルト'],
  'zavas-yogurt-mango': ['ザバスヨーグルト', 'マンゴーヨーグルト'],
  'seven-onigiri-kombu': ['おにぎり昆布', '昆布おにぎり'],
  'seven-onigiri-okaka': ['おにぎりおかか', 'おかかおにぎり'],
  'karaage-bento': ['から揚げ弁当', '唐揚げ弁当', 'からあげ弁当'],
  peperoncino: ['ペペロンチーノ'],
  'marugame-udon-tsuyunokoshi': ['つけ汁うどん', '旨辛豚', '丸亀'],
  'marugame-udon-zenryo': ['つけ汁うどん', '旨辛豚', '丸亀'],
  // 「ステーキ」は付けない（上のコメント参照）。3種とも名前に「ステーキ」を含むので
  // 部分一致で候補3件は出る。手で選んだ時点でその食品の呼び名として学習される。
  'ikinari-wild-300': ['ワイルドステーキ', 'ワイルド'],
  'ikinari-blade-300': ['ブレードミート'],
  'ikinari-hire-300': ['ヒレ'],
  'cupnoodle-big-soup-left': ['カップヌードル', 'カップ麺'],
  'cupnoodle-big-soup-all': ['カップヌードル', 'カップ麺'],
  'iekei-ramen': ['家系', 'ラーメン'],
  belegend: ['ビーレジェンド'],
  'saijirushi-soy': ['SAIJIRUSHI', 'ソイ', 'ソイプロテイン'],
  'mixfruit-protein': ['ミックスフルーツ'],
  'protein-blend': ['ブレンド', 'プロテインブレンド'],
  'metz-cola': ['メッツ', 'メッツコーラ', 'コーラ'],
};

/* ------------------------------------------------------------------ */
/* 種目マスタ（handover §5）                                            */
/* ------------------------------------------------------------------ */

const barbell = (barType: 'ez' | 'short', plateKgPerSide: number): LoadSpec => ({
  style: 'barbell',
  barType,
  plateKgPerSide,
});
const dumbbell = (kgPerHand: number): LoadSpec => ({ style: 'dumbbell', kgPerHand, hands: 2 });
const machine = (stackKg: number): LoadSpec => ({ style: 'machine', stackKg });
const bodyweight: LoadSpec = { style: 'bodyweight', addedKg: null };

const reps = (load: LoadSpec, r: number): ExerciseTarget => ({ load, reps: r, seconds: null });
const timed = (load: LoadSpec, s: number): ExerciseTarget => ({ load, reps: null, seconds: s });

const perTotal = (amount: number): Progression => ({ metric: 'weight', amount, basis: 'total' });
const perHand = (amount: number): Progression => ({ metric: 'weight', amount, basis: 'perHand' });
const perSeconds = (amount: number): Progression => ({ metric: 'seconds', amount, basis: 'total' });

interface ExerciseSeed extends Omit<Exercise, 'id'> {
  key: string;
}

const EXERCISE_SEEDS: ExerciseSeed[] = [
  // --- A（押す） ---
  {
    key: 'bench-press',
    menu: 'A',
    name: 'ベンチプレス',
    kind: 'weight_reps',
    order: 1,
    current: reps(barbell('short', 12.5), 10),
    next: reps(barbell('short', 13.75), 10),
    sets: 3,
    progression: perTotal(2.5),
    verified: true,
    note: 'ショートバー(10kg)を使う',
    active: true,
  },
  {
    key: 'shoulder-press',
    menu: 'A',
    name: 'ショルダープレス',
    kind: 'weight_reps',
    order: 2,
    current: reps(dumbbell(10), 10),
    next: reps(dumbbell(10), 10),
    sets: 3,
    progression: perHand(2),
    verified: true,
    note: '規定回数に届かなければ据え置き',
    active: true,
  },
  {
    key: 'lying-extension',
    menu: 'A',
    name: 'ライイングエクステンション',
    kind: 'weight_reps',
    order: 3,
    current: reps(barbell('ez', 2.5), 10),
    next: reps(barbell('ez', 2.5), 10),
    sets: 3,
    progression: perTotal(2.5),
    verified: true,
    note: 'EZバー(7kg)を使う',
    active: true,
  },
  {
    key: 'ab-roller-a',
    menu: 'A',
    name: 'アブローラー',
    kind: 'amrap',
    order: 4,
    current: { load: bodyweight, reps: null, seconds: null },
    next: null,
    sets: 3,
    progression: null,
    verified: true,
    note: '限界まで×3',
    active: true,
  },
  // --- B（引く）: 重量はいずれも未検証。次回の実測で上書きする ---
  {
    key: 'lat-pulldown',
    menu: 'B',
    name: 'ラットプルダウン',
    kind: 'weight_reps',
    order: 1,
    current: reps(machine(40), 10),
    next: null,
    sets: 3,
    progression: perTotal(2.5),
    verified: false,
    note: 'グリップはサムレスで緩く＝腕の関与を減らして背中に効かせる。未検証。次回のBで実測して確定させる',
    active: true,
  },
  {
    key: 'seated-row',
    menu: 'B',
    name: 'シーテッドロー',
    kind: 'weight_reps',
    order: 2,
    current: reps(machine(40), 10),
    next: null,
    sets: 3,
    progression: perTotal(2.5),
    verified: false,
    note: '未検証。次回のBで実測して確定させる',
    active: true,
  },
  {
    key: 'romanian-deadlift',
    menu: 'B',
    name: 'ルーマニアンデッドリフト',
    kind: 'weight_reps',
    order: 3,
    current: reps({ style: 'other', totalKg: 40, description: '構成未確認' }, 10),
    next: null,
    sets: 3,
    progression: perTotal(2.5),
    verified: false,
    note: '腰の負荷が大きいので必ず最後に実施する。未検証。次回のBでバー種別とプレートを実測して確定させる',
    active: true,
  },
  {
    key: 'ab-roller-b',
    menu: 'B',
    name: 'アブローラー',
    kind: 'amrap',
    order: 4,
    current: { load: bodyweight, reps: null, seconds: null },
    next: null,
    sets: 3,
    progression: null,
    verified: true,
    note: '限界まで×3',
    active: true,
  },
  // --- C（脚・体幹） ---
  {
    key: 'leg-press',
    menu: 'C',
    name: 'レッグプレス',
    kind: 'weight_reps',
    order: 1,
    current: reps(machine(80), 10),
    next: reps(machine(83.5), 10),
    sets: 3,
    progression: perTotal(3.5),
    verified: true,
    note: '3セットとも規定回数なら次回 +3.5kg',
    active: true,
  },
  {
    key: 'bulgarian-squat',
    menu: 'C',
    name: 'ブルガリアンスクワット',
    kind: 'weight_reps',
    order: 2,
    current: reps(dumbbell(8), 10),
    next: reps(dumbbell(10), 10),
    sets: 3,
    progression: perHand(2),
    verified: true,
    note: 'ダンベルは両手に1本ずつ持つ（重量は片手あたり）',
    active: true,
  },
  {
    key: 'farmers-walk',
    menu: 'C',
    name: 'ファーマーズウォーク',
    kind: 'timed',
    order: 3,
    current: timed(dumbbell(16), 40),
    next: timed(dumbbell(16), 45),
    sets: 3,
    progression: perSeconds(5),
    verified: true,
    note: 'フルグリップで握り込む（握力そのものが鍛える対象）',
    active: true,
  },
  {
    key: 'ab-roller-c',
    menu: 'C',
    name: 'アブローラー',
    kind: 'amrap',
    order: 4,
    current: { load: bodyweight, reps: null, seconds: null },
    next: null,
    sets: 3,
    progression: null,
    verified: true,
    note: '限界まで×3',
    active: true,
  },
];

/* ------------------------------------------------------------------ */
/* 体組成                                                               */
/* ------------------------------------------------------------------ */

const segmentMuscle: Record<SegmentKey, SegmentMuscle> = {
  trunk: { muscleKg: 27.0, score: 0 },
  rightArm: { muscleKg: 3.0, score: 0 },
  leftArm: { muscleKg: 3.0, score: 0 },
  rightLeg: { muscleKg: 10.0, score: 0 },
  leftLeg: { muscleKg: 10.0, score: 0 },
};

const segmentFat: Record<SegmentKey, SegmentFat> = {
  trunk: { fatKg: 8.0, fatPercent: 22.0, score: 0 },
  rightArm: { fatKg: 0.6, fatPercent: 16.0, score: 0 },
  leftArm: { fatKg: 0.6, fatPercent: 16.0, score: 0 },
  rightLeg: { fatKg: 2.4, fatPercent: 20.0, score: 0 },
  leftLeg: { fatKg: 2.4, fatPercent: 20.0, score: 0 },
};

/* ------------------------------------------------------------------ */
/* 投入                                                                */
/* ------------------------------------------------------------------ */

export async function seedIfEmpty(): Promise<SeedResult> {
  const existing = await db.settings.get(1);

  // settings 行があれば「もう投入済みの端末」。フル投入は二度と走らせない。
  if (existing) {
    if (existing.seedVersion >= SEED_VERSION) {
      return { skipped: true, counts: await currentCounts(), notes: [] };
    }
    const notes = await upgradeSeed(existing.seedVersion);
    await db.settings.update(1, { seedVersion: SEED_VERSION, updatedAt: toIsoDateTime(new Date()) });
    return { skipped: false, counts: await currentCounts(), notes };
  }

  const now = toIsoDateTime(new Date());
  const notes: string[] = [];

  await db.transaction(
    'rw',
    [
      db.foods,
      db.shortcutSets,
      db.exercises,
      db.trainingSessions,
      db.sessionExercises,
      db.setRecords,
      db.bodyCompositions,
      db.boneDensities,
      db.supplements,
      db.settings,
    ],
    async () => {
      /* --- 食品マスタ --- */
      const foods: Food[] = FOOD_SEEDS.map((s) => ({
        name: s.name,
        unitLabel: s.unitLabel,
        gramsPerUnit: s.gramsPerUnit,
        per: s.per,
        source: s.source ?? 'label',
        basis: s.basis,
        category: s.category,
        note: s.note ?? '',
        aliases: [...(DEFAULT_ALIASES[s.key] ?? [])],
        variantGroupId: s.variantGroupId ?? null,
        variantLabel: s.variantLabel ?? null,
        useCount: 0,
        lastUsedAt: null,
        archived: s.archived ?? false,
        createdAt: now,
        updatedAt: now,
      }));
      const foodIds = (await db.foods.bulkAdd(foods, { allKeys: true })) as number[];
      const foodId = new Map(FOOD_SEEDS.map((s, i) => [s.key, foodIds[i]]));
      const fid = (key: string): number => {
        const id = foodId.get(key);
        if (id === undefined) throw new Error(`seed: unknown food key ${key}`);
        return id;
      };

      /* --- 固定ベース（計画。実績ではない） --- */
      const shortcutItems: ShortcutItem[] = [
        { foodId: fid('ajitsuke-tamago'), quantity: 2, timing: '朝', note: '味付ゆで玉子2個' },
        { foodId: fid('mixfruit-protein'), quantity: 2, timing: '日中', note: 'ミックスフルーツ30g×2杯' },
        { foodId: fid('saijirushi-soy'), quantity: 1, timing: '日中', note: 'SAIJIRUSHI ソイ20g×1杯' },
        { foodId: fid('high-protein-yogurt'), quantity: 1, timing: '間食', note: '高たんぱくヨーグルト1個' },
      ];
      await db.shortcutSets.add({
        name: '固定ベース',
        items: shortcutItems,
        order: 1,
        note:
          'これは計画であって実績ではない。タップしたときだけ記録に入る。' +
          '合計 501kcal / P84.8g / 脂質12.9g / 塩分2.16g。' +
          'プロテインをミックスフルーツ寄りにしているのは塩分のため（3杯すべてSAIJIRUSHIにすると約1.1g増える）',
        createdAt: now,
        updatedAt: now,
      });

      /* --- 種目マスタ --- */
      const exercises: Exercise[] = EXERCISE_SEEDS.map(({ key: _key, ...rest }) => rest);
      const exerciseIds = (await db.exercises.bulkAdd(exercises, { allKeys: true })) as number[];
      const exerciseId = new Map(EXERCISE_SEEDS.map((s, i) => [s.key, exerciseIds[i]]));
      const eid = (key: string): number => {
        const id = exerciseId.get(key);
        if (id === undefined) throw new Error(`seed: unknown exercise key ${key}`);
        return id;
      };

      /* --- トレーニング記録 --- */
      // 09/11 の B は「実施したこと」だけが確定している（§9）。重量・回数は未記録。
      // 体組成の測定条件（最後のトレからの日数）を実データから計算するために記録する。
      const sessionB: TrainingSession = {
        menu: 'B',
        startedAt: '2026-09-11T19:00',
        startedAtIsEstimated: true,
        logDate: toLogDate('2026-09-11T19:00'),
        note: '実施は §9 で確定。重量・回数は未記録のため種目記録なし。開始時刻も仮置き',
      };
      const sessionC: TrainingSession = {
        menu: 'C',
        startedAt: '2026-09-14T18:00',
        startedAtIsEstimated: true,
        logDate: toLogDate('2026-09-14T18:00'),
        note: '開始時刻は未記録のため仮置き。アブローラーは回数未記録のため種目記録なし',
      };
      const sessionA: TrainingSession = {
        menu: 'A',
        startedAt: '2026-09-16T18:00',
        startedAtIsEstimated: true,
        logDate: toLogDate('2026-09-16T18:00'),
        note: '開始時刻は未記録のため仮置き。アブローラーは回数未記録のため種目記録なし',
      };
      const [idB, idC, idA] = (await db.trainingSessions.bulkAdd([sessionB, sessionC, sessionA], {
        allKeys: true,
      })) as number[];
      sessionB.id = idB;
      sessionC.id = idC;
      sessionA.id = idA;

      const sessionExercises: SessionExercise[] = [
        // 09/14 C
        {
          sessionId: idC,
          exerciseId: eid('leg-press'),
          order: 1,
          exerciseName: 'レッグプレス',
          load: machine(80),
          outcome: 'achieved',
          note: '3セットとも規定回数。次回 83.5kg',
        },
        {
          sessionId: idC,
          exerciseId: eid('bulgarian-squat'),
          order: 2,
          exerciseName: 'ブルガリアンスクワット',
          load: dumbbell(8),
          outcome: 'achieved',
          note: '8kg×2で3セット完遂。次回 10kg×2',
        },
        {
          sessionId: idC,
          exerciseId: eid('farmers-walk'),
          order: 3,
          exerciseName: 'ファーマーズウォーク',
          load: dumbbell(16),
          outcome: 'achieved',
          note: '40秒をクリア。セット数と各セットの秒数は未記録。次回 45秒',
        },
        // 09/16 A
        {
          sessionId: idA,
          exerciseId: eid('bench-press'),
          order: 1,
          exerciseName: 'ベンチプレス',
          load: barbell('short', 12.5),
          outcome: 'achieved',
          note: 'ショートバー10kg + 12.5kg×2 = 35kg。次回 37.5kg',
        },
        {
          sessionId: idA,
          exerciseId: eid('shoulder-press'),
          order: 2,
          exerciseName: 'ショルダープレス',
          load: dumbbell(10),
          outcome: 'held',
          note: '据え置き。各セットの回数は未記録',
        },
        {
          sessionId: idA,
          exerciseId: eid('lying-extension'),
          order: 3,
          exerciseName: 'ライイングエクステンション',
          load: barbell('ez', 2.5),
          outcome: 'held',
          note: 'EZバー7kg + 2.5kg×2 = 12kg。規定回数に届かず据え置き。回数は未記録',
        },
      ];
      const seIds = (await db.sessionExercises.bulkAdd(sessionExercises, { allKeys: true })) as number[];
      const seIdOf = (name: string, sessionId: number): number => {
        const idx = sessionExercises.findIndex((s) => s.exerciseName === name && s.sessionId === sessionId);
        return seIds[idx];
      };

      // セット明細は「回数が分かっているものだけ」入れる。
      // 3セット達成 = 3セットとも規定回数10回、が進捗ルールの定義なので 10回×3 は捏造ではない。
      // ファーマーズウォーク・ショルダープレス・ライイングエクステンションは
      // 各セットの記録が無いため SetRecord を作らない（種目単位の結果だけ残す）。
      const setRecords: SetRecord[] = [];
      const pushReps = (sessionExerciseId: number, count: number, r: number) => {
        for (let i = 1; i <= count; i += 1) {
          setRecords.push({ sessionExerciseId, setNo: i, reps: r, seconds: null, achieved: true, note: '' });
        }
      };
      pushReps(seIdOf('レッグプレス', idC), 3, 10);
      pushReps(seIdOf('ブルガリアンスクワット', idC), 3, 10);
      pushReps(seIdOf('ベンチプレス', idA), 3, 10);
      await db.setRecords.bulkAdd(setRecords);

      /* --- 体組成 --- */
      // 測定条件は投入済みのトレ記録から計算する（測定時刻より前のトレだけを数える）。
      const measuredAt = '2026-09-15T10:10';
      const { conditions, warnings } = evaluateConditions(
        {
          measuredAt,
          previousDaySaltG: 6.0,
          hoursSinceLastMeal: null,
          note: 'サンプル（架空の値）。前日の塩分が多めで、体重が重く出やすい条件の例',
        },
        [sessionB, sessionC, sessionA],
        { minRestDays: 3, previousDaySaltLimitG: 3 },
      );

      const body: BodyComposition = {
        measuredAt,
        place: '',
        device: 'TANITA MC-980',
        weightKg: 70.0,
        bodyFatPercent: 20.0,
        fatMassKg: 14.0,
        leanMassKg: 56.0,
        muscleMassKg: 53.0,
        appendicularMuscleKg: 26.0,
        bodyWaterKg: 42.0,
        bodyWaterPercent: 60.0,
        bmi: 24.2,
        boneMassKg: 3.0,
        bmrKcal: 1600,
        visceralFatLevel: 8,
        athleteIndex: 50,
        smi: 9.0,
        mmPerHeightSq: 18.34,
        mmPerBodyWeight: 0.76,
        asmPerBodyWeight: 0.37,
        bodyTypeLabel: '標準型',
        legMuscleScore: 100,
        waistHipRatio: 0.9,
        segmentMuscle,
        segmentFat,
        conditions,
        warnings,
        extra: { アスリート指数判定: 'スタンダード', 内臓脂肪レベルの標準: '〜9' },
        note: 'サンプル（架空の値）',
      };
      await db.bodyCompositions.add(body);

      /* --- 骨密度（架空のサンプル値） --- */
      const bone: BoneDensity = {
        measuredAt: '2026-09-15T10:00',
        place: '',
        device: 'CM-200（踵骨超音波）',
        sosMps: 1550,
        yamPercent: 90,
        agePercent: 100,
        rank: 'A',
        heelTempC: 30.0,
        deviceTempC: 25.0,
        note: 'サンプル（架空の値）。踵骨超音波は簡易スクリーニングで、確定診断はDXA（整形外科）',
      };
      await db.boneDensities.add(bone);

      /* --- サプリメント（架空のサンプル） --- */
      const supplements: Supplement[] = [
        {
          name: 'マルチビタミン',
          dose: '1日1粒',
          note: 'サンプル（架空の登録例）',
          active: true,
        },
        {
          name: 'ビタミンD',
          dose: '1日1粒',
          note: 'サンプル（架空の登録例）',
          active: true,
        },
        {
          name: 'クレアチン',
          dose: '1日3g',
          note: 'サンプル（架空の登録例）',
          active: true,
        },
      ];
      await db.supplements.bulkAdd(supplements);

      /* --- 設定（目標・身長・年齢は架空のサンプル値） --- */
      // 週合計 14,600 = 休養日 2,000 × 4 日 + ジムの日 2,200 × 3 日（trainingPerWeek）。
      // 週の下限アラート 14,300 = 週合計 − 許容幅 300
      const settings: Settings = {
        id: 1,
        profile: { heightCm: 170.0, sex: 'male', age: 30 },
        bmrKcal: 1600,
        restDayKcal: 2000,
        gymDayKcal: 2200,
        proteinTargetG: 130,
        proteinCapG: 150,
        fatTargetG: 50,
        saltLimitG: 7,
        weeklySaltAverageG: 6,
        weeklyKcalTarget: 14600,
        weeklyKcalTolerance: 300,
        trainingPerWeek: 3,
        weekStartsOn: 1,
        dayBoundaryHour: 4,
        nextMeasurementDate: '2026-10-15',
        measurementChecklistLeadDays: 2,
        measurementMinRestDays: 3,
        goal: {
          fatMassKg: 11.0,
          leanMassKg: 56.0,
          targetDate: '2026-12-31',
          label: '2026年12月末',
        },
        alerts: {
          bmrFloorKcal: 1600,
          eveningCheckHour: 20,
          eveningRemainingKcal: 1300,
          afternoonCheckHour: 15,
          afternoonProgressRatio: 0.4,
          saltStreakDays: 2,
          noodleStreakDays: 2,
          weeklyKcalFloor: 14300,
          lowFatDayG: 40,
        },
        seedVersion: SEED_VERSION,
        updatedAt: now,
      };
      await db.settings.put(settings);
    },
  );

  notes.push('食事記録（MealEntry）は投入していない。§9 の日次実績は合計値のみで品目単位の記録が揃っていないため');
  notes.push('固定ベースは ShortcutSet として投入。タップするまで記録には入らない（原則1）');
  notes.push('09/11 の B は「実施した」ことだけ記録（重量・回数は未記録）。測定条件の日数計算に使う');

  return { skipped: false, counts: await currentCounts(), notes };
}

/**
 * すでにデータがある端末への差分適用。
 *
 * ★ 食品マスタ・記録・トレ記録は作り直さない。★
 *   ユーザーが登録した食品・付けた呼び名・記録を消さないこと。
 *   足りないものを足すだけにする。
 */
async function upgradeSeed(fromVersion: number): Promise<string[]> {
  const notes: string[] = [];

  if (fromVersion < 2) {
    const updated = await applyDefaultAliases();
    notes.push(
      `既定の呼び名（エイリアス）を ${updated} 件の食品に追加した。ユーザーが付けた呼び名はそのまま残している`,
    );
  }

  return notes;
}

/**
 * 既定の呼び名を、名前（＋バリアント名）が一致する食品に足す。
 * id は端末ごとに違うので、FOOD_SEEDS の名前で突き合わせる。
 */
async function applyDefaultAliases(): Promise<number> {
  const foods = await db.foods.toArray();
  let updated = 0;

  for (const seed of FOOD_SEEDS) {
    const defaults = DEFAULT_ALIASES[seed.key];
    if (defaults === undefined || defaults.length === 0) continue;

    for (const food of foods) {
      if (food.id === undefined) continue;
      if (food.name !== seed.name) continue;
      if ((food.variantLabel ?? null) !== (seed.variantLabel ?? null)) continue;

      const current = aliasesOf(food);
      const merged = mergeAliases(current, defaults);
      if (merged.length === current.length) continue;
      await db.foods.update(food.id, { aliases: merged });
      food.aliases = merged;
      updated += 1;
    }
  }

  return updated;
}

async function currentCounts(): Promise<Record<string, number>> {
  const [
    foods,
    mealEntries,
    pendingTexts,
    shortcutSets,
    exercises,
    trainingSessions,
    sessionExercises,
    setRecords,
    bodyCompositions,
    boneDensities,
    supplements,
  ] = await Promise.all([
    db.foods.count(),
    db.mealEntries.count(),
    db.pendingTexts.count(),
    db.shortcutSets.count(),
    db.exercises.count(),
    db.trainingSessions.count(),
    db.sessionExercises.count(),
    db.setRecords.count(),
    db.bodyCompositions.count(),
    db.boneDensities.count(),
    db.supplements.count(),
  ]);
  return {
    foods,
    mealEntries,
    pendingTexts,
    shortcutSets,
    exercises,
    trainingSessions,
    sessionExercises,
    setRecords,
    bodyCompositions,
    boneDensities,
    supplements,
  };
}

/** 開発用: 全消去して再投入する */
export async function resetAndSeed(): Promise<SeedResult> {
  await Promise.all(db.tables.map((t) => t.clear()));
  return seedIfEmpty();
}
