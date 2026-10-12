/**
 * 写真の読み取り（lib/vision.ts）の今の出力を固定する特性テスト。
 *
 * Claude API への要求（モデル・max_tokens・effort・fallbacks と beta・system 文・出力の schema・
 * 送る画像と指示）は、読み取りの挙動と料金を決める約束ごと。実際に送られる JSON をそのまま写して、
 * 1 文字でも変わったら赤くなるようにする。返ってきた値の検証（数値でないものは null、0 で埋めない）も確かめる。
 * Node から外へは出ない: global の fetch を差し替えて、送られた要求を拾い、作り物の応答を返す。
 * 値は架空のサンプル（キーも実在しない）。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIDENCE_LABELS,
  VISION_MAX_TOKENS,
  VISION_MODEL,
  estimateMealPhoto,
  readNutritionLabel,
  testConnection,
} from "../src/lib/vision.ts";
import {
  AUTH_MESSAGE,
  FORMAT_MESSAGE,
  OFFLINE_MESSAGE,
  PhotoError,
  REFUSAL_MESSAGE,
} from "../src/lib/photoError.ts";

const RealFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = RealFetch;
  Reflect.deleteProperty(navigator, "onLine");
});

interface Sent {
  url: string;
  method: string | undefined;
  headers: Headers;
  body: unknown;
}

/** fetch を差し替える。応答は reply が作る。送られた要求は sent に溜まる */
function installFetch(reply: () => Response): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = async (input, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    sent.push({
      url: String(input),
      method: init?.method,
      headers: new Headers(init?.headers),
      body,
    });
    return reply();
  };
  return sent;
}

