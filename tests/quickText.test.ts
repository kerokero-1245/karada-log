/**
 * チャット風テキストの解釈（lib/quickText.ts）の今の出力を固定する特性テスト。
 *
 * 直すためのテストではない。「いまこう動く」をそのまま写してあり、リファクタリングで
 * 出力が変わったら赤になる。正規化 → 項目の切り出し → 栄養値の付記 → 日付行 → 照合 → 確定 / 候補 /
 * 見つからない → 数量の決定、の順に並べてある。値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVED_PENALTY,
  findCandidates,
  groupKeyOf,
  interpret,
  isGramUnit,
  normalize,
  parseDateLine,
  parseItem,
  parseItems,
  parseNutritionText,
  quantityFor,
  resolveItem,
  scoreFood,
  sortVariants,
} from "../src/lib/quickText.ts";
import { catalogFixture, foodFixture, nutrition } from "./helpers.ts";

/* ------------------------------------------------------------------ */
/* 正規化                                                               */
/* ------------------------------------------------------------------ */

test("quickText.normalize: NFKC → ひらがなをカタカナへ → 小文字 → 空白除去", () => {
  assert.equal(normalize("ゆでたまご"), "ユデタマゴ");
  assert.equal(normalize("ＭＩＬＫ"), "milk");
  assert.equal(normalize("ザバス 2本"), "ザバス2本");
  assert.equal(normalize("ｶﾞｰﾘｯｸ"), "ガーリック");
  assert.equal(normalize("Ａｂｃ１２３"), "abc123");
  assert.equal(normalize("ひらがな カタカナ ABC"), "ヒラガナカタカナabc");
  assert.equal(normalize("  "), "");
});

test("quickText.isGramUnit: g / グラム / ml だけが重さ・容量（大文字小文字は区別しない）", () => {
  for (const unit of ["g", "G", "グラム", "ml", "ML"]) {
    assert.equal(isGramUnit(unit), true, unit);
  }
  for (const unit of ["本", "", null]) {
    assert.equal(isGramUnit(unit), false, String(unit));
  }
});

/* ------------------------------------------------------------------ */
/* 項目の切り出し                                                        */
/* ------------------------------------------------------------------ */

test("quickText.parseItem: 末尾の数量と単位を剥がす", () => {
  assert.deepEqual(parseItem("ザバス2本"), {
    raw: "ザバス2本",
    name: "ザバス",
    amount: 2,
    unit: "本",
    amountToken: "2本",
    time: null,
    inlineNutrition: null,
    logDate: null,
  });
  assert.deepEqual(parseItem("ワイルドステーキ300g"), {
    raw: "ワイルドステーキ300g",
    name: "ワイルドステーキ",
    amount: 300,
    unit: "g",
    amountToken: "300g",
    time: null,
    inlineNutrition: null,
    logDate: null,
  });
  assert.deepEqual(parseItem("ご飯 1杯"), {
    raw: "ご飯 1杯",
    name: "ご飯",
    amount: 1,
    unit: "杯",
    amountToken: "1杯",
    time: null,
    inlineNutrition: null,
    logDate: null,
  });
  const decimal = parseItem("ザバス 2.5本");
  assert.deepEqual(
    [decimal.name, decimal.amount, decimal.unit, decimal.amountToken],
    ["ザバス", 2.5, "本", "2.5本"],
  );
});

test("quickText.parseItem: 先頭の数量も拾う。長い単位（杯分）を先に見る", () => {
  const leading = parseItem("3玉 うどん");
  assert.deepEqual(
    [leading.name, leading.amount, leading.unit, leading.amountToken],
    ["うどん", 3, "玉", "3玉"],
  );
  const portion = parseItem("0.5杯分 ご飯");
  assert.deepEqual(
    [portion.name, portion.amount, portion.unit, portion.amountToken],
    ["ご飯", 0.5, "杯分", "0.5杯分"],
  );
  const three = parseItem("卵 3つ");
  assert.deepEqual(
    [three.name, three.amount, three.unit, three.amountToken],
    ["卵", 3, "つ", "3つ"],
  );
  const milk = parseItem("牛乳 200ml");
  assert.deepEqual(
    [milk.name, milk.amount, milk.unit, milk.amountToken],
    ["牛乳", 200, "ml", "200ml"],
  );
});

