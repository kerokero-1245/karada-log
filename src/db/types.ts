/**
 * karada-log データモデル
 * =======================
 * 仕様: app-spec-prompt.md / 初期データ: handover-20260914.md
 *
 * 設計の前提（handover §10「これまでの反省点」から）
 *  - 原則1: 計画値で実績を埋めない。
 *    ShortcutSet（固定ベース）は「計画」であり、MealEntry（実績）には自動で入らない。
 *    型の上でも両者は完全に別テーブルで、ShortcutSet から MealEntry への変換は
 *    ユーザーのタップ操作だけが行う。
 *  - 原則2: トレーニング重量はバー種別とセットで持つ。
 *    LoadSpec は「総重量の数値」ではなく「何をどう積んだか」を持ち、
 *    総重量は lib/weight.ts で計算する。内訳を常に表示できる。
 *  - 未入力は 0 ではなく null。handover の「—」は「0」ではなく「未確認」。
 */

/* ------------------------------------------------------------------ */
/* 共通                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 論理日付 'YYYY-MM-DD'。
 * 朝4時境界: 深夜 0:00〜3:59 の記録は前日に計上する（Settings.dayBoundaryHour）。
 * 集計・グラフ・アラートはすべてこの値で束ねる。
 */
export type LogDate = string;

/**
 * ローカル時刻の ISO 風文字列 'YYYY-MM-DDTHH:mm'（タイムゾーンを付けない）。
 * 端末内完結・単一ユーザーなので UTC 変換はしない。文字列比較で時系列順に並ぶ。
 */
export type IsoDateTime = string;

/** 栄養値。未入力は null（handover の「—」）。0 と区別する。 */
export interface Nutrition {
  kcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbG: number | null;
  saltG: number | null;
}

export type NutrientKey = keyof Nutrition;

export const NUTRIENT_KEYS: NutrientKey[] = ['kcal', 'proteinG', 'fatG', 'carbG', 'saltG'];

export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  kcal: 'kcal',
  proteinG: 'P',
  fatG: '脂質',
  carbG: '炭水',
  saltG: '塩分',
};

/* ------------------------------------------------------------------ */
/* 食品マスタ                                                           */
/* ------------------------------------------------------------------ */

