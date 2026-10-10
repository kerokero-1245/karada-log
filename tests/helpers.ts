/**
 * テストで共通に使う部品（フィクスチャ・スタブ・時刻の固定）。
 *
 * - Settings・Food などの「完全な形」のフィクスチャ。キャスト（as）で欠けを隠さない。
 * - db の書き込み口の差し替え（stub / restoreStubs）。Node には IndexedDB が無いので、
 *   Dexie の表のメソッドを差し替えて「何を書こうとしたか」を拾う。
 * - 時刻の固定（freezeTime / unfreezeTime）。new Date() と Date.now() だけを固定する。
 *
 * テストの本体ではない（*.test.ts ではないので node --test の対象にならない）。
 */
import type {
  BodyComposition,
  Exercise,
  Food,
  MealEntry,
  MealSnapshot,
  Nutrition,
  SegmentFat,
  SegmentMuscle,
  SessionExercise,
  SetRecord,
  Settings,
  TrainingSession,
} from "../src/db/types.ts";

/* ------------------------------------------------------------------ */
/* フィクスチャ                                                          */
/* ------------------------------------------------------------------ */

/** 設定（架空の値）。overrides で上書きする */
export function settingsFixture(overrides: Partial<Settings> = {}): Settings {
  return {
    id: 1,
    profile: { heightCm: 170, sex: "male", age: 30 },
    bmrKcal: 1500,
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
    nextMeasurementDate: null,
    measurementChecklistLeadDays: 2,
    measurementMinRestDays: 3,
    goal: {
      fatMassKg: 12,
      leanMassKg: 55,
      targetDate: "2026-12-31",
      label: "年末",
    },
    alerts: {
      bmrFloorKcal: 1500,
      eveningCheckHour: 20,
      eveningRemainingKcal: 1300,
      afternoonCheckHour: 15,
      afternoonProgressRatio: 0.4,
      saltStreakDays: 2,
      noodleStreakDays: 2,
      weeklyKcalFloor: 14300,
      lowFatDayG: 20,
    },
    seedVersion: 2,
    updatedAt: "2026-10-01T00:00",
    ...overrides,
  };
}

/** 栄養値。省略した項目は null（未確認） */
export function nutrition(values: Partial<Nutrition> = {}): Nutrition {
  return {
    kcal: null,
    proteinG: null,
    fatG: null,
    carbG: null,
    saltG: null,
    ...values,
  };
}

/** 食品（架空の値）。overrides で上書きする */
export function foodFixture(overrides: Partial<Food> = {}): Food {
  return {
    id: 1,
    name: "サンプル食品",
    unitLabel: "1個",
    gramsPerUnit: null,
    per: { kcal: 100, proteinG: 10, fatG: 1, carbG: 1, saltG: 0.1 },
    source: "label",
    basis: { label: "1個あたり", unitsPerBasis: 1 },
    category: "その他",
    note: "",
    aliases: [],
    variantGroupId: null,
    variantLabel: null,
    useCount: 0,
    lastUsedAt: null,
    archived: false,
    createdAt: "2026-10-05T12:00",
    updatedAt: "2026-10-05T12:00",
    ...overrides,
  };
}

/**
 * 食品マスタの見本（架空の値）。照合・候補・食べ方（バリアント）・在庫切れ・呼び名を一通り含む。
 *  - id 1 ザバス MILK PROTEIN … 呼び名 2 つ・使用 5 回
 *  - id 2 ザバス ヨーグルト（マンゴー）… 呼び名 1 つ
 *  - id 3 / 4 カップヌードル BIG … 食べ方（スープ残し / スープ完飲）、塩分は残しのほうが低い
 *  - id 5 / 6 丸亀 旨辛豚つけ汁うどん 3玉 … 食べ方（つゆ残し / 全量）
 *  - id 7 ビーレジェンド … 在庫切れ（archived）、40g で 1 単位
 *  - id 8 味付ゆで玉子 … 呼び名 2 つ・使用 9 回
 *  - id 9 ゴールドジム スムージー … 塩分は未確認
 *  - id 10 トップバリュ 素焼きマカダミア … 10g で 1 単位
 *  - id 11 / 12 プレーン / ギリシャヨーグルト … 同じ点数で並ぶ組
 * 毎回新しい配列を返す（呼び名の学習などで書き換えるテストがあるため）。
 */
