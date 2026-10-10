/**
 * IndexedDB のスキーマ（lib の外にある保存データの土台）を固定する特性テスト。
 *
 * DB 名・版数・表と索引を変えると、すでに端末に入っているデータの開き方が変わる。
 * Dexie の公開 API（db.name / db.verno / 各表の schema）から読めるものを、そのまま写す。
 * DB は開かない（Node には IndexedDB が無い）ので、宣言した内容を読むだけ。
 * 並びは Dexie が持つ表の順で、版 2 で足した pendingTexts は最後。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";

test("db: データベース名は karada-log、版数は 2", () => {
  assert.equal(db.name, "karada-log");
  assert.equal(db.verno, 2);
});

test("db: 表と主キーと索引（v1 の 12 表 + v2 の pendingTexts と foods.aliases の multiEntry 索引）", () => {
  const schema = db.tables.map((table) => ({
    name: table.name,
    primaryKey: table.schema.primKey.src,
    indexes: table.schema.indexes.map((index) => index.src),
  }));
  assert.deepEqual(schema, [
    {
      name: "foods",
      primaryKey: "++id",
      indexes: ["name", "category", "variantGroupId", "useCount", "*aliases"],
    },
    {
      name: "mealEntries",
      primaryKey: "++id",
      indexes: ["logDate", "recordedAt", "foodId", "[logDate+recordedAt]"],
    },
    { name: "shortcutSets", primaryKey: "++id", indexes: ["order"] },
    { name: "dayMeta", primaryKey: "logDate", indexes: ["dayType"] },
    {
      name: "exercises",
      primaryKey: "++id",
      indexes: ["menu", "[menu+order]", "name"],
    },
    {
      name: "trainingSessions",
      primaryKey: "++id",
      indexes: ["logDate", "startedAt", "menu"],
    },
    {
      name: "sessionExercises",
      primaryKey: "++id",
      indexes: ["sessionId", "exerciseId", "[sessionId+order]"],
    },
    {
      name: "setRecords",
      primaryKey: "++id",
      indexes: ["sessionExerciseId", "[sessionExerciseId+setNo]"],
    },
    {
      name: "bodyCompositions",
      primaryKey: "++id",
      indexes: ["measuredAt", "device", "[device+measuredAt]"],
    },
    {
      name: "boneDensities",
      primaryKey: "++id",
      indexes: ["measuredAt", "device"],
    },
    { name: "supplements", primaryKey: "++id", indexes: ["name"] },
    { name: "settings", primaryKey: "id", indexes: [] },
    {
      name: "pendingTexts",
      primaryKey: "++id",
      indexes: ["logDate", "recordedAt"],
    },
  ]);
});