function messageResponse(
  text: string | null,
  stopReason = "end_turn",
): Response {
  return new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: VISION_MODEL,
      content: text === null ? [] : [{ type: "text", text }],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function jsonResponse(value: unknown): Response {
  return messageResponse(JSON.stringify(value));
}

const LABEL_SCHEMA_JSON =
  '{"type":"object","properties":{"name":{"type":["string","null"],"description":"商品名。写っていなければ null"},"basis":{"type":"string","enum":["per_unit","per_100g","per_package"]},"basisLabel":{"type":"string","description":"ラベルの表記そのまま。例: 1食（80g）あたり"},"gramsPerBasis":{"type":["number","null"],"description":"表記1つ分のグラム数"},"kcal":{"type":["number","null"]},"proteinG":{"type":["number","null"]},"fatG":{"type":["number","null"]},"carbG":{"type":["number","null"]},"saltG":{"type":["number","null"],"description":"食塩相当量(g)"},"confidence":{"type":"string","enum":["high","medium","low"]},"notes":{"type":"string"}},"required":["name","basis","basisLabel","gramsPerBasis","kcal","proteinG","fatG","carbG","saltG","confidence","notes"],"additionalProperties":false}';

const MEAL_SCHEMA_JSON =
  '{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string","description":"品目名。例: ご飯 / 焼き鮭"},"quantity":{"type":"number","description":"量の数。例: 1杯 の 1"},"unit":{"type":"string","description":"量の単位。例: 杯 / 切れ / 個 / 100g"},"kcal":{"type":["number","null"]},"proteinG":{"type":["number","null"]},"fatG":{"type":["number","null"]},"carbG":{"type":["number","null"]},"saltG":{"type":["number","null"]},"confidence":{"type":"string","enum":["high","medium","low"]}},"required":["name","quantity","unit","kcal","proteinG","fatG","carbG","saltG","confidence"],"additionalProperties":false}},"notes":{"type":"string"}},"required":["items","notes"],"additionalProperties":false}';

const LABEL_SYSTEM = [
  "日本の食品パッケージの栄養成分表示を読み取ります。",
  "",
  "- 写真に表示されている数値だけを使います。見えない項目・読み取れない項目は null にします。推測で埋めません。",
  "- 「1食（○g）あたり」「1個あたり」は per_unit、「100gあたり」は per_100g、「1袋あたり」「1包装あたり」は per_package を basis に入れます。",
  "- basisLabel には表示されている表記をそのまま入れます（例: 「1食（80g）あたり」）。",
  "- gramsPerBasis には、その表記1つ分のグラム数を入れます。表示が無ければ null。",
  "- 数値の単位は kcal と g です。mg 表記の項目は g に直します。",
  "- 食塩相当量の表示が無く、ナトリウム(mg)だけがある場合は 食塩相当量(g) = ナトリウム(mg) × 2.54 ÷ 1000 で換算し、換算したことを notes に明記します。",
  "- 商品名が写っていれば name に入れます。写っていなければ null。",
  "- 文字がぼやけている・一部しか写っていないなど、読み取りに自信が持てないときは confidence を low にします。",
  "- notes は日本語で、1〜2文にします。",
].join("\n");

const MEAL_SYSTEM = [
  "写真に写っている食事を、日本の一般的な食事として品目に分けて見積もります。",
  "",
  "- 「ご飯」「焼き鮭」「味噌汁」のように、日常の呼び名で品目に分けます。まとめすぎず、分けすぎません。",
  "- 量は「1杯」「1切れ」「1個」「100g」のように、日常的に使う単位で表します。quantity に数、unit に単位を入れます。",
  "- 栄養値は、その品目の quantity × unit ぶん全体の概算値を入れます。",
  "- 概算で構いませんが、根拠のない細かい精度は出しません。写真から分かる範囲で丸めた値にします。",
  "- 塩分が写真から見当もつかないときは saltG を null にします。0 とは書きません。",
  "- 量や中身が見えにくい品目は confidence を low にします。",
  "- notes には見積もりの前提（量の見え方、隠れていそうな料理、味付けの仮定）を日本語で1〜2文書きます。",
].join("\n");

/** 要求ヘッダのうち、約束ごとになっているもの */
function headersOf(sent: Sent) {
  return {
    url: sent.url,
    method: sent.method,
    beta: sent.headers.get("anthropic-beta"),
    apiKey: sent.headers.get("x-api-key"),
    contentType: sent.headers.get("content-type"),
  };
}

const EXPECTED_HEADERS = {
  url: "https://api.anthropic.com/v1/messages?beta=true",
  method: "POST",
  beta: "server-side-fallback-2026-07-01",
  apiKey: "sk-test-123",
  contentType: "application/json",
};

const VALID_LABEL = {
  name: "商品A",
  basis: "per_100g",
  basisLabel: "100gあたり",
  gramsPerBasis: 100,
  kcal: 120,
  proteinG: 5,
  fatG: 1,
  carbG: 20,
  saltG: 0.5,
  confidence: "high",
  notes: "",
};

test("vision: モデルは日付サフィックスなしの claude-opus-5、出力は 4096 トークンまで、確度の表示名", () => {
  assert.equal(VISION_MODEL, "claude-opus-5-5");
  assert.equal(VISION_MAX_TOKENS, 4096);
  assert.deepEqual(CONFIDENCE_LABELS, {
    high: "読み取れています",
    medium: "だいたい読み取れています",
    low: "自信は低めです",
  });
});

test("vision.readNutritionLabel: 送る要求の全文（モデル・effort・fallbacks・beta・system・schema・画像と指示）", async () => {
  const sent = installFetch(() => jsonResponse(VALID_LABEL));
  await readNutritionLabel("AAAA", "image/jpeg", "sk-test-123");

  assert.equal(sent.length, 1);
  assert.deepEqual(headersOf(sent[0]), EXPECTED_HEADERS);
  const expectedBody = {
    model: "claude-opus-5-5",
    max_tokens: 4096,
    fallbacks: "default",
    system: LABEL_SYSTEM,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: JSON.parse(LABEL_SCHEMA_JSON) },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: "AAAA" },
          },
          {
            type: "text",
            text: "この写真の栄養成分表示を読み取ってください。",
          },
        ],
      },
    ],
  };
  // 文字列にして比べる（キーの並びまで同じ）
  assert.equal(JSON.stringify(sent[0].body), JSON.stringify(expectedBody));
  // schema は一語も変えずにそのまま送られる（enum の並びを含む）
  assert.ok(JSON.stringify(sent[0].body).includes(LABEL_SCHEMA_JSON));
});

test("vision.estimateMealPhoto: 送る要求の全文（effort は high）", async () => {
  const sent = installFetch(() => jsonResponse({ items: [], notes: "" }));
  await estimateMealPhoto("BBBB", "image/jpeg", "sk-test-123");

  assert.equal(sent.length, 1);
  assert.deepEqual(headersOf(sent[0]), EXPECTED_HEADERS);
  const expectedBody = {
    model: "claude-opus-5-5",
    max_tokens: 4096,
    fallbacks: "default",
    system: MEAL_SYSTEM,
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: JSON.parse(MEAL_SCHEMA_JSON) },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: "BBBB" },
          },
          { type: "text", text: "この写真の食事の内容を見積もってください。" },
        ],
      },
    ],
  };
  assert.equal(JSON.stringify(sent[0].body), JSON.stringify(expectedBody));
  assert.ok(JSON.stringify(sent[0].body).includes(MEAL_SCHEMA_JSON));
});

