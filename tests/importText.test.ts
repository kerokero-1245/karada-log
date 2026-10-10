/**
 * 貼り付けテキストの取り込み（lib/importText.ts）の今の出力を固定する特性テスト。
 *
 * 値の扱いは 3 通り: マスタに確定で当たった → マスタの値 / 当たらない・候補が並ぶが値がある → 推定 /
 * 当たらず値も無い → 見つからない。推定食品の下書きは「保存データの形」（キーの順まで）を持つので
 * Object.keys の順も確かめる。時刻は引数 now か freezeTime で固定する。値は架空のサンプル。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IMPORT_TIME,
  buildEntryView,
  estimatedPlanOf,
  parseImport,
} from "../src/lib/importText.ts";
import { interpret, parseItem, parseItems } from "../src/lib/quickText.ts";
import {
  catalogFixture,
  freezeTime,
  nutrition,
  unfreezeTime,
} from "./helpers.ts";

afterEach(() => unfreezeTime());

const NOW = new Date(2026, 8, 22, 21, 5);
const TODAY = "2026-09-22";

/** parseItems で「=kcal/…」付きの 1 行を読む */
function itemOf(line: string) {
  const [item] = parseItems(line, TODAY);
  assert.ok(item, line);
  return item;
}

test("importText: 時刻が書かれていない行の既定は 12:00", () => {
  assert.equal(DEFAULT_IMPORT_TIME, "12:00");
});

test("importText.estimatedPlanOf: 値が無ければ null", () => {
  assert.equal(estimatedPlanOf(parseItem("ご飯 1杯"), NOW), null);
});

test("importText.estimatedPlanOf: 数えられる単位は数量ぶんで割って 1 単位あたりにする", () => {
  const plan = estimatedPlanOf(itemOf("焼き鮭 2切れ=266/44/9/0.2/1.6"), NOW);
  assert.deepEqual(plan, {
    quantity: 2,
    per: { kcal: 133, proteinG: 22, fatG: 4.5, carbG: 0.1, saltG: 0.8 },
    unitLabel: "1切れ",
    draft: {
      name: "焼き鮭",
      unitLabel: "1切れ",
      gramsPerUnit: null,
      per: { kcal: 133, proteinG: 22, fatG: 4.5, carbG: 0.1, saltG: 0.8 },
      source: "estimated",
      basis: { label: "貼り付けの値（1単位あたり）", unitsPerBasis: 1 },
      category: "魚",
      note: "貼り付けから推定 2026-09-22",
      aliases: [],
      variantGroupId: null,
      variantLabel: null,
      useCount: 0,
      lastUsedAt: null,
      archived: false,
      createdAt: "2026-09-22T21:05",
      updatedAt: "2026-09-22T21:05",
    },
  });
});

test("importText.estimatedPlanOf: 下書きのキーの順は Food の保存形のまま（id なし）", () => {
  const plan = estimatedPlanOf(itemOf("ご飯 1杯=252/3.8/0.5/55.7/0"), NOW);
  assert.ok(plan);
  assert.deepEqual(Object.keys(plan), [
    "quantity",
    "per",
    "unitLabel",
    "draft",
  ]);
  assert.deepEqual(Object.keys(plan.draft), [
    "name",
    "unitLabel",
    "gramsPerUnit",
    "per",
    "source",
    "basis",
    "category",
    "note",
    "aliases",
    "variantGroupId",
    "variantLabel",
    "useCount",
    "lastUsedAt",
    "archived",
    "createdAt",
    "updatedAt",
  ]);
  assert.equal(plan.draft.category, "主食");
  assert.deepEqual(plan.per, {
    kcal: 252,
    proteinG: 3.8,
    fatG: 0.5,
    carbG: 55.7,
    saltG: 0,
  });
});

