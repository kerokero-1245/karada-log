/**
 * 写真入力（Claude API）で出すエラーの型とユーザー向け文言（lib/photoError.ts）の今の出力を固定する特性テスト。
 *
 * 例外のメッセージをそのまま画面に出さず、SDK の型付きクラスで分岐して日本語に置き換える。
 * 文字列一致では分岐しない。文言は減量アプリのトーンに合わせ、責める語は使わない。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import {
  AUTH_MESSAGE,
  FORMAT_MESSAGE,
  IMAGE_MESSAGE,
  NETWORK_MESSAGE,
  OFFLINE_MESSAGE,
  PhotoError,
  RATE_LIMIT_MESSAGE,
  REFUSAL_MESSAGE,
  photoErrorMessage,
  toPhotoError,
} from "../src/lib/photoError.ts";

const UNKNOWN_MESSAGE = "読み取れませんでした。もう一度お試しください。";

/** HTTP の status から SDK が作る型付きの例外 */
function apiError(status: number): APIError {
  return APIError.generate(
    status,
    { error: { message: "x" } },
    "msg",
    new Headers(),
  );
}

test("photoError: 文言は固定の日本語（次の一手だけを書く）", () => {
  assert.equal(
    OFFLINE_MESSAGE,
    "オフラインでは使えません。電波の届くところでお試しください。",
  );
  assert.equal(AUTH_MESSAGE, "APIキーを確認してください。");
  assert.equal(
    RATE_LIMIT_MESSAGE,
    "短い時間に何度も呼んでいます。少し待ってからもう一度お試しください。",
  );
  assert.equal(
    NETWORK_MESSAGE,
    "通信できませんでした。電波の状態を確かめて、もう一度お試しください。",
  );
  assert.equal(
    REFUSAL_MESSAGE,
    "この写真には答えを返せないと判断されました。手で入力してください。",
  );
  assert.equal(
    FORMAT_MESSAGE,
    "読み取った内容を解釈できませんでした。撮り直すか、手で入力してください。",
  );
  assert.equal(
    IMAGE_MESSAGE,
    "写真を読み込めませんでした。別の写真でお試しください。",
  );
});

test("photoError.PhotoError: kind と日本語のメッセージを持つ Error", () => {
  const error = new PhotoError("image", IMAGE_MESSAGE);
  assert.equal(error.name, "PhotoError");
  assert.equal(error.kind, "image");
  assert.equal(error.message, IMAGE_MESSAGE);
  assert.ok(error instanceof Error);
});

test("photoError.toPhotoError: SDK の例外を種類ごとの文言に直す（具体的なクラスから順に見る）", () => {
  const expectations: [string, unknown, string, string][] = [
    ["401 認証", apiError(401), "auth", AUTH_MESSAGE],
    ["429 回数超過", apiError(429), "rate_limit", RATE_LIMIT_MESSAGE],
    [
      "通信できなかった",
      new APIConnectionError({ message: "net" }),
      "network",
      NETWORK_MESSAGE,
    ],
    [
      "402 利用料",
      apiError(402),
      "api",
      "利用料の設定を確認してください（Anthropic のコンソール）。",
    ],
    [
      "403 許可なし",
      apiError(403),
      "api",
      "このAPIキーではこの操作が許可されていません。",
    ],
    [
      "404 モデルなし",
      apiError(404),
      "api",
      "このAPIキーからは指定のモデルを呼べません。",
    ],
    [
      "413 大きすぎ",
      apiError(413),
      "api",
      "写真が大きすぎます。もう少し引いて撮ってみてください。",
    ],
    [
      "500 サーバー",
      apiError(500),
      "api",
      "Anthropic 側が混み合っています。少し待ってからもう一度お試しください。",
    ],
    [
      "529 混雑",
      apiError(529),
      "api",
      "Anthropic 側が混み合っています。少し待ってからもう一度お試しください。",
    ],
    [
      "400 その他",
      apiError(400),
      "api",
      "Claude API がエラーを返しました（400）。",
    ],
    [
      "418 その他",
      apiError(418),
      "api",
      "Claude API がエラーを返しました（418）。",
    ],
    ["API 以外の例外", new Error("boom"), "unknown", UNKNOWN_MESSAGE],
    ["例外でない値", "x", "unknown", UNKNOWN_MESSAGE],
  ];
  for (const [label, error, kind, message] of expectations) {
    const converted = toPhotoError(error);
    assert.equal(converted.kind, kind, label);
    assert.equal(converted.message, message, label);
  }
});

test("photoError.toPhotoError / photoErrorMessage: PhotoError はそのまま通し、画面に出す文言だけを取り出す", () => {
  const own = new PhotoError("refusal", REFUSAL_MESSAGE);
  assert.equal(toPhotoError(own), own);
  assert.equal(photoErrorMessage(own), REFUSAL_MESSAGE);
  assert.equal(photoErrorMessage(apiError(401)), AUTH_MESSAGE);
  assert.equal(
    photoErrorMessage(new Error("英語のメッセージ")),
    UNKNOWN_MESSAGE,
  );
  assert.equal(photoErrorMessage(null), UNKNOWN_MESSAGE);
});