test("vision.testConnection: 最小の呼び出し（32 トークン・effort は low・system なし）", async () => {
  const sent = installFetch(() => messageResponse("OK"));
  await testConnection("sk-test-123");

  assert.equal(sent.length, 1);
  assert.deepEqual(headersOf(sent[0]), EXPECTED_HEADERS);
  assert.equal(
    JSON.stringify(sent[0].body),
    JSON.stringify({
      model: "claude-opus-5-5",
      max_tokens: 32,
      fallbacks: "default",
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "OK とだけ返してください。" }],
    }),
  );
});

test("vision.readNutritionLabel: 返ってきた値は検証する（数値でないもの・負の数は null、小数第 3 位で丸める）", async () => {
  installFetch(() =>
    jsonResponse({
      name: "  商品A  ",
      basis: "per_100g",
      basisLabel: "100gあたり",
      gramsPerBasis: 100,
      kcal: 120.12345,
      proteinG: 5,
      fatG: null,
      carbG: -1,
      saltG: "x",
      confidence: "medium",
      notes: "ナトリウムから換算",
    }),
  );
  assert.deepEqual(
    await readNutritionLabel("AAAA", "image/jpeg", "sk-test-123"),
    {
      name: "商品A",
      basis: "per_100g",
      basisLabel: "100gあたり",
      gramsPerBasis: 100,
      kcal: 120.123,
      proteinG: 5,
      fatG: null,
      carbG: null,
      saltG: null,
      confidence: "medium",
      notes: "ナトリウムから換算",
    },
  );
});

test("vision.readNutritionLabel: 知らない basis は per_unit、知らない confidence は low、空の商品名は null、文字でない値は ''", async () => {
  installFetch(() =>
    jsonResponse({
      name: "   ",
      basis: "per_other",
      basisLabel: 5,
      gramsPerBasis: "100",
      kcal: 1,
      proteinG: 1,
      fatG: 1,
      carbG: 1,
      saltG: 1,
      confidence: "very_high",
      notes: null,
    }),
  );
  assert.deepEqual(
    await readNutritionLabel("AAAA", "image/jpeg", "sk-test-123"),
    {
      name: null,
      basis: "per_unit",
      basisLabel: "",
      gramsPerBasis: null,
      kcal: 1,
      proteinG: 1,
      fatG: 1,
      carbG: 1,
      saltG: 1,
      confidence: "low",
      notes: "",
    },
  );
});

test("vision.estimateMealPhoto: 品目の名前が空・オブジェクトでない行は飛ばし、数量は 0 以下・数値でないなら 1、単位は前後の空白を落とす", async () => {
  installFetch(() =>
    jsonResponse({
      items: [
        {
          name: "ご飯",
          quantity: 1,
          unit: " 杯 ",
          kcal: 252,
          proteinG: 3.8,
          fatG: 0.5,
          carbG: 55.7,
          saltG: 0,
          confidence: "high",
        },
        { name: "  ", quantity: 1, unit: "個" },
        "文字列",
        null,
        {
          name: "焼き鮭",
          quantity: 0,
          unit: "切れ",
          kcal: 133.3333,
          proteinG: "x",
          fatG: -2,
          carbG: null,
          saltG: 0.8,
          confidence: "unknown",
        },
        { name: "味噌汁", quantity: "2", unit: 5 },
      ],
      notes: "前提",
    }),
  );
  assert.deepEqual(
    await estimateMealPhoto("BBBB", "image/jpeg", "sk-test-123"),
    {
      items: [
        {
          name: "ご飯",
          quantity: 1,
          unit: "杯",
          kcal: 252,
          proteinG: 3.8,
          fatG: 0.5,
          carbG: 55.7,
          saltG: 0,
          confidence: "high",
        },
        {
          name: "焼き鮭",
          quantity: 1,
          unit: "切れ",
          kcal: 133.333,
          proteinG: null,
          fatG: null,
          carbG: null,
          saltG: 0.8,
          confidence: "low",
        },
        {
          name: "味噌汁",
          quantity: 1,
          unit: "",
          kcal: null,
          proteinG: null,
          fatG: null,
          carbG: null,
          saltG: null,
          confidence: "low",
        },
      ],
      notes: "前提",
    },
  );
});