test("quickText.parseItem: 剥がすと名前が空になるときは剥がさない（数量は 1）", () => {
  const onlyAmount = parseItem("2本");
  assert.deepEqual(
    [onlyAmount.name, onlyAmount.amount, onlyAmount.unit],
    ["2本", 1, null],
  );
  const onlyGram = parseItem("10g");
  assert.deepEqual(
    [onlyGram.name, onlyGram.amount, onlyGram.unit],
    ["10g", 1, null],
  );
});

test("quickText.parseItem: 数量が 0 以下なら 1 に直す（数量トークンは書かれたまま）", () => {
  const zero = parseItem("0本 水");
  assert.deepEqual(
    [zero.name, zero.amount, zero.unit, zero.amountToken],
    ["水", 1, "本", "0本"],
  );
});

test("quickText.parseItem: 先頭の時刻 H:mm / HH:mm を剥がす（範囲外の時刻は剥がさない）", () => {
  const evening = parseItem("21:30 家系ラーメン");
  assert.deepEqual([evening.name, evening.time], ["家系ラーメン", "21:30"]);
  const morning = parseItem("9:05 朝食");
  assert.deepEqual([morning.name, morning.time], ["朝食", "09:05"]);
  // 時刻だけの入力は名前が空になるので、そのまま名前に残る（時刻は読み取られる）
  const only = parseItem("21:30");
  assert.deepEqual([only.name, only.time], ["21:30", "21:30"]);
  // 24 時は時刻と読まない。残った文字から先頭の数字が数量として剥がされる（今の出力）
  const invalid = parseItem("24:00 foo");
  assert.deepEqual(
    [invalid.name, invalid.time, invalid.amount, invalid.amountToken],
    [":00 foo", null, 24, "24"],
  );
});

test("quickText.parseItem: NFKC で半角カナ・全角を揃え、前後の空白は raw から落とす", () => {
  assert.equal(parseItem("  納豆  ").raw, "納豆");
  assert.equal(parseItem("ｻﾊﾞ 2ｷﾚ").raw, "サバ 2キレ");
  // 半角の「ｷﾚ」は単位として拾わない（NFKC 後の「キレ」は単位表に無い）
  assert.equal(parseItem("ｻﾊﾞ 2ｷﾚ").unit, null);
});

/* ------------------------------------------------------------------ */
/* 栄養値の付記                                                          */
/* ------------------------------------------------------------------ */

test("quickText.parseNutritionText: kcal / P / 脂質 / 炭水化物 / 塩分 の順。足りない要素と - は null", () => {
  assert.deepEqual(parseNutritionText("=252/3.8/0.5/55.7/0"), {
    kcal: 252,
    proteinG: 3.8,
    fatG: 0.5,
    carbG: 55.7,
    saltG: 0,
  });
  assert.deepEqual(parseNutritionText("=252/3.8/-"), {
    kcal: 252,
    proteinG: 3.8,
    fatG: null,
    carbG: null,
    saltG: null,
  });
  assert.deepEqual(parseNutritionText("=-"), nutrition());
  assert.deepEqual(parseNutritionText("=100"), nutrition({ kcal: 100 }));
  assert.deepEqual(
    parseNutritionText("252/3.8"),
    nutrition({ kcal: 252, proteinG: 3.8 }),
  );
  assert.deepEqual(
    parseNutritionText("= 100 / 5 /  / 1"),
    nutrition({ kcal: 100, proteinG: 5, carbG: 1 }),
  );
  assert.deepEqual(parseNutritionText("=abc/1"), nutrition({ proteinG: 1 }));
});

/* ------------------------------------------------------------------ */
/* 日付行                                                               */
/* ------------------------------------------------------------------ */

test("quickText.parseDateLine: 日付だけの行を論理日付にする（年なしは未来にならない直近の年）", () => {
  const today = "2026-09-22";
  assert.equal(parseDateLine("2026/09/22", today), "2026-09-22");
  assert.equal(parseDateLine("2026-09-22", today), "2026-09-22");
  assert.equal(parseDateLine("2026.9.2", today), "2026-09-02");
  assert.equal(parseDateLine("2025年1月2日", today), "2025-01-02");
  assert.equal(parseDateLine("9/22", today), "2026-09-22");
  assert.equal(parseDateLine("9月22日", today), "2026-09-22");
  assert.equal(parseDateLine("9.22", today), "2026-09-22");
  // 末尾の曜日は付いていてもよい
  assert.equal(parseDateLine("9/22(月)", today), "2026-09-22");
  assert.equal(parseDateLine("9/22 月曜", today), "2026-09-22");
  // 今日より後の月日は去年にする
  assert.equal(parseDateLine("9/23", today), "2025-09-23");
  assert.equal(parseDateLine("12/31", today), "2025-12-31");
  // 全角は NFKC で揃えてから読む
  assert.equal(parseDateLine("１０／５", today), "2025-10-05");
});

