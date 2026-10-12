/**
 * 週の起点の言い方（lib/date.ts の weekStartLabel）と、それを使う書き出しの見出し。
 *
 * 「月曜起点」を文言に直書きせず、Settings.weekStartsOn から組む（L-14）。
 * 今の設定値（1 = 月曜）では、今までと同じ「月曜起点」の文字列になる。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekStartLabel } from "../src/lib/date.ts";
import { buildMarkdown } from "../src/lib/exportMarkdown.ts";
import { richExportInput } from "./exportFixtures.ts";
import { settingsFixture } from "./helpers.ts";

test("date.weekStartLabel: 週の起点を曜日名から組む（1 は月曜起点、0 は日曜起点）", () => {
  assert.equal(weekStartLabel(1), "月曜起点");
  assert.equal(weekStartLabel(0), "日曜起点");
  assert.equal(weekStartLabel(6), "土曜起点");
});

test("exportMarkdown: 週合計の見出しは Settings.weekStartsOn から組む（今の設定値 1 では「月曜起点」のまま）", () => {
  const input = richExportInput();
  assert.match(buildMarkdown(input), /^### 週合計（月曜起点）$/m);

  const sunday = { ...input, settings: settingsFixture({ weekStartsOn: 0 }) };
  const markdown = buildMarkdown(sunday);
  assert.match(markdown, /^### 週合計（日曜起点）$/m);
  assert.doesNotMatch(markdown, /月曜起点/);
});