test("vision.estimateMealPhoto: items が配列でなければ空、notes が文字でなければ ''", async () => {
  installFetch(() => jsonResponse({ items: "なし", notes: 3 }));
  assert.deepEqual(
    await estimateMealPhoto("BBBB", "image/jpeg", "sk-test-123"),
    {
      items: [],
      notes: "",
    },
  );
});

/** 応答が返ったあとの失敗が、どの PhotoError になるか */
async function failureOf(reply: () => Response): Promise<PhotoError> {
  installFetch(reply);
  try {
    await readNutritionLabel("AAAA", "image/jpeg", "sk-test-123");
  } catch (error) {
    assert.ok(error instanceof PhotoError, String(error));
    return error;
  }
  assert.fail("失敗するはずの呼び出しが成功した");
}

test("vision: モデルが答えを返さなかった（refusal）・途中で切れた（max_tokens）・読めない応答は日本語の PhotoError にする", async () => {
  // refusal は content より先に見る（content に JSON があっても拒否として扱う）
  const refusal = await failureOf(() =>
    messageResponse(JSON.stringify(VALID_LABEL), "refusal"),
  );
  assert.deepEqual(
    [refusal.kind, refusal.message],
    ["refusal", REFUSAL_MESSAGE],
  );

  const cutOff = await failureOf(() => messageResponse("{", "max_tokens"));
  assert.deepEqual(
    [cutOff.kind, cutOff.message],
    ["format", "読み取りの途中で出力が切れました。もう一度お試しください。"],
  );

  const empty = await failureOf(() => messageResponse(null));
  assert.deepEqual([empty.kind, empty.message], ["format", FORMAT_MESSAGE]);

  const notJson = await failureOf(() =>
    messageResponse("これは JSON ではありません"),
  );
  assert.deepEqual([notJson.kind, notJson.message], ["format", FORMAT_MESSAGE]);

  for (const text of ["[]", "null", "5", '"文字列"']) {
    const notObject = await failureOf(() => messageResponse(text));
    assert.deepEqual(
      [notObject.kind, notObject.message],
      ["format", FORMAT_MESSAGE],
      text,
    );
  }
});

test("vision: 401 は認証のエラー、API キーが空なら呼び出す前に止める、オフラインも呼び出す前に止める", async () => {
  const unauthorized = await failureOf(
    () =>
      new Response(
        JSON.stringify({
          type: "error",
          error: { type: "authentication_error", message: "bad key" },
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
  );
  assert.deepEqual(
    [unauthorized.kind, unauthorized.message],
    ["auth", AUTH_MESSAGE],
  );

  const sent = installFetch(() => jsonResponse(VALID_LABEL));
  await assert.rejects(
    readNutritionLabel("AAAA", "image/jpeg", "   "),
    (error: unknown) => {
      assert.ok(error instanceof PhotoError);
      assert.deepEqual(
        [error.kind, error.message],
        ["auth", "APIキーを設定してください。"],
      );
      return true;
    },
  );
  await assert.rejects(testConnection(""), PhotoError);

  Object.defineProperty(navigator, "onLine", {
    value: false,
    configurable: true,
  });
  await assert.rejects(
    estimateMealPhoto("BBBB", "image/jpeg", "sk-test-123"),
    (error: unknown) => {
      assert.ok(error instanceof PhotoError);
      assert.deepEqual(
        [error.kind, error.message],
        ["offline", OFFLINE_MESSAGE],
      );
      return true;
    },
  );
  assert.equal(sent.length, 0);
});

test("vision.testConnection: 拒否（refusal）は PhotoError、通れば何も返さない", async () => {
  installFetch(() => messageResponse("OK"));
  assert.equal(await testConnection("sk-test-123"), undefined);

  installFetch(() => messageResponse("OK", "refusal"));
  await assert.rejects(testConnection("sk-test-123"), (error: unknown) => {
    assert.ok(error instanceof PhotoError);
    assert.deepEqual([error.kind, error.message], ["refusal", REFUSAL_MESSAGE]);
    return true;
  });
});