test("quickText.parseDateLine: 日付でない行・範囲外の月日は null", () => {
  const today = "2026-09-22";
  assert.equal(parseDateLine("9/22 ご飯", today), null);
  assert.equal(parseDateLine("ご飯", today), null);
  assert.equal(parseDateLine("13/1", today), null);
  assert.equal(parseDateLine("0/5", today), null);
  assert.equal(parseDateLine("9/32", today), null);
});

/* ------------------------------------------------------------------ */
/* 行 → 項目                                                           */
/* ------------------------------------------------------------------ */

test("quickText.parseItems: / 、 , ・ ＋ と改行で項目に割る", () => {
  const today = "2026-09-22";
  assert.deepEqual(
    parseItems("ザバス2本 / ワイルドステーキ300g", today).map((item) => [
      item.raw,
      item.name,
      item.amount,
      item.unit,
    ]),
    [
      ["ザバス2本", "ザバス", 2, "本"],
      ["ワイルドステーキ300g", "ワイルドステーキ", 300, "g"],
    ],
  );
  assert.deepEqual(
    parseItems("卵2個、納豆, 味噌汁・ご飯＋サラダ", today).map(
      (item) => item.raw,
    ),
    ["卵2個", "納豆", "味噌汁", "ご飯", "サラダ"],
  );
});

test("quickText.parseItems: 行頭の飾りと ``` の行と空行を落とす", () => {
  const items = parseItems(
    "- ご飯 1杯\n* 焼き鮭\n・納豆\n# 見出し\n> 引用\n\n```\nコード\n```",
    "2026-09-22",
  );
  assert.deepEqual(
    items.map((item) => item.raw),
    ["ご飯 1杯", "焼き鮭", "納豆", "見出し", "引用", "コード"],
  );
  assert.deepEqual(parseItems("", "2026-09-22"), []);
  assert.deepEqual(parseItems("- \n* \n", "2026-09-22"), []);
});

test("quickText.parseItems: 日付行は以降の項目の論理日付になる", () => {
  const items = parseItems(
    "9/21\n朝食 卵2個\n9/22 月曜\n昼食\n2026/09/20\nご飯",
    "2026-09-22",
  );
  assert.deepEqual(
    items.map((item) => [item.raw, item.logDate]),
    [
      ["朝食 卵2個", "2026-09-21"],
      ["昼食", "2026-09-22"],
      ["ご飯", "2026-09-20"],
    ],
  );
});

test("quickText.parseItems: 栄養値の付記は値の中の / を区切りと取り違えずに項目へ付く", () => {
  const items = parseItems(
    "ご飯 1杯=252/3.8/0.5/55.7/0 / 卵2個\n焼き鮭 2切れ=266/44/9/0.2/1.6",
    "2026-09-22",
  );
  assert.deepEqual(
    items.map((item) => [item.raw, item.name, item.amount, item.unit]),
    [
      ["ご飯 1杯=252/3.8/0.5/55.7/0", "ご飯", 1, "杯"],
      ["卵2個", "卵", 2, "個"],
      ["焼き鮭 2切れ=266/44/9/0.2/1.6", "焼き鮭", 2, "切れ"],
    ],
  );
  assert.deepEqual(items[0].inlineNutrition, {
    kcal: 252,
    proteinG: 3.8,
    fatG: 0.5,
    carbG: 55.7,
    saltG: 0,
  });
  assert.equal(items[1].inlineNutrition, null);
  assert.deepEqual(items[2].inlineNutrition, {
    kcal: 266,
    proteinG: 44,
    fatG: 9,
    carbG: 0.2,
    saltG: 1.6,
  });

  const dash = parseItems("味付ゆで玉子 2個=130/11.6/8.6/-/1.2", "2026-09-22");
  assert.deepEqual(dash[0].inlineNutrition, {
    kcal: 130,
    proteinG: 11.6,
    fatG: 8.6,
    carbG: null,
    saltG: 1.2,
  });
});

