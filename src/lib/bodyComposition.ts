/**
 * F5: 体組成・骨密度の画面に出すものと、記録フォームの検証（純関数）。
 *
 * ★ 守ること ★
 *  - 機種が違う測定は同じグラフに並べない（groupByDevice で機種ごとに分ける）。
 *  - グラフの主役は体重ではなく脂肪量と除脂肪量。目標ラインは設定（Settings.goal）から取り、数値を直書きしない。
 *  - 測定条件は「最後のトレからの日数」で見る。計算は lib/measurement.ts の evaluateConditions に任せる
 *    （測定時刻より後のトレは数えない）。条件が悪くても保存は止めず、印を付けて区別する。
 *  - 空欄は null で保存する（0 で埋めない）。
 *
 * ★ ここは純関数だけ。DB も React も触らない。★ 保存は db/body.ts。
 */
import type {
  BodyComposition,
  BoneDensity,
  GoalLine,
  IsoDateTime,
  MeasurementConditions,
  MeasurementWarning,
  SegmentFat,
  SegmentKey,
  SegmentMuscle,
  TrainingSession,
} from "../db/types";
import { SEGMENT_KEYS, SEGMENT_LABELS } from "../db/types";
import { formatLogDateShort, timeOf } from "./date";
import { UNKNOWN_MARK } from "./format";
import { fmtKcal } from "./formatKcal";
import { evaluateConditions } from "./measurement";
import { formatNumber, round2 } from "./number";
import type { TrendPoint, TrendReference } from "./trendChart";

/* ------------------------------------------------------------------ */
/* 一覧・グラフ                                                         */
/* ------------------------------------------------------------------ */

/** 条件が悪い測定の印（一覧とグラフの数値の一覧で同じ文字） */
export const POOR_CONDITION_MARK = "⚠ 条件が悪い";

/**
 * 条件が悪い測定か。警告のうち high / medium があれば悪い。
 * info（食後時間の未記録など）は「分からない」だけなので悪いとはしない。
 */
export function isPoorCondition(body: { warnings: MeasurementWarning[] }) {
  return body.warnings.some((w) => w.severity !== "info");
}

/** 新しい順（測定日時の降順。同じ日時は後から入れたもの = id の大きい方を先に）。元の配列は変えない */
export function sortNewestFirst<
  T extends { measuredAt: IsoDateTime; id?: number },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.measuredAt === b.measuredAt
      ? (b.id ?? 0) - (a.id ?? 0)
      : a.measuredAt < b.measuredAt
        ? 1
        : -1,
  );
}

export interface DeviceGroup {
  device: string;
  /** 古い順 */
  rows: BodyComposition[];
}

/**
 * 機種ごとに分ける。機種名の前後の空白は同じ機種とみなす。
 * グループの並びは、最新の測定が新しい機種から（今使っている機種が上に来る）。
 */
export function groupByDevice(rows: BodyComposition[]): DeviceGroup[] {
  const byDevice = new Map<string, BodyComposition[]>();
  for (const row of rows) {
    const device = row.device.trim();
    const list = byDevice.get(device) ?? [];
    list.push(row);
    byDevice.set(device, list);
  }
  const groups = [...byDevice].map(([device, list]) => ({
    device,
    rows: sortNewestFirst(list).reverse(),
  }));
  const latest = (g: DeviceGroup) => g.rows[g.rows.length - 1].measuredAt;
  return groups.sort((a, b) => (latest(a) < latest(b) ? 1 : -1));
}

export type BodyMetric = "fatMassKg" | "leanMassKg";

/** グラフに出す 2 つ（脂肪量・除脂肪量）。目標ラインは GoalLine の同じ名前の値 */
export const BODY_METRICS: { key: BodyMetric; label: string }[] = [
  { key: "fatMassKg", label: "脂肪量" },
  { key: "leanMassKg", label: "除脂肪量" },
];

/**
 * 体組成の推移グラフの縦の範囲の最小幅（kg）。機種の表示の誤差ほどの差（0.1kg）が
 * 描画域いっぱいの急落に見えないように、これより狭くしない
 */
export const BODY_TREND_MIN_SPAN_KG = 2;

