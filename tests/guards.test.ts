/**
 * 型ガード（lib/guards.ts の isPlainObject）。
 *
 * JSON.parse の結果などの unknown を、オブジェクトかどうかで絞る。null と配列はオブジェクトに含めない。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlainObject } from "../src/lib/guards.ts";

test("guards.isPlainObject: {} とキーのあるオブジェクトは true", () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject({ a: 1 }), true);
  assert.equal(isPlainObject(Object.create(null)), true);
  assert.equal(isPlainObject(JSON.parse('{"app":"karada-log"}')), true);
});

test("guards.isPlainObject: null・配列・プリミティブ・undefined は false", () => {
  for (const value of [null, [], [1], "x", "", 0, 1, true, false, undefined]) {
    assert.equal(isPlainObject(value), false, String(value));
  }
});

test("guards.isPlainObject: true のとき Record<string, unknown> として読める（型の絞り込み）", () => {
  const value: unknown = JSON.parse('{"tables":{"foods":[]}}');
  if (!isPlainObject(value)) assert.fail("オブジェクトのはず");
  const tables: unknown = value.tables;
  assert.equal(isPlainObject(tables), true);
});