/* ------------------------------------------------------------------ */
/* 照合                                                                 */
/* ------------------------------------------------------------------ */

test("quickText.scoreFood: 名前 100 > 呼び名 90 > 食べ方 85 > 名前に含まれる 70 > … > カテゴリ 30", () => {
  const [zavas, , cupSoup, , , , bLegend, boiledEgg] = catalogFixture();
  assert.deepEqual(scoreFood(zavas, normalize("ザバス")), {
    score: 90,
    reason: "呼び名が一致",
  });
  // ひらがなでもカタカナの呼び名に当たる
  assert.deepEqual(scoreFood(zavas, normalize("ざばす")), {
    score: 90,
    reason: "呼び名が一致",
  });
  assert.deepEqual(scoreFood(zavas, normalize("プロテイン")), {
    score: 40,
    reason: "カテゴリが一致",
  });
  assert.deepEqual(scoreFood(cupSoup, normalize("スープ残し")), {
    score: 85,
    reason: "食べ方の名前が一致",
  });
  assert.deepEqual(scoreFood(cupSoup, normalize("スープ")), {
    score: 55,
    reason: "食べ方の名前が部分一致",
  });
  assert.deepEqual(scoreFood(cupSoup, normalize("カップヌードル")), {
    score: 70,
    reason: "名前に含まれる",
  });
  assert.deepEqual(scoreFood(boiledEgg, normalize("卵")), {
    score: 60,
    reason: "呼び名が部分一致",
  });
  assert.deepEqual(scoreFood(boiledEgg, normalize("玉子")), {
    score: 70,
    reason: "名前に含まれる",
  });
  // 在庫切れ（archived）は −25 して理由に印を付ける。候補からは消さない
  assert.deepEqual(scoreFood(bLegend, normalize("ビーレジェンド")), {
    score: 75,
    reason: "名前が一致・在庫切れ",
  });
  assert.deepEqual(scoreFood(bLegend, normalize("プロテイン")), {
    score: 15,
    reason: "カテゴリが一致・在庫切れ",
  });
});

test("quickText.scoreFood: 何にも当たらない・キーが空なら 0", () => {
  const [zavas] = catalogFixture();
  assert.deepEqual(scoreFood(zavas, normalize("存在しない")), {
    score: 0,
    reason: "",
  });
  assert.deepEqual(scoreFood(zavas, ""), { score: 0, reason: "" });
  assert.deepEqual(scoreFood(zavas, normalize("ビーレジェンド")), {
    score: 0,
    reason: "",
  });
});

test("quickText.scoreFood: 在庫切れでも当たらなければ 0 のまま（−25 で負にしない）", () => {
  const archived = foodFixture({ name: "終売品", archived: true });
  assert.deepEqual(scoreFood(archived, normalize("まったく別")), {
    score: 0,
    reason: "",
  });
});

test("quickText.groupKeyOf: バリアントは variantGroupId、単独商品は food-<id>", () => {
  assert.deepEqual(
    catalogFixture().map((food) => groupKeyOf(food)),
    [
      "food-1",
      "food-2",
      "cupnoodle-big",
      "cupnoodle-big",
      "marugame",
      "marugame",
      "food-7",
      "food-8",
      "food-9",
      "food-10",
      "food-11",
      "food-12",
    ],
  );
});

test("quickText.sortVariants: 使用回数の多い順 → 塩分の低い順（未確認は最後）→ バリアント名", () => {
  const catalog = catalogFixture();
  // 使用回数が同じなら塩分の低い「スープ残し」が先頭（汁を残す側が既定）
  assert.deepEqual(
    sortVariants([catalog[3], catalog[2]]).map((food) => food.id),
    [3, 4],
  );
  assert.deepEqual(
    sortVariants([catalog[5], catalog[4]]).map((food) => food.id),
    [5, 6],
  );
  const tie = [
    foodFixture({
      id: 21,
      useCount: 2,
      per: nutrition({ saltG: null }),
      variantLabel: "あ",
    }),
    foodFixture({
      id: 22,
      useCount: 2,
      per: nutrition({ saltG: 1 }),
      variantLabel: "い",
    }),
    foodFixture({
      id: 23,
      useCount: 2,
      per: nutrition({ saltG: 1 }),
      variantLabel: "あ",
    }),
    foodFixture({
      id: 24,
      useCount: 3,
      per: nutrition({ saltG: 9 }),
      variantLabel: null,
    }),
  ];
  assert.deepEqual(
    sortVariants(tie).map((food) => food.id),
    [24, 23, 22, 21],
  );
  // 元の配列は並べ替えない
  assert.deepEqual(
    tie.map((food) => food.id),
    [21, 22, 23, 24],
  );
});