export interface BodyTrend {
  title: string;
  unit: string;
  points: TrendPoint[];
  reference: TrendReference;
  /** 縦の範囲の最小幅（TrendChart の minSpan） */
  minSpan: number;
}

/** 1 機種ぶん（古い順）の推移。値の無い回は飛ばす。条件が悪い回は白抜き */
export function bodyTrend(
  rows: BodyComposition[],
  metric: BodyMetric,
  goal: GoalLine,
): BodyTrend {
  const label = BODY_METRICS.find((m) => m.key === metric)?.label ?? metric;
  const points: TrendPoint[] = [];
  for (const row of rows) {
    const value = row[metric];
    if (value === null) continue;
    const poor = isPoorCondition(row);
    points.push({
      label: formatLogDateShort(row.measuredAt.slice(0, 10)),
      value,
      filled: !poor,
      detail: [timeOf(row.measuredAt), row.place.trim()]
        .filter((s) => s !== "")
        .join(" "),
      status: poor ? POOR_CONDITION_MARK : "",
    });
  }
  return {
    title: `${label}の推移`,
    unit: "kg",
    points,
    reference: {
      value: goal[metric],
      label: `目標（${goal.label}）${formatNumber(goal[metric])}kg`,
    },
    minSpan: BODY_TREND_MIN_SPAN_KG,
  };
}

/**
 * 測定値の表示。未確認（null）は UNKNOWN_MARK。kcal は桁区切りの整数（fmtKcal）、ほかは formatNumber
 */
export function formatMeasure(value: number | null, unit: string): string {
  if (value === null) return UNKNOWN_MARK;
  return unit === "kcal"
    ? `${fmtKcal(value)}kcal`
    : `${formatNumber(value)}${unit}`;
}

/* ------------------------------------------------------------------ */
/* フォーム（共通）                                                      */
/* ------------------------------------------------------------------ */

/** 数値の欄の決まり。範囲は機種の表示範囲より少し広めの「打ち間違いを止める」ための幅 */
export interface NumberRule {
  label: string;
  unit: string;
  min: number;
  max: number;
}

const MEASURED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function checkMeasuredAt(value: string, errors: string[]): IsoDateTime {
  if (!MEASURED_AT_PATTERN.test(value)) errors.push("測定日時を入れてください");
  return value;
}

/** 空欄は null。数値にならない・範囲の外はエラー。保存する値は小数第 2 位で丸める */
function parseRuled(
  text: string,
  rule: NumberRule,
  errors: string[],
  required = false,
): number | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    if (required) errors.push(`${rule.label}を入れてください`);
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    errors.push(`${rule.label}は数値で入れてください`);
    return null;
  }
  if (value < rule.min || value > rule.max) {
    errors.push(
      `${rule.label}は${rule.min}〜${rule.max}${rule.unit}の範囲で入れてください`,
    );
    return null;
  }
  return round2(value);
}

/* ------------------------------------------------------------------ */
/* 体組成フォーム                                                        */
/* ------------------------------------------------------------------ */

export type BodyMainKey =
  | "weightKg"
  | "bodyFatPercent"
  | "fatMassKg"
  | "leanMassKg"
  | "muscleMassKg"
  | "appendicularMuscleKg"
  | "bmrKcal"
  | "visceralFatLevel";

/** 主な項目（フォームの並び）。脂肪量・除脂肪量は必須 */
export const BODY_MAIN_FIELDS: (NumberRule & {
  key: BodyMainKey;
  required: boolean;
})[] = [
  {
    key: "weightKg",
    label: "体重",
    unit: "kg",
    min: 20,
    max: 300,
    required: false,
  },
  {
    key: "bodyFatPercent",
    label: "体脂肪率",
    unit: "%",
    min: 1,
    max: 70,
    required: false,
  },
  {
    key: "fatMassKg",
    label: "脂肪量",
    unit: "kg",
    min: 0,
    max: 200,
    required: true,
  },
  {
    key: "leanMassKg",
    label: "除脂肪量",
    unit: "kg",
    min: 10,
    max: 200,
    required: true,
  },
  {
    key: "muscleMassKg",
    label: "筋肉量",
    unit: "kg",
    min: 10,
    max: 200,
    required: false,
  },
  {
    key: "appendicularMuscleKg",
    label: "四肢骨格筋量",
    unit: "kg",
    min: 1,
    max: 100,
    required: false,
  },
  {
    key: "bmrKcal",
    label: "基礎代謝（BMR）",
    unit: "kcal",
    min: 500,
    max: 5000,
    required: false,
  },
  {
    key: "visceralFatLevel",
    label: "内臓脂肪レベル",
    unit: "",
    min: 1,
    max: 59,
    required: false,
  },
];