export const FOOD_CATEGORIES = [
  '麺類',
  '主食',
  '肉',
  '魚',
  '卵',
  '乳製品',
  'プロテイン',
  'ナッツ',
  '果物',
  '弁当・惣菜',
  '菓子',
  '飲料',
  'その他',
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

/** F7「麺類を2日連続で記録」アラートの判定に使うカテゴリ。ラーメン・うどん・パスタを含む。 */
export const NOODLE_CATEGORY: FoodCategory = '麺類';

/** ラベル実測値か、推定値か。推定値は画面上で区別して表示する（F3）。 */
export type ValueSource = 'label' | 'estimated';

/**
 * 入力時の表記。栄養値は Food.per に「1単位あたり」で正規化して保存するが、
 * 元の表記（「100gあたり」「1袋51gあたり」など）を失うと再確認できないので残す。
 *
 * 例: トップバリュ素焼きマカダミアは袋に「10gあたり76kcal」とあり、1単位=10g で登録。
 *     実際に食べる30gは MealEntry.quantity = 3 で表す。
 * 例: 味付ゆで玉子は「2個 130kcal」表記だが 1単位=1個 に正規化（unitsPerBasis=2）。
 */
export interface EntryBasis {
  /** ラベルの表記そのまま。例: '2個あたり' '10gあたり' '1食あたり' */
  label: string;
  /** その表記1つ分が何「単位」にあたるか。'2個あたり' で 1単位=1個 なら 2。 */
  unitsPerBasis: number;
}

export interface Food {
  id?: number;
  name: string;
  /** 「1単位」の表示名。例: '1個' '10g' '1食' '1杯(30g)' '1本(240ml)' */
  unitLabel: string;
  /** 1単位のグラム数。不明・グラム換算できないものは null */
  gramsPerUnit: number | null;
  /** 1単位あたりに正規化した栄養値 */
  per: Nutrition;
  source: ValueSource;
  /** 正規化前の表記（再確認・再編集用） */
  basis: EntryBasis;
  category: FoodCategory;
  note: string;
  /**
   * 呼び名。チャット風テキストの照合に使う別名。
   * 例: ザバス MILK PROTEIN には 'ザバス' 'ザバスミルク'。
   *
   * 既定値は seed が入れるが、ユーザーが手で解決した項目からも増える（lib/aliases.ts）。
   * Dexie では `*aliases`（multiEntry）として索引を張っている。
   */
  aliases: string[];
  /**
   * バリアント（同一商品の食べ方違い）を束ねるキー。単独商品は null。
   * 例: 'cupnoodle-big' → 「スープ残し(塩分3.0g)」「スープ完飲(6.1g)」
   * 例: 'marugame-umakara-udon-3' → 「つゆ残し(6.5g)」「全量(10.0g)」
   *
   * 親レコードは作らず、バリアントを対等な兄弟行にしている。理由:
   *  - MealEntry.foodId が指す先は必ず「栄養値が確定した1行」になる（原則1）。
   *    親行を作ると「親を記録したとき塩分はどちらか」が曖昧になる。
   *  - 使用頻度（useCount）がバリアント単位で貯まる。「いつも汁を残す」人には
   *    汁残しが上に出る。これが F2 の頻度順表示で欲しい挙動。
   *  - 片方だけラベルを更新しても、もう片方が壊れない。
   */
  variantGroupId: string | null;
  /** バリアント名。例: 'スープ残し' 'つゆ残し'。単独商品は null */
  variantLabel: string | null;
  /** 使用回数（F2 の頻度順表示用）。MealEntry 追加時に +1 する */
  useCount: number;
  lastUsedAt: IsoDateTime | null;
  /** 在庫切れ・終売など、当面候補から下げたいもの（削除はしない） */
  archived: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* 食事記録（実績）                                                      */
/* ------------------------------------------------------------------ */

/**
 * 記録時点の食品情報のスナップショット。
 * 食品マスタを後から修正しても、過去の実績が勝手に動かないようにする。
 * （推定値を実測ラベルに直したときは、明示的な再計算コマンドで更新する想定）
 */
export interface MealSnapshot {
  name: string;
  variantLabel: string | null;
  unitLabel: string;
  category: FoodCategory;
  source: ValueSource;
  per: Nutrition;
}

export interface MealEntry {
  id?: number;
  foodId: number;
  /** 単位いくつ分か。マカダミア30g = 1単位10g × 3 */
  quantity: number;
  /** 実際に食べた時刻（食事リズムの分析に使う） */
  recordedAt: IsoDateTime;
  /** recordedAt から求めた論理日付（朝4時境界） */
  logDate: LogDate;
  snapshot: MealSnapshot;
  /**
   * どの ShortcutSet のタップで入れたか（分析用）。
   * これは「ユーザーがタップした結果」であって自動計上ではない。
   */
  fromShortcutSetId: number | null;
  /**
   * メモ。チャット風テキストから記録したときは **原文** をそのまま残す。
   * 「ザバス2本」と書いて記録したものが、後から見て何だったか分かるように。
   */
  note: string;
}

/* ------------------------------------------------------------------ */
/* 未処理テキスト                                                        */
/* ------------------------------------------------------------------ */

/**
 * チャット風テキストのうち、食品に結び付けられなかった原文。
 *
 * ★ 栄養値は持たない。集計には一切入らない。★
 *   「たぶんこれだろう」で食品に当てて記録すると、§10-① と同じ
 *   「信用できない記録」になる。解決できるまで原文のまま預かっておき、
 *   ダッシュボードに「未処理のテキスト N件」として出す。
 */
export interface PendingText {
  id?: number;
  /** 1項目ぶんの原文 */
  text: string;
  /** なぜ未処理なのか。'見つかりませんでした' / '候補から選べていません' */
  reason: string;
  /** 入力したときの論理日付。再解決したときはこの日の記録にする */
  logDate: LogDate;
  /** 入力したときに指定されていた時刻 */
  recordedAt: IsoDateTime;
  createdAt: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* 固定ベース（ショートカット）= 計画。実績ではない                        */
/* ------------------------------------------------------------------ */

export type MealTiming = '朝' | '日中' | '間食' | '夜' | 'ジム後';

export interface ShortcutItem {
  foodId: number;
  quantity: number;
  timing: MealTiming;
  note: string;
}

/**
 * 固定ベース。「毎日これを食べる」という **計画**。
 *
 * ★ この型のデータは、いかなる集計にも実績として混ぜてはならない。★
 * ユーザーがタップしたときにだけ MealEntry を生成する（原則1）。
 * 過去に自動計上した結果、実際より大きく食べたと誤認し、
 * 「もう十分食べている」と正反対の助言をした事故がある（handover §10-①）。
 */
export interface ShortcutSet {
  id?: number;
  name: string;
  items: ShortcutItem[];
  order: number;
  note: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* 日の区分                                                             */
/* ------------------------------------------------------------------ */

export type DayType = 'gym' | 'rest';

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  gym: 'ジムの日',
  rest: '休養日',
};

/**
 * 論理日付ごとのメタ情報。
 * 行が無い日は「トレ記録があれば gym、無ければ rest」として扱う（自動判定）。
 * 手動で切り替えたときだけ行を作り、source='manual' で自動判定に優先する。
 */
export interface DayMeta {
  /** 主キー。論理日付 */
  logDate: LogDate;
  dayType: DayType;
  source: 'auto' | 'manual';
  note: string;
  updatedAt: IsoDateTime;
}

/* ------------------------------------------------------------------ */
/* トレーニング                                                         */
/* ------------------------------------------------------------------ */

export type MenuId = 'A' | 'B' | 'C';

export const MENU_LABELS: Record<MenuId, string> = {
  A: 'A（押す）',
  B: 'B（引く）',
  C: 'C（脚・体幹）',
};

/** バー種別。取り違え事故があるため必ず記録する（原則2） */
export type BarType = 'ez' | 'short';

export const BAR_WEIGHT_KG: Record<BarType, number> = {
  ez: 7,
  short: 10,
};

export const BAR_LABELS: Record<BarType, string> = {
  ez: 'EZバー',
  short: 'ショートバー',
};

/**
 * 重量の持ち方。総重量の数値ではなく「何をどう積んだか」を持つ。
 * 総重量と内訳文字列は lib/weight.ts で導出する。
 */
export type LoadSpec =
  /** バーベル: 総重量 = バー重量 + プレート片側 × 2 */
  | { style: 'barbell'; barType: BarType; plateKgPerSide: number }
  /** ダンベル: 片手◯kg を hands 本。進捗は片手の重量で追う */
  | { style: 'dumbbell'; kgPerHand: number; hands: 1 | 2 }
  /** マシン: スタックの総重量そのもの */
  | { style: 'machine'; stackKg: number }
  /** 自重（アブローラーなど）。加重があれば addedKg */
  | { style: 'bodyweight'; addedKg: number | null }
  /** 総重量だけ分かっていて構成が未確定。次回の実測で確定させる */
  | { style: 'other'; totalKg: number; description: string };

/** 種目の種類 */
export type ExerciseKind =
  /** 重量 × 回数（規定回数に到達したかで進捗判定） */
  | 'weight_reps'
  /** 時間ベース（ファーマーズウォークなど。秒数で記録） */
  | 'timed'
  /** 限界まで（アブローラーなど。回数は記録するが進捗判定はしない） */
  | 'amrap';

/** 次回の上げ幅。種目ごとに違う（レッグプレス +3.5kg / ベンチ +2.5kg / ダンベル +2kg片側 / ファーマーズ +5秒） */
export interface Progression {
  metric: 'weight' | 'seconds';
  amount: number;
  /** 'total' = 総重量に加算 / 'perHand' = ダンベル片手に加算。metric='seconds' では 'total' */
  basis: 'total' | 'perHand';
}

/** その種目で狙う設定値の組。「現在」と「次回」を同じ形で持つ */
export interface ExerciseTarget {
  load: LoadSpec;
  /** 規定回数。通常10。時間ベース・限界回数は null */
  reps: number | null;
  /** 時間ベース種目の規定秒数 */
  seconds: number | null;
}

export interface Exercise {
  id?: number;
  menu: MenuId;
  name: string;
  kind: ExerciseKind;
  /** 実施順。上から順に実施し、時間がなければ下から切る。1種目目は必ずやる */
  order: number;
  /** 直近に到達している設定（handover §5 の「現在」列） */
  current: ExerciseTarget;
  /** 次回の予定（同「次回」列）。達成判定で自動提案し、手動で上書きできる */
  next: ExerciseTarget | null;
  /** セット数。通常3 */
  sets: number;
  progression: Progression | null;
  /**
   * 重量に実測の裏付けがあるか。
   * false = 未検証。次回の実施時の重量を正として上書きする（handover §13）。
   */
  verified: boolean;
  /** 注意メモ。グリップ、実施順、原因の切り分けなど */
  note: string;
  active: boolean;
}

export interface TrainingSession {
  id?: number;
  menu: MenuId;
  startedAt: IsoDateTime;
  /** 開始時刻が未記録で、仮置きの値であることを示す（体組成の条件計算に効く） */
  startedAtIsEstimated: boolean;
  logDate: LogDate;
  note: string;
}

/**
 * 種目ごとの結果。
 * 「結果は分かるが各セットの回数は記録が無い」ケースが実際にあるため、
 * セット明細（SetRecord）と種目単位の結果を分けている。
 * 例: ライイングエクステンション = 据え置きは確定、回数は未記録。
 */
export type ExerciseOutcome =
  /** 3セットとも規定に到達 → 次回 +増分を提案 */
  | 'achieved'
  /** 1セットでも届かなかった → 据え置き */
  | 'held'
  /** 判定できるだけの記録が無い */
  | 'unknown';

export const OUTCOME_LABELS: Record<ExerciseOutcome, string> = {
  achieved: '達成',
  held: '据え置き',
  unknown: '記録なし',
};

export interface SessionExercise {
  id?: number;
  sessionId: number;
  exerciseId: number;
  /** そのセッションでの実施順（順番は結果の原因になるので記録する） */
  order: number;
  /** 記録時点の種目名スナップショット */
  exerciseName: string;
  /** 記録時点の重量スナップショット。バー種別を含む（原則2） */
  load: LoadSpec;
  outcome: ExerciseOutcome;
  note: string;
}

export interface SetRecord {
  id?: number;
  sessionExerciseId: number;
  setNo: number;
  /** 回数。不明は null（捏造しない） */
  reps: number | null;
  /** 時間ベース種目の秒数 */
  seconds: number | null;
  /** 規定に到達したか。判定できなければ null */
  achieved: boolean | null;
  note: string;
}

/* ------------------------------------------------------------------ */
/* 体組成                                                              */
/* ------------------------------------------------------------------ */

export type SegmentKey = 'trunk' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';

export const SEGMENT_KEYS: SegmentKey[] = ['trunk', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  trunk: '体幹部',
  rightArm: '右腕',
  leftArm: '左腕',
  rightLeg: '右足',
  leftLeg: '左足',
};

export interface SegmentMuscle {
  muscleKg: number | null;
  /** 機種が出す判定スコア（-2〜+2 など） */
  score: number | null;
}

export interface SegmentFat {
  fatKg: number | null;
  fatPercent: number | null;
  score: number | null;
}

export type MeasurementWarningCode =
  /** 最後のトレから3日未満（水分・炎症で重く出る） */
  | 'training_gap_lt3'
  /** 前日の塩分が高い（測定前はパターンC 2〜3g が条件） */
  | 'previous_day_high_salt'
  /** 食後経過時間が未記録 */
  | 'meal_timing_unknown'
  /** 食後2時間未満 */
  | 'meal_too_recent';

export interface MeasurementWarning {
  code: MeasurementWarningCode;
  severity: 'high' | 'medium' | 'info';
  message: string;
}

/**
 * 測定条件。F5 の要件そのもの。
 * 「前日のトレ有無」ではなく **最後のトレからの日数** で持つ。
 * 同日のトレは、測定時刻より前に実施したものだけを数える
 * （測定 → トレの順だった日は、その日のトレは数えない）。
 */
export interface MeasurementConditions {
  previousDaySaltG: number | null;
  /** 測定時刻より前で最後のトレの開始時刻 */
  lastTrainingAt: IsoDateTime | null;
  /** 上記から測定日までの日数（論理日付の差）。3未満で警告 */
  daysSinceLastTraining: number | null;
  /** 直前の食事からの経過時間。目安は2〜3時間 */
  hoursSinceLastMeal: number | null;
  note: string;
}

export interface BodyComposition {
  id?: number;
  measuredAt: IsoDateTime;
  place: string;
  /**
   * 機種。異なる機種の値は同一グラフに並べない（F5）。
   * グルーピングのキーなので表記ゆれを作らないこと。
   */
  device: string;

  weightKg: number | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  muscleMassKg: number | null;
  /** 四肢骨格筋量 */
  appendicularMuscleKg: number | null;
  bodyWaterKg: number | null;
  bodyWaterPercent: number | null;
  bmi: number | null;
  /** 推定骨量 */
  boneMassKg: number | null;
  bmrKcal: number | null;
  visceralFatLevel: number | null;

  /** 機種が出す派生指標（TANITA MC-980） */
  athleteIndex: number | null;
  smi: number | null;
  mmPerHeightSq: number | null;
  mmPerBodyWeight: number | null;
  asmPerBodyWeight: number | null;
  bodyTypeLabel: string | null;
  legMuscleScore: number | null;
  waistHipRatio: number | null;

  segmentMuscle: Record<SegmentKey, SegmentMuscle>;
  segmentFat: Record<SegmentKey, SegmentFat>;

  conditions: MeasurementConditions;
  /** 条件が悪い測定の印。グラフ上で区別する */
  warnings: MeasurementWarning[];

  /** 他機種の固有項目を取りこぼさないための逃がし場所 */
  extra: Record<string, string | number>;
  note: string;
}

/** 骨密度（踵骨超音波）。体組成とは機種も測り方も違うので別テーブル */
export interface BoneDensity {
  id?: number;
  measuredAt: IsoDateTime;
  place: string;
  device: string;
  /** 音速 m/sec */
  sosMps: number | null;
  /** 若年成人比 % */
  yamPercent: number | null;
  /** 同年代比 % */
  agePercent: number | null;
  /** 判定ランク A/B/C など */
  rank: string;
  heelTempC: number | null;
  deviceTempC: number | null;
  note: string;
}

/* ------------------------------------------------------------------ */
/* サプリメント                                                         */
/* ------------------------------------------------------------------ */

export interface Supplement {
  id?: number;
  name: string;
  dose: string;
  note: string;
  active: boolean;
}

/* ------------------------------------------------------------------ */
/* 設定                                                                */
/* ------------------------------------------------------------------ */

/** F7 のアラート閾値。割合ではなく絶対値で置く（handover の実データに基づく） */
export interface AlertThresholds {
  /** 着地見込みがこれを下回ったら最強の警告。BMR */
  bmrFloorKcal: number;
  /** 夜のチェック時刻 */
  eveningCheckHour: number;
  /** その時刻で残りがこれを超えていたら警告 */
  eveningRemainingKcal: number;
  /** 夕方のチェック時刻 */
  afternoonCheckHour: number;
  /** その時刻で摂取が目標のこの割合未満なら警告 */
  afternoonProgressRatio: number;
  /** 塩分が上限超過で連続したら警告する日数 */
  saltStreakDays: number;
  /** 麺類が連続したら警告する日数 */
  noodleStreakDays: number;
  /** 週合計カロリーの下限 */
  weeklyKcalFloor: number;
  /** 週次サマリーでハイライトする「脂質が低い日」の閾値 */
  lowFatDayG: number;
}

/** グラフに重ねる目標ライン。体重ではなく脂肪量と除脂肪量が主役 */
export interface GoalLine {
  fatMassKg: number;
  leanMassKg: number;
  targetDate: LogDate;
  label: string;
}

export interface Profile {
  heightCm: number;
  sex: 'male' | 'female';
  age: number;
}

/** 単一行（id = 1 固定） */
export interface Settings {
  id: 1;
  profile: Profile;

  /** 基礎代謝。絶対に下回らない下限 */
  bmrKcal: number;
  restDayKcal: number;
  gymDayKcal: number;

  proteinTargetG: number;
  /** 上限。超えても警告は出さない。グレー表示で「これ以上は使われない」とだけ示す */
  proteinCapG: number;
  /** 脂質。目標というより「まともに食べた日か」の検知指標 */
  fatTargetG: number;
  saltLimitG: number;
  weeklySaltAverageG: number;

  weeklyKcalTarget: number;
  weeklyKcalTolerance: number;
  /** 週のトレーニング回数の目標 */
  trainingPerWeek: number;

  /** 0=日曜 .. 1=月曜。週の起点は月曜 */
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** 日付境界。4時 */
  dayBoundaryHour: number;

  nextMeasurementDate: LogDate | null;
  /** 次回測定日の何日前からチェックリストを出すか */
  measurementChecklistLeadDays: number;
  /** 測定前に空けるべきトレーニングの日数 */
  measurementMinRestDays: number;

  goal: GoalLine;
  alerts: AlertThresholds;

  /** 初期データ投入のバージョン。冪等性の判定に使う */
  seedVersion: number;
  updatedAt: IsoDateTime;
}