test("quickText.findCandidates: スコア順。バリアントは束ね、片方だけ当たっても兄弟を全部集める", () => {
  const catalog = catalogFixture();
  const slim = (name: string) =>
    findCandidates(name, catalog).map((candidate) => ({
      key: candidate.key,
      name: candidate.name,
      ids: candidate.foods.map((food) => food.id),
      score: candidate.score,
      reason: candidate.reason,
    }));

  assert.deepEqual(slim("ザバス"), [
    {
      key: "food-1",
      name: "ザバス MILK PROTEIN",
      ids: [1],
      score: 90,
      reason: "呼び名が一致",
    },
    {
      key: "food-2",
      name: "ザバス ヨーグルト（マンゴー）",
      ids: [2],
      score: 70,
      reason: "名前に含まれる",
    },
  ]);
  assert.deepEqual(slim("カップヌードル"), [
    {
      key: "cupnoodle-big",
      name: "カップヌードル BIG",
      ids: [3, 4],
      score: 70,
      reason: "名前に含まれる",
    },
  ]);
  // 食べ方の名前に当たったのは 1 つでも、束ねた候補は兄弟 2 つを持つ
  assert.deepEqual(slim("スープ残し"), [
    {
      key: "cupnoodle-big",
      name: "カップヌードル BIG",
      ids: [3, 4],
      score: 85,
      reason: "食べ方の名前が一致",
    },
  ]);
  assert.deepEqual(slim("プロテイン"), [
    {
      key: "food-1",
      name: "ザバス MILK PROTEIN",
      ids: [1],
      score: 40,
      reason: "カテゴリが一致",
    },
    {
      key: "food-7",
      name: "ビーレジェンド",
      ids: [7],
      score: 15,
      reason: "カテゴリが一致・在庫切れ",
    },
  ]);
  assert.deepEqual(slim("めん"), []);
  assert.deepEqual(slim("xyz"), []);
  assert.deepEqual(slim(""), []);
});

test("quickText.findCandidates: 同点は使用回数の多い順 → 名前順（ja）", () => {
  const catalog = catalogFixture();
  assert.deepEqual(
    findCandidates("ヨーグルト", catalog).map((candidate) => [
      candidate.key,
      candidate.score,
    ]),
    [
      ["food-2", 70],
      ["food-12", 70],
      ["food-11", 70],
    ],
  );
});

/* ------------------------------------------------------------------ */
/* 1 項目の解決                                                          */
/* ------------------------------------------------------------------ */

test("quickText.resolveItem / interpret: 確定・候補を選ぶ・推定・見つからない", () => {
  const catalog = catalogFixture();
  const slim = (text: string) =>
    interpret(text, catalog, "2026-09-22").map((resolution) => ({
      status: resolution.status,
      foodId: resolution.food?.id ?? null,
      candidates: resolution.candidates.map(
        (candidate) => `${candidate.key}:${candidate.score}`,
      ),
    }));

  // 最上位が 2 位より厳密に強い → 確定（既定のバリアントが先頭）
  assert.deepEqual(slim("ザバス2本"), [
    {
      status: "confirmed",
      foodId: 1,
      candidates: ["food-1:90", "food-2:70"],
    },
  ]);
  assert.deepEqual(slim("カップヌードル"), [
    { status: "confirmed", foodId: 3, candidates: ["cupnoodle-big:70"] },
  ]);
  // 在庫切れだけが当たった場合も確定する（候補からは消さない）
  assert.deepEqual(slim("ビーレジェンド"), [
    { status: "confirmed", foodId: 7, candidates: ["food-7:75"] },
  ]);
  // 同点が並ぶ → 候補を選ぶ（決め打ちしない）
  assert.deepEqual(slim("ヨーグルト"), [
    {
      status: "ambiguous",
      foodId: null,
      candidates: ["food-2:70", "food-12:70", "food-11:70"],
    },
  ]);
  // 栄養値が書いてあれば、同点でも当たらなくても「推定」
  assert.deepEqual(slim("ヨーグルト=100/10/1/5/0.1"), [
    {
      status: "estimated",
      foodId: null,
      candidates: ["food-2:70", "food-12:70", "food-11:70"],
    },
  ]);
  assert.deepEqual(slim("謎の品=200/-/-/-/-"), [
    { status: "estimated", foodId: null, candidates: [] },
  ]);
  // 当たらず値も無い → 見つからない
  assert.deepEqual(slim("謎の品"), [
    { status: "missing", foodId: null, candidates: [] },
  ]);
});

