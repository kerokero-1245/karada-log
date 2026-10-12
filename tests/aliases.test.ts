/**
 * 食品の呼び名（lib/aliases.ts）の今の出力を固定する特性テスト。
 *
 * 学習のルール: 自動では増やさない / 他の食品の名前・呼び名と正規化キーが衝突するものは覚えない /
 * 既存の呼び名は消さない。値は架空のサンプル。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alreadyKnown,
  aliasesOf,
  canLearnAlias,
  mergeAliases,
} from "../src/lib/aliases.ts";
import { catalogFixture, foodFixture } from "./helpers.ts";

test("aliases.aliasesOf: 呼び名を返す。aliases を持たない古い記録でも空配列", () => {
  const [zavas] = catalogFixture();
  assert.deepEqual(aliasesOf(zavas), ["ザバス", "ザバスミルク"]);
  // 旧バージョンのレコード（aliases を持たない）。型の上では Food ではないが、実体はこの形で残っている
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- aliases を rest で落として、旧レコードの形を作るために分割している
  const { aliases: _unused, ...legacy } = foodFixture();
  assert.equal("aliases" in legacy, false);
  // @ts-expect-error aliases の無い旧レコードを、わざと渡す
  assert.deepEqual(aliasesOf(legacy), []);
});

test("aliases.mergeAliases: 既存を残したまま足す。正規化キーが同じもの・空は足さない", () => {
  assert.deepEqual(
    mergeAliases(
      ["ザバス"],
      ["ざばす", "  新しい  ", "", " ", "ＺＡＶＡＳ", "ZAVAS", "zavas"],
    ),
    ["ザバス", "新しい", "ＺＡＶＡＳ"],
  );
  // 渡した配列は書き換えない
  const current = ["ザバス"];
  mergeAliases(current, ["新しい"]);
  assert.deepEqual(current, ["ザバス"]);
});

test("aliases.canLearnAlias: 他の食品の名前・呼び名とぶつかるなら覚えない", () => {
  const catalog = catalogFixture();
  assert.equal(canLearnAlias("ミルプロ", 1, catalog), true);
  // 自分自身の呼び名とは衝突しない
  assert.equal(canLearnAlias("ザバス", 1, catalog), true);
  // 他の食品の名前
  assert.equal(canLearnAlias("ビーレジェンド", 1, catalog), false);
  // 他の食品の呼び名（ひらがなでも同じキー）
  assert.equal(canLearnAlias("ゆで卵", 1, catalog), false);
  assert.equal(canLearnAlias("ゆでたまご", 1, catalog), false);
  // 空は覚えない
  assert.equal(canLearnAlias("  ", 1, catalog), false);
});

test("aliases.alreadyKnown: 名前そのもの・登録済みの呼び名・空なら覚える必要がない", () => {
  const [zavas] = catalogFixture();
  assert.equal(alreadyKnown("ざばす milk protein", zavas), true);
  assert.equal(alreadyKnown("ザバス", zavas), true);
  assert.equal(alreadyKnown("", zavas), true);
  assert.equal(alreadyKnown("ミルプロ", zavas), false);
});
