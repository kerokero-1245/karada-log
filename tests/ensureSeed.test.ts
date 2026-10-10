/**
 * 初期データ投入を「アプリの起動につき 1 回だけ」にする仕組み（lib/ensureSeed.ts）の今の出力を固定する特性テスト。
 *
 * React の StrictMode は開発時に effect を 2 回走らせる。同時に 2 本走ると両方が「まだ空」と判断して
 * 二重投入になりうるので、Promise を共有して直列化する。失敗したら次の呼び出しでやり直せる。
 * Node には IndexedDB が無いので、設定の読み出しと件数を数える表を差し替える。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";
import { fakeTable } from "./fakeTable.ts";
import { restoreStubs, runScope, settingsFixture, stub } from "./helpers.ts";

afterEach(() => restoreStubs());

/** 起動時に件数を数える表（投入済みの端末では、これを数えるだけで書き込みはしない） */
const COUNTED = [
  "foods",
  "mealEntries",
  "pendingTexts",
  "shortcutSets",
  "exercises",
  "trainingSessions",
  "sessionExercises",
  "setRecords",
  "bodyCompositions",
  "boneDensities",
  "supplements",
] as const;

/** モジュールの状態（共有している Promise）を持ち直すため、別の URL で読み込む */
async function freshEnsureSeed(name: string) {
  const url = new URL(`../src/lib/ensureSeed.ts?${name}`, import.meta.url);
  const loaded: { ensureSeed: () => Promise<unknown> } = await import(url.href);
  return loaded.ensureSeed;
}

test("ensureSeed: 何度呼んでも投入は 1 回だけ（同じ Promise を返す）", async () => {
  stub(db, "transaction", runScope);
  for (const name of COUNTED) fakeTable(db[name]);
  let reads = 0;
  stub(db.settings, "get", async () => {
    reads += 1;
    return settingsFixture({ seedVersion: 2 });
  });

  const ensureSeed = await freshEnsureSeed("once");
  const first = ensureSeed();
  const second = ensureSeed();
  assert.equal(first, second);
  await first;
  await ensureSeed();
  assert.equal(reads, 1);
});

test("ensureSeed: 失敗したら次の呼び出しでやり直せる", async () => {
  stub(db, "transaction", runScope);
  for (const name of COUNTED) fakeTable(db[name]);
  let reads = 0;
  stub(db.settings, "get", async () => {
    reads += 1;
    if (reads === 1) throw new Error("読み出しに失敗");
    return settingsFixture({ seedVersion: 2 });
  });

  const ensureSeed = await freshEnsureSeed("retry");
  await assert.rejects(ensureSeed(), /読み出しに失敗/);
  await ensureSeed();
  assert.equal(reads, 2);
});