export function catalogFixture(): Food[] {
  return [
    foodFixture({
      id: 1,
      name: "ザバス MILK PROTEIN",
      unitLabel: "1本(240ml)",
      per: nutrition({ kcal: 138, proteinG: 25, fatG: 0, saltG: 0.31 }),
      category: "プロテイン",
      aliases: ["ザバス", "ザバスミルク"],
      useCount: 5,
    }),
    foodFixture({
      id: 2,
      name: "ザバス ヨーグルト（マンゴー）",
      category: "乳製品",
      aliases: ["ザバスヨーグルト"],
      useCount: 1,
    }),
    foodFixture({
      id: 3,
      name: "カップヌードル BIG",
      category: "麺類",
      variantGroupId: "cupnoodle-big",
      variantLabel: "スープ残し",
      per: nutrition({ kcal: 300, saltG: 3.0 }),
      useCount: 3,
    }),
    foodFixture({
      id: 4,
      name: "カップヌードル BIG",
      category: "麺類",
      variantGroupId: "cupnoodle-big",
      variantLabel: "スープ完飲",
      per: nutrition({ kcal: 400, saltG: 6.1 }),
      useCount: 3,
    }),
    foodFixture({
      id: 5,
      name: "丸亀 旨辛豚つけ汁うどん 3玉",
      unitLabel: "1食",
      category: "麺類",
      variantGroupId: "marugame",
      variantLabel: "つゆ残し",
      per: nutrition({ kcal: 900, saltG: 6.5 }),
    }),
    foodFixture({
      id: 6,
      name: "丸亀 旨辛豚つけ汁うどん 3玉",
      unitLabel: "1食",
      category: "麺類",
      variantGroupId: "marugame",
      variantLabel: "全量",
      per: nutrition({ kcal: 950, saltG: 10 }),
    }),
    foodFixture({
      id: 7,
      name: "ビーレジェンド",
      unitLabel: "1杯(40g)",
      gramsPerUnit: 40,
      per: nutrition({ kcal: 150, proteinG: 15.9, fatG: 1, saltG: 0.1 }),
      category: "プロテイン",
      archived: true,
    }),
    foodFixture({
      id: 8,
      name: "味付ゆで玉子",
      per: nutrition({ kcal: 65, proteinG: 5.8, fatG: 4.3, saltG: 0.6 }),
      category: "卵",
      aliases: ["ゆで卵", "ゆでたまご"],
      useCount: 9,
    }),
    foodFixture({
      id: 9,
      name: "ゴールドジム スムージー",
      unitLabel: "1杯",
      per: nutrition({ kcal: 300, proteinG: 30, fatG: 0 }),
      category: "飲料",
    }),
    foodFixture({
      id: 10,
      name: "トップバリュ 素焼きマカダミア",
      unitLabel: "10g",
      gramsPerUnit: 10,
      per: nutrition({ kcal: 76, proteinG: 0.8, fatG: 7.6, saltG: 0 }),
      category: "ナッツ",
    }),
    foodFixture({ id: 11, name: "プレーンヨーグルト", category: "乳製品" }),
    foodFixture({ id: 12, name: "ギリシャヨーグルト", category: "乳製品" }),
  ];
}

/** 食品から記録時点の写しを作る（lib/meals.ts の snapshotOf と同じ形） */
export function snapshotFixture(food: Food): MealSnapshot {
  return {
    name: food.name,
    variantLabel: food.variantLabel,
    unitLabel: food.unitLabel,
    category: food.category,
    source: food.source,
    per: { ...food.per },
  };
}

/** 食事記録（架空の値）。snapshot を渡さなければ foodFixture() の写し */
export function mealEntryFixture(
  overrides: Partial<MealEntry> = {},
): MealEntry {
  return {
    id: 1,
    foodId: 1,
    quantity: 1,
    recordedAt: "2026-09-21T08:00",
    logDate: "2026-09-21",
    snapshot: snapshotFixture(foodFixture()),
    fromShortcutSetId: null,
    note: "",
    ...overrides,
  };
}

/** 種目マスタ（A メニュー 1 番目のベンチプレス。ショートバー + 片側 12.5kg、次回は 13.75kg） */
export function exerciseFixture(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 1,
    menu: "A",
    name: "ベンチプレス",
    kind: "weight_reps",
    order: 1,
    current: {
      load: { style: "barbell", barType: "short", plateKgPerSide: 12.5 },
      reps: 10,
      seconds: null,
    },
    next: {
      load: { style: "barbell", barType: "short", plateKgPerSide: 13.75 },
      reps: 10,
      seconds: null,
    },
    sets: 3,
    progression: { metric: "weight", amount: 2.5, basis: "total" },
    verified: true,
    note: "",
    active: true,
    ...overrides,
  };
}