export type SegmentFieldKey = "muscleKg" | "fatKg" | "fatPercent";

/** 部位別の 3 つ（列の並び） */
export const SEGMENT_FIELDS: {
  key: SegmentFieldKey;
  label: string;
  unit: string;
  min: number;
  max: number;
}[] = [
  { key: "muscleKg", label: "筋肉量", unit: "kg", min: 0, max: 100 },
  { key: "fatKg", label: "脂肪量", unit: "kg", min: 0, max: 100 },
  { key: "fatPercent", label: "脂肪率", unit: "%", min: 0, max: 80 },
];

export const SALT_RULE: NumberRule = {
  label: "前日の塩分",
  unit: "g",
  min: 0,
  max: 50,
};
export const MEAL_HOURS_RULE: NumberRule = {
  label: "食後経過時間",
  unit: "時間",
  min: 0,
  max: 48,
};

export type BodyFormValues = Record<BodyMainKey, string> & {
  measuredAt: string;
  place: string;
  device: string;
  segments: Record<SegmentKey, Record<SegmentFieldKey, string>>;
  previousDaySaltG: string;
  hoursSinceLastMeal: string;
  note: string;
};

/** 空のフォーム。機種と場所は前回の測定から引き継ぐ（機種の表記ゆれを作らないため） */
export function emptyBodyForm(
  measuredAt: IsoDateTime,
  last: Pick<BodyComposition, "device" | "place"> | null,
): BodyFormValues {
  const segments = Object.fromEntries(
    SEGMENT_KEYS.map((key) => [
      key,
      { muscleKg: "", fatKg: "", fatPercent: "" },
    ]),
  ) as Record<SegmentKey, Record<SegmentFieldKey, string>>;
  return {
    measuredAt,
    place: last?.place ?? "",
    device: last?.device ?? "",
    weightKg: "",
    bodyFatPercent: "",
    fatMassKg: "",
    leanMassKg: "",
    muscleMassKg: "",
    appendicularMuscleKg: "",
    bmrKcal: "",
    visceralFatLevel: "",
    segments,
    previousDaySaltG: "",
    hoursSinceLastMeal: "",
    note: "",
  };
}

export interface BodyFormResult {
  errors: string[];
  /** 測定条件（入力の途中でも出す。最後のトレからの日数の表示に使う） */
  conditions: MeasurementConditions;
  warnings: MeasurementWarning[];
  /** エラーが無いときだけ埋まる */
  record: Omit<BodyComposition, "id"> | null;
}

