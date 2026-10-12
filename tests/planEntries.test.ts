/**
 * 「記録する行」と「未処理で預ける行」の振り分け（lib/importText.ts の planEntries）。
 *
 * 原則1: マスタの食品も推定の下書きも無い項目は、栄養値を付けずに原文のまま預ける。
 * 預ける理由の文字列（PendingText.reason）は保存される。テキスト記録シートと取り込みシートで同じ振り分けを使う。
 * 値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEntryView, planEntries } from "../src/lib/importText.ts";
import type { PlanItem } from "../src/lib/importText.ts";
import { interpret } from "../src/lib/quickText.ts";
import { catalogFixture } from "./helpers.ts";

const TODAY = "2026-10-11";

function itemsOf(
  text: string,
  pickedIndex?: number,
  picked = catalogFixture()[0],
): PlanItem[] {
  const foods = catalogFixture();
  return interpret(text, foods, TODAY).map((resolution, index) => ({
    parsed: resolution.parsed,
    view: buildEntryView(
      resolution,
      index === pickedIndex ? picked : null,
      index === pickedIndex,
    ),
    time: resolution.parsed.time ?? "12:00",
  }));
}

test("importText.planEntries: 確定・推定は記録する行に、見つからない・候補を選べていないものは預ける行に振り分ける（並びは項目のまま）", () => {
  const { entries, pending } = planEntries(
    itemsOf(
      "ザバス2本 / 謎の品 2個=-/10/-/20/0.5 / ほげふが / ヨーグルト / 21:30 卵",
    ),
  );
  assert.deepEqual(
    entries.map((entry) => ({
      raw: entry.raw,
      food: entry.food?.name ?? null,
      draft: entry.draft?.name ?? null,
      quantity: entry.quantity,
      time: entry.time,
      manual: entry.manual,
      learnText: entry.learnText,
    })),
    [
      {
        raw: "ザバス2本",
        food: "ザバス MILK PROTEIN",
        draft: null,
        quantity: 2,
        time: "12:00",
        manual: false,
        learnText: "ザバス",
      },
      {
        raw: "謎の品 2個=-/10/-/20/0.5",
        food: null,
        draft: "謎の品",
        quantity: 2,
        time: "12:00",
        manual: false,
        learnText: "謎の品",
      },
      {
        raw: "21:30 卵",
        food: "味付ゆで玉子",
        draft: null,
        quantity: 1,
        time: "21:30",
        manual: false,
        learnText: "卵",
      },
    ],
  );
  assert.deepEqual(pending, [
    { raw: "ほげふが", reason: "見つかりませんでした", time: "12:00" },
    { raw: "ヨーグルト", reason: "候補から選べていません", time: "12:00" },
  ]);
});

test("importText.planEntries: 手で選んだ食品は manual: true で記録する行になる（候補が並んでいた項目でも）", () => {
  const items = itemsOf("ヨーグルト", 0, catalogFixture()[10]);
  const { entries, pending } = planEntries(items);
  assert.equal(pending.length, 0);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].manual, true);
  assert.equal(entries[0].food?.id, 11);
  assert.equal(entries[0].learnText, "ヨーグルト");
});

test("importText.planEntries: 時刻は項目ごとに渡したものをそのまま使う。空の入力は空の結果", () => {
  const items = itemsOf("ザバス / ほげふが").map((item, index) => ({
    ...item,
    time: index === 0 ? "08:15" : "23:50",
  }));
  const { entries, pending } = planEntries(items);
  assert.deepEqual(
    entries.map((entry) => entry.time),
    ["08:15"],
  );
  assert.deepEqual(
    pending.map((item) => item.time),
    ["23:50"],
  );
  assert.deepEqual(planEntries([]), { entries: [], pending: [] });
});