/** トレーニングのセッション（A メニュー・開始時刻は実測） */
export function sessionFixture(
  overrides: Partial<TrainingSession> = {},
): TrainingSession {
  return {
    id: 1,
    menu: "A",
    startedAt: "2026-09-21T19:00",
    startedAtIsEstimated: false,
    logDate: "2026-09-21",
    note: "",
    ...overrides,
  };
}

/** セッション内の 1 種目の記録（ショートバー + 片側 12.5kg のベンチプレス） */
export function sessionExerciseFixture(
  overrides: Partial<SessionExercise> = {},
): SessionExercise {
  return {
    id: 1,
    sessionId: 1,
    exerciseId: 1,
    order: 1,
    exerciseName: "ベンチプレス",
    load: { style: "barbell", barType: "short", plateKgPerSide: 12.5 },
    outcome: "achieved",
    note: "",
    ...overrides,
  };
}

/** 1 セットの記録 */
export function setRecordFixture(
  overrides: Partial<SetRecord> = {},
): SetRecord {
  return {
    id: 1,
    sessionExerciseId: 1,
    setNo: 1,
    reps: 10,
    seconds: null,
    achieved: true,
    note: "",
    ...overrides,
  };
}

/** 体組成の測定（架空の値）。overrides で上書きする */
export function bodyFixture(
  overrides: Partial<BodyComposition> = {},
): BodyComposition {
  const muscle: SegmentMuscle = { muscleKg: null, score: null };
  const fat: SegmentFat = { fatKg: null, fatPercent: null, score: null };
  return {
    id: 1,
    measuredAt: "2026-09-20T08:00",
    place: "ジム",
    device: "TANITA MC-980",
    weightKg: 70,
    bodyFatPercent: 18.5,
    fatMassKg: 12.95,
    leanMassKg: 57.05,
    muscleMassKg: 54,
    appendicularMuscleKg: null,
    bodyWaterKg: null,
    bodyWaterPercent: null,
    bmi: null,
    boneMassKg: null,
    bmrKcal: 1600,
    visceralFatLevel: 5,
    athleteIndex: null,
    smi: null,
    mmPerHeightSq: null,
    mmPerBodyWeight: null,
    asmPerBodyWeight: null,
    bodyTypeLabel: null,
    legMuscleScore: null,
    waistHipRatio: null,
    segmentMuscle: {
      trunk: muscle,
      rightArm: muscle,
      leftArm: muscle,
      rightLeg: muscle,
      leftLeg: muscle,
    },
    segmentFat: {
      trunk: fat,
      rightArm: fat,
      leftArm: fat,
      rightLeg: fat,
      leftLeg: fat,
    },
    conditions: {
      previousDaySaltG: 2.5,
      lastTrainingAt: null,
      daysSinceLastTraining: null,
      hoursSinceLastMeal: 3,
      note: "",
    },
    warnings: [],
    extra: {},
    note: "",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* スタブ                                                                */
/* ------------------------------------------------------------------ */

const originals: { target: object; key: string; value: unknown }[] = [];

/**
 * target[key] を差し替える。restoreStubs() で、差し替えた順の逆に元へ戻す。
 * テストファイルごとに別のプロセスで走るので、記録（originals）は混ざらない。
 */
export function stub(
  target: object,
  key: string,
  value: (...args: never[]) => unknown,
): void {
  originals.push({ target, key, value: Reflect.get(target, key) });
  Reflect.set(target, key, value);
}

export function restoreStubs(): void {
  for (const original of originals.splice(0).reverse()) {
    Reflect.set(original.target, original.key, original.value);
  }
}

/** db.transaction("rw", ...tables, scope) を「scope をそのまま実行する」ものに差し替える形 */
export async function runScope(...args: unknown[]): Promise<unknown> {
  const scope = args[args.length - 1];
  if (typeof scope !== "function") {
    throw new Error("transaction の最後の引数が関数ではありません");
  }
  return scope();
}

/* ------------------------------------------------------------------ */
/* 時刻の固定                                                            */
/* ------------------------------------------------------------------ */

const RealDate = Date;

/**
 * new Date()（引数なし）と Date.now() を at に固定する。
 * 引数つきの new Date(...) と Date.UTC などはそのまま使える。unfreezeTime() で戻す。
 */
export function freezeTime(at: Date): void {
  const fixed = at.getTime();
  globalThis.Date = new Proxy(RealDate, {
    construct(target, args) {
      return args.length === 0
        ? new target(fixed)
        : Reflect.construct(target, args);
    },
    get(target, property, receiver) {
      if (property === "now") return () => fixed;
      return Reflect.get(target, property, receiver);
    },
  });
}

export function unfreezeTime(): void {
  globalThis.Date = RealDate;
}