export function buildBodyComposition(
  values: BodyFormValues,
  sessions: TrainingSession[],
  options: { minRestDays: number },
): BodyFormResult {
  const errors: string[] = [];
  const measuredAt = checkMeasuredAt(values.measuredAt, errors);
  const device = values.device.trim();
  if (device === "")
    errors.push("機種を入れてください（機種ごとに分けてグラフにします）");

  const main = Object.fromEntries(
    BODY_MAIN_FIELDS.map((field) => [
      field.key,
      parseRuled(values[field.key], field, errors, field.required),
    ]),
  ) as Record<BodyMainKey, number | null>;

  const segmentMuscle = {} as Record<SegmentKey, SegmentMuscle>;
  const segmentFat = {} as Record<SegmentKey, SegmentFat>;
  for (const key of SEGMENT_KEYS) {
    const [muscleKg, fatKg, fatPercent] = SEGMENT_FIELDS.map((field) =>
      parseRuled(
        values.segments[key][field.key],
        { ...field, label: `${SEGMENT_LABELS[key]}の${field.label}` },
        errors,
      ),
    );
    segmentMuscle[key] = { muscleKg, score: null };
    segmentFat[key] = { fatKg, fatPercent, score: null };
  }

  const previousDaySaltG = parseRuled(
    values.previousDaySaltG,
    SALT_RULE,
    errors,
  );
  const hoursSinceLastMeal = parseRuled(
    values.hoursSinceLastMeal,
    MEAL_HOURS_RULE,
    errors,
  );

  const { conditions, warnings } = evaluateConditions(
    { measuredAt, previousDaySaltG, hoursSinceLastMeal },
    MEASURED_AT_PATTERN.test(measuredAt) ? sessions : [],
    { minRestDays: options.minRestDays },
  );

  if (errors.length > 0) return { errors, conditions, warnings, record: null };

  // キーの並びは型（BodyComposition）と同じ。JSON バックアップの行のキー順になる
  const record: Omit<BodyComposition, "id"> = {
    measuredAt,
    place: values.place.trim(),
    device,
    weightKg: main.weightKg,
    bodyFatPercent: main.bodyFatPercent,
    fatMassKg: main.fatMassKg,
    leanMassKg: main.leanMassKg,
    muscleMassKg: main.muscleMassKg,
    appendicularMuscleKg: main.appendicularMuscleKg,
    bodyWaterKg: null,
    bodyWaterPercent: null,
    bmi: null,
    boneMassKg: null,
    bmrKcal: main.bmrKcal,
    visceralFatLevel: main.visceralFatLevel,
    athleteIndex: null,
    smi: null,
    mmPerHeightSq: null,
    mmPerBodyWeight: null,
    asmPerBodyWeight: null,
    bodyTypeLabel: null,
    legMuscleScore: null,
    waistHipRatio: null,
    segmentMuscle,
    segmentFat,
    conditions,
    warnings,
    extra: {},
    note: values.note.trim(),
  };
  return { errors, conditions, warnings, record };
}

/* ------------------------------------------------------------------ */
/* 骨密度フォーム                                                        */
/* ------------------------------------------------------------------ */

export type BoneNumberKey = "sosMps" | "yamPercent" | "agePercent";

export const BONE_FIELDS: (NumberRule & { key: BoneNumberKey })[] = [
  { key: "sosMps", label: "SOS", unit: "m/sec", min: 1000, max: 2500 },
  { key: "yamPercent", label: "%YAM", unit: "%", min: 10, max: 200 },
  { key: "agePercent", label: "%AGE", unit: "%", min: 10, max: 200 },
];

export type BoneFormValues = Record<BoneNumberKey, string> & {
  measuredAt: string;
  place: string;
  device: string;
  rank: string;
  note: string;
};

export function emptyBoneForm(
  measuredAt: IsoDateTime,
  last: Pick<BoneDensity, "device" | "place"> | null,
): BoneFormValues {
  return {
    measuredAt,
    place: last?.place ?? "",
    device: last?.device ?? "",
    sosMps: "",
    yamPercent: "",
    agePercent: "",
    rank: "",
    note: "",
  };
}

export function buildBoneDensity(values: BoneFormValues): {
  errors: string[];
  record: Omit<BoneDensity, "id"> | null;
} {
  const errors: string[] = [];
  const measuredAt = checkMeasuredAt(values.measuredAt, errors);
  const device = values.device.trim();
  if (device === "")
    errors.push("機種を入れてください（機種ごとに分けて並べます）");
  const numbers = Object.fromEntries(
    BONE_FIELDS.map((field) => [
      field.key,
      parseRuled(values[field.key], field, errors),
    ]),
  ) as Record<BoneNumberKey, number | null>;
  if (errors.length > 0) return { errors, record: null };
  return {
    errors,
    record: {
      measuredAt,
      place: values.place.trim(),
      device,
      sosMps: numbers.sosMps,
      yamPercent: numbers.yamPercent,
      agePercent: numbers.agePercent,
      rank: values.rank.trim().toUpperCase(),
      heelTempC: null,
      deviceTempC: null,
      note: values.note.trim(),
    },
  };
}
