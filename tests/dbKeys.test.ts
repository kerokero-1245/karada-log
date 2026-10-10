/**
 * Dexie の add / bulkAdd が返す主キー（db/keys.ts の addedId）。
 *
 * 表の型は主キーを `id?: number` と宣言しているので、add の戻り値の型は number | undefined になる。
 * 自動採番の表は必ず id を返すので、number はそのまま通し、undefined は黙って次へ渡さず止める。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { addedId } from "../src/db/keys.ts";

test("dbKeys.addedId: number はそのまま返す（0 も通す）", () => {
  assert.equal(addedId(1), 1);
  assert.equal(addedId(0), 0);
  assert.equal(addedId(12345), 12345);
});

test("dbKeys.addedId: undefined は日本語のメッセージで止める", () => {
  assert.throws(
    () => addedId(undefined),
    new Error("保存した行の id を取得できませんでした"),
  );
});

test("dbKeys.addedId: bulkAdd(..., { allKeys: true }) の結果は .map(addedId) で number[] にできる", () => {
  const keys: (number | undefined)[] = [3, 4, 5];
  assert.deepEqual(keys.map(addedId), [3, 4, 5]);
  assert.throws(
    () => [3, undefined].map(addedId),
    /保存した行の id を取得できませんでした/,
  );
});
