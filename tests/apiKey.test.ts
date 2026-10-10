/**
 * Claude API キーの出し入れ（lib/apiKey.ts）の今の出力を固定する特性テスト。
 *
 * キーは Settings（IndexedDB）の中だけに置く。画面に出すときは末尾 4 文字だけ。
 * 値は架空のサンプル（実在のキーではない）。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";
import {
  apiKeyOf,
  clearApiKey,
  maskApiKey,
  saveApiKey,
} from "../src/lib/apiKey.ts";
import {
  freezeTime,
  restoreStubs,
  settingsFixture,
  stub,
  unfreezeTime,
} from "./helpers.ts";

afterEach(() => {
  restoreStubs();
  unfreezeTime();
});

test("apiKey.apiKeyOf: 未設定・空文字・空白だけはすべて null に寄せ、前後の空白は落とす", () => {
  assert.equal(apiKeyOf(undefined), null);
  assert.equal(apiKeyOf(null), null);
  assert.equal(apiKeyOf(settingsFixture()), null);
  assert.equal(apiKeyOf(settingsFixture({ anthropicApiKey: null })), null);
  assert.equal(apiKeyOf(settingsFixture({ anthropicApiKey: "" })), null);
  assert.equal(apiKeyOf(settingsFixture({ anthropicApiKey: "   " })), null);
  assert.equal(
    apiKeyOf(settingsFixture({ anthropicApiKey: "  sk-ant-test-1234 " })),
    "sk-ant-test-1234",
  );
});

test("apiKey.maskApiKey: 末尾 4 文字だけ見せる", () => {
  assert.equal(maskApiKey("sk-ant-test-1234"), "••••••••1234");
  assert.equal(maskApiKey("abc"), "••••••••abc");
});

test("apiKey.saveApiKey / clearApiKey: Settings の id=1 の行だけを、更新時刻つきで書く", async () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  const updates: unknown[][] = [];
  stub(db.settings, "update", async (...args: unknown[]) => {
    updates.push(args);
    return 1;
  });

  await saveApiKey("  sk-ant-test-1234  ");
  await clearApiKey();
  assert.deepEqual(updates, [
    [1, { anthropicApiKey: "sk-ant-test-1234", updatedAt: "2026-10-11T03:04" }],
    [1, { anthropicApiKey: null, updatedAt: "2026-10-11T03:04" }],
  ]);
});