test("quickText.resolveItem: マスタに当たったら貼った値ではなくマスタの食品を使う", () => {
  const catalog = catalogFixture();
  const parsed = parseItem("ザバス 1本=999/1/1/1/1");
  const resolution = resolveItem(
    { ...parsed, inlineNutrition: nutrition({ kcal: 999 }) },
    catalog,
  );
  assert.equal(resolution.status, "confirmed");
  assert.equal(resolution.food?.id, 1);
});

/* ------------------------------------------------------------------ */
/* 数量の決定                                                            */
/* ------------------------------------------------------------------ */

test("quickText.quantityFor: 数えられる単位はそのまま、g / ml は gramsPerUnit で割る", () => {
  const catalog = catalogFixture();
  const [zavas, , , , , , bLegend, boiledEgg, , macadamia] = catalog;

  assert.deepEqual(quantityFor(parseItem("ザバス2本"), zavas), {
    quantity: 2,
    notes: [],
  });
  assert.deepEqual(quantityFor(parseItem("卵 3つ"), boiledEgg), {
    quantity: 3,
    notes: [],
  });
  // マカダミア 30g は 10g 単位 × 3
  assert.deepEqual(quantityFor(parseItem("マカダミア30g"), macadamia), {
    quantity: 3,
    notes: [],
  });
  assert.deepEqual(quantityFor(parseItem("マカダミア5g"), macadamia), {
    quantity: 0.5,
    notes: [],
  });
  assert.deepEqual(quantityFor(parseItem("ご飯 100g"), bLegend), {
    quantity: 2.5,
    notes: [],
  });
  assert.deepEqual(quantityFor(parseItem("牛乳 250ml"), macadamia), {
    quantity: 25,
    notes: [],
  });
});

test("quickText.quantityFor: g 換算できない食品は 1 単位として扱い、そう書く", () => {
  const [zavas] = catalogFixture();
  assert.deepEqual(quantityFor(parseItem("マカダミア30g"), zavas), {
    quantity: 1,
    notes: ["g 換算できないので1単位として扱いました"],
  });
  assert.deepEqual(
    quantityFor(parseItem("牛乳 200ml"), foodFixture({ gramsPerUnit: 0 })),
    { quantity: 1, notes: ["g 換算できないので1単位として扱いました"] },
  );
  // 換算して 0 に丸まるときは 1 に戻す（notes は付かない）
  assert.deepEqual(
    quantityFor(parseItem("牛乳 1g"), foodFixture({ gramsPerUnit: 1000 })),
    { quantity: 1, notes: [] },
  );
});

test("quickText.quantityFor: 数量トークンが商品名・単位ラベルの一部なら数量は 1 に戻す", () => {
  const catalog = catalogFixture();
  const marugame = catalog[4];
  assert.deepEqual(
    quantityFor(parseItem("丸亀旨辛豚つけ汁うどん3玉"), marugame),
    {
      quantity: 1,
      notes: ["「3玉」は商品名の一部として扱いました"],
    },
  );
  // 数量 1 のときは判定しない
  assert.deepEqual(
    quantityFor(parseItem("カップヌードル BIG 1個"), catalog[2]),
    {
      quantity: 1,
      notes: [],
    },
  );
});

test("quickText.ARCHIVED_PENALTY: 在庫切れの減点は 25。scoreFood で引いた分を写真の照合（matchFood）が戻す", () => {
  assert.equal(ARCHIVED_PENALTY, 25);
  const [, , , , , , bLegend] = catalogFixture();
  const archived = scoreFood(bLegend, normalize("ビーレジェンド"));
  const live = scoreFood(
    foodFixture({ name: bLegend.name, archived: false }),
    normalize("ビーレジェンド"),
  );
  assert.equal(live.score - archived.score, ARCHIVED_PENALTY);
});