test("importText.estimatedPlanOf: g / ml 指定は「その量で 1 単位」（数量は 1、gramsPerUnit に量が入る）", () => {
  const steak = estimatedPlanOf(
    itemOf("ワイルドステーキ 300g=800/60/50/0/3"),
    NOW,
  );
  assert.ok(steak);
  assert.equal(steak.quantity, 1);
  assert.equal(steak.unitLabel, "300g");
  assert.equal(steak.draft.gramsPerUnit, 300);
  assert.equal(steak.draft.category, "肉");
  assert.deepEqual(
    steak.per,
    nutrition({ kcal: 800, proteinG: 60, fatG: 50, carbG: 0, saltG: 3 }),
  );

  const juice = estimatedPlanOf(itemOf("ジュース 250ml=100/0/0/25/0"), NOW);
  assert.ok(juice);
  assert.equal(juice.unitLabel, "250ml");
  assert.equal(juice.draft.gramsPerUnit, 250);
  assert.equal(juice.draft.category, "飲料");
});

test("importText.estimatedPlanOf: 単位が無ければ 1個、カテゴリは名前から推定し、無ければ その他", () => {
  const ramen = estimatedPlanOf(itemOf("謎のラーメン=700/20/20/90/6"), NOW);
  assert.ok(ramen);
  assert.equal(ramen.unitLabel, "1個");
  assert.equal(ramen.draft.category, "麺類");

  const kcalOnly = estimatedPlanOf(itemOf("鶏の唐揚げ=300"), NOW);
  assert.ok(kcalOnly);
  assert.deepEqual(kcalOnly.per, nutrition({ kcal: 300 }));
  assert.equal(kcalOnly.draft.category, "肉");

  // 単位として読めない「束」は名前の一部のまま。カテゴリは当たらない
  const spinach = estimatedPlanOf(itemOf("ほうれん草 0.5束=10/1/0/1/0.1"), NOW);
  assert.ok(spinach);
  assert.equal(spinach.draft.name, "ほうれん草 0.5束");
  assert.equal(spinach.draft.category, "その他");
});

test("importText.parseImport: 日付ごとにまとめて古い日から並べる。時刻の既定は 12:00", () => {
  const text =
    "9/21\n12:30 ご飯 1杯=252/3.8/0.5/55.7/0\n卵2個\n9/22\n21:00 謎の品\nザバス\n9/20\n間食=100";
  const parsed = parseImport(text, catalogFixture(), TODAY);
  assert.equal(parsed.usedToday, false);
  assert.equal(parsed.rows.length, 5);
  assert.deepEqual(
    parsed.days.map((day) => ({
      logDate: day.logDate,
      rows: day.rows.map((row) => ({
        index: row.index,
        raw: row.resolution.parsed.raw,
        status: row.resolution.status,
        logDate: row.logDate,
        time: row.time,
        timeMissing: row.timeMissing,
      })),
    })),
    [
      {
        logDate: "2026-09-20",
        rows: [
          {
            index: 4,
            raw: "間食=100",
            status: "estimated",
            logDate: "2026-09-20",
            time: "12:00",
            timeMissing: true,
          },
        ],
      },
      {
        logDate: "2026-09-21",
        rows: [
          {
            index: 0,
            raw: "12:30 ご飯 1杯=252/3.8/0.5/55.7/0",
            status: "estimated",
            logDate: "2026-09-21",
            time: "12:30",
            timeMissing: false,
          },
          {
            index: 1,
            raw: "卵2個",
            status: "confirmed",
            logDate: "2026-09-21",
            time: "12:00",
            timeMissing: true,
          },
        ],
      },
      {
        logDate: "2026-09-22",
        rows: [
          {
            index: 2,
            raw: "21:00 謎の品",
            status: "missing",
            logDate: "2026-09-22",
            time: "21:00",
            timeMissing: false,
          },
          {
            index: 3,
            raw: "ザバス",
            status: "confirmed",
            logDate: "2026-09-22",
            time: "12:00",
            timeMissing: true,
          },
        ],
      },
    ],
  );
});

