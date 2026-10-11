/**
 * クリップボードへのコピー（lib/clipboard.ts）の今の出力を固定する特性テスト。
 *
 * iOS Safari などではクリップボードが使えないことがある（許可が無い・HTTPS でない など）。
 * 使えなくても操作が止まらないよう、copyText は例外を投げずに成否を boolean で返し、
 * 呼び出し側（エクスポート・依頼文のコピー）は false を見て手動コピーの欄に切り替える。
 * Node には navigator.clipboard が無いので、globalThis.navigator を差し替えて確かめる。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { copyText } from "../src/lib/clipboard.ts";

const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function setNavigator(value: unknown): void {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "navigator", original);
  else Reflect.deleteProperty(globalThis, "navigator");
});

test("clipboard.copyText: navigator が無い環境では false（例外を投げない）", async () => {
  setNavigator(undefined);
  assert.equal(await copyText("コピーする文字列"), false);
});

test("clipboard.copyText: navigator.clipboard が無い環境では false", async () => {
  setNavigator({});
  assert.equal(await copyText("コピーする文字列"), false);
  setNavigator({ clipboard: {} });
  assert.equal(await copyText("コピーする文字列"), false);
});

test("clipboard.copyText: writeText が通れば true。渡した文字列をそのまま書く", async () => {
  const written: string[] = [];
  setNavigator({
    clipboard: {
      writeText: async (text: string) => {
        written.push(text);
      },
    },
  });
  assert.equal(await copyText("ザバス2本\n21:30 家系ラーメン"), true);
  assert.deepEqual(written, ["ザバス2本\n21:30 家系ラーメン"]);
});

test("clipboard.copyText: writeText が拒否・例外でも false（呼び出し側が手動コピーに切り替える）", async () => {
  setNavigator({
    clipboard: {
      writeText: async () => {
        throw new Error("NotAllowedError");
      },
    },
  });
  assert.equal(await copyText("コピーする文字列"), false);
  setNavigator({
    clipboard: {
      writeText: () => {
        throw new Error("同期で投げる実装");
      },
    },
  });
  assert.equal(await copyText("コピーする文字列"), false);
});