test("importText.parseImport: 日付行が 1 つも無ければ全部を今日として読む。空なら何も無い", () => {
  const noDates = parseImport("ご飯\n卵", catalogFixture(), TODAY);
  assert.equal(noDates.usedToday, true);
  assert.deepEqual(
    noDates.days.map((day) => [day.logDate, day.rows.length]),
    [[TODAY, 2]],
  );
  assert.deepEqual(parseImport("", catalogFixture(), TODAY), {
    days: [],
    rows: [],
    usedToday: false,
  });
});

test("importText.buildEntryView: マスタに当たった行はマスタの値。貼った値があれば usesMasterValues", () => {
  const catalog = catalogFixture();
  const [plain] = interpret("ザバス2本", catalog, TODAY);
  const view = buildEntryView(plain, null, false);
  assert.equal(view.food?.id, 1);
  assert.equal(view.estimated, null);
  assert.equal(view.quantity, 2);
  assert.deepEqual(view.per, catalog[0].per);
  assert.equal(view.unitLabel, "1本(240ml)");
  assert.deepEqual(view.notes, []);
  assert.equal(view.usesMasterValues, false);
  assert.equal(view.status, "confirmed");
  assert.equal(view.manual, false);

  const [withValues] = interpret("ザバス2本=999/9/9/9/9", catalog, TODAY);
  const masterView = buildEntryView(withValues, null, false);
  assert.equal(masterView.usesMasterValues, true);
  assert.deepEqual(masterView.per, catalog[0].per);
});

test("importText.buildEntryView: 同点で候補が並ぶ行は、手で選ぶまで空の値（ambiguous）", () => {
  const catalog = catalogFixture();
  const [resolution] = interpret("ヨーグルト", catalog, TODAY);
  const unpicked = buildEntryView(resolution, null, false);
  assert.equal(unpicked.food, null);
  assert.equal(unpicked.estimated, null);
  assert.equal(unpicked.quantity, 1);
  assert.deepEqual(unpicked.per, nutrition());
  assert.equal(unpicked.unitLabel, "");
  assert.equal(unpicked.status, "ambiguous");
  assert.equal(unpicked.manual, false);

  // 候補から選ぶと確定扱い。manual は呼び名を覚える対象かどうかの印
  const picked = buildEntryView(resolution, catalog[10], true);
  assert.equal(picked.food?.id, 11);
  assert.equal(picked.status, "confirmed");
  assert.equal(picked.manual, true);
  assert.deepEqual(picked.per, catalog[10].per);
});

test("importText.buildEntryView: 当たらないが値のある行は推定。値も無ければ見つからない", () => {
  freezeTime(NOW);
  const catalog = catalogFixture();

  const [estimated] = interpret("謎の品=200/10/5/20/1", catalog, TODAY);
  const estimatedView = buildEntryView(estimated, null, false);
  assert.equal(estimatedView.food, null);
  assert.equal(estimatedView.status, "estimated");
  assert.equal(estimatedView.manual, false);
  assert.equal(estimatedView.usesMasterValues, false);
  assert.deepEqual(estimatedView.per, {
    kcal: 200,
    proteinG: 10,
    fatG: 5,
    carbG: 20,
    saltG: 1,
  });
  assert.equal(estimatedView.unitLabel, "1個");
  assert.equal(estimatedView.estimated?.draft.createdAt, "2026-09-22T21:05");
  assert.equal(
    estimatedView.estimated?.draft.note,
    "貼り付けから推定 2026-09-22",
  );

  const [missing] = interpret("謎の品", catalog, TODAY);
  // 手で選んだ印（manual）を渡しても、見つからない行は false のまま
  for (const manual of [false, true]) {
    const missingView = buildEntryView(missing, null, manual);
    assert.deepEqual(missingView, {
      food: null,
      estimated: null,
      quantity: 1,
      per: nutrition(),
      unitLabel: "",
      notes: [],
      usesMasterValues: false,
      status: "missing",
      manual: false,
    });
  }
});
