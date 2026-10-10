/**
 * 全データの JSON バックアップと復元（lib/backup.ts）の今の出力を固定する特性テスト。
 *
 * 守ること: 書き出す順（BACKUP_TABLES）と JSON のキーの順 / settings から API キーを除く /
 * 壊れたファイル・別アプリのファイル・新しすぎる形式は読み込みで弾く / 復元でも API キーは
 * 今の端末の値のまま残す。Node には IndexedDB が無いので、db の読み書き口を差し替えて確かめる。
 * 値は架空のサンプル。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";
import {
  BACKUP_APP,
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  BACKUP_TABLE_LABELS,
  backupFileName,
  buildBackup,
  parseBackup,
  restoreBackup,
} from "../src/lib/backup.ts";
import type { BackupFile, BackupTable } from "../src/lib/backup.ts";
import {
  foodFixture,
  freezeTime,
  restoreStubs,
  runScope,
  settingsFixture,
  stub,
  unfreezeTime,
} from "./helpers.ts";

afterEach(() => {
  restoreStubs();
  unfreezeTime();
});

/** 端末に入っている行。書き出しの見本 */
function rowsFixture(): Record<BackupTable, unknown[]> {
  return {
    foods: [
      foodFixture({ id: 1, name: "ザバス MILK PROTEIN", aliases: ["ザバス"] }),
    ],
    mealEntries: [],
    shortcutSets: [],
    dayMeta: [
      {
        logDate: "2026-09-21",
        dayType: "gym",
        source: "manual",
        note: "画面で手動切替",
        updatedAt: "2026-09-21T08:00",
      },
    ],
    exercises: [],
    trainingSessions: [],
    sessionExercises: [],
    setRecords: [],
    bodyCompositions: [],
    boneDensities: [],
    supplements: [],
    pendingTexts: [
      {
        id: 1,
        text: "謎の品",
        reason: "見つかりませんでした",
        logDate: "2026-09-21",
        recordedAt: "2026-09-21T12:00",
        createdAt: "2026-09-21T12:00",
      },
    ],
    settings: [settingsFixture({ anthropicApiKey: "sk-ant-secret-1234" })],
  };
}

/** 書き出しの全文。ExportCard が `${JSON.stringify(backup, null, 2)}\n` でファイルにする */
const EXPECTED_JSON = `{
  "app": "karada-log",
  "formatVersion": 1,
  "exportedAt": "2026-10-11T03:04",
  "seedVersion": 2,
  "tables": {
    "foods": [
      {
        "id": 1,
        "name": "ザバス MILK PROTEIN",
        "unitLabel": "1個",
        "gramsPerUnit": null,
        "per": {
          "kcal": 100,
          "proteinG": 10,
          "fatG": 1,
          "carbG": 1,
          "saltG": 0.1
        },
        "source": "label",
        "basis": {
          "label": "1個あたり",
          "unitsPerBasis": 1
        },
        "category": "その他",
        "note": "",
        "aliases": [
          "ザバス"
        ],
        "variantGroupId": null,
        "variantLabel": null,
        "useCount": 0,
        "lastUsedAt": null,
        "archived": false,
        "createdAt": "2026-10-05T12:00",
        "updatedAt": "2026-10-05T12:00"
      }
    ],
    "mealEntries": [],
    "shortcutSets": [],
    "dayMeta": [
      {
        "logDate": "2026-09-21",
        "dayType": "gym",
        "source": "manual",
        "note": "画面で手動切替",
        "updatedAt": "2026-09-21T08:00"
      }
    ],
    "exercises": [],
    "trainingSessions": [],
    "sessionExercises": [],
    "setRecords": [],
    "bodyCompositions": [],
    "boneDensities": [],
    "supplements": [],
    "pendingTexts": [
      {
        "id": 1,
        "text": "謎の品",
        "reason": "見つかりませんでした",
        "logDate": "2026-09-21",
        "recordedAt": "2026-09-21T12:00",
        "createdAt": "2026-09-21T12:00"
      }
    ],
    "settings": [
      {
        "id": 1,
        "profile": {
          "heightCm": 170,
          "sex": "male",
          "age": 30
        },
        "bmrKcal": 1500,
        "restDayKcal": 2000,
        "gymDayKcal": 2200,
        "proteinTargetG": 130,
        "proteinCapG": 150,
        "fatTargetG": 50,
        "saltLimitG": 7,
        "weeklySaltAverageG": 6,
        "weeklyKcalTarget": 14600,
        "weeklyKcalTolerance": 300,
        "trainingPerWeek": 3,
        "weekStartsOn": 1,
        "dayBoundaryHour": 4,
        "nextMeasurementDate": null,
        "measurementChecklistLeadDays": 2,
        "measurementMinRestDays": 3,
        "goal": {
          "fatMassKg": 12,
          "leanMassKg": 55,
          "targetDate": "2026-12-31",
          "label": "年末"
        },
        "alerts": {
          "bmrFloorKcal": 1500,
          "eveningCheckHour": 20,
          "eveningRemainingKcal": 1300,
          "afternoonCheckHour": 15,
          "afternoonProgressRatio": 0.4,
          "saltStreakDays": 2,
          "noodleStreakDays": 2,
          "weeklyKcalFloor": 14300,
          "lowFatDayG": 20
        },
        "seedVersion": 2,
        "updatedAt": "2026-10-01T00:00"
      }
    ]
  }
}
`;

test("backup: 形式の名前と版、書き出す順、表示名", () => {
  assert.equal(BACKUP_APP, "karada-log");
  assert.equal(BACKUP_FORMAT_VERSION, 1);
  assert.deepEqual(
    [...BACKUP_TABLES],
    [
      "foods",
      "mealEntries",
      "shortcutSets",
      "dayMeta",
      "exercises",
      "trainingSessions",
      "sessionExercises",
      "setRecords",
      "bodyCompositions",
      "boneDensities",
      "supplements",
      "pendingTexts",
      "settings",
    ],
  );
  assert.deepEqual(BACKUP_TABLE_LABELS, {
    foods: "食品マスタ",
    mealEntries: "食事記録",
    shortcutSets: "固定ベース",
    dayMeta: "日の区分",
    exercises: "種目マスタ",
    trainingSessions: "トレ記録",
    sessionExercises: "トレ種目",
    setRecords: "セット記録",
    bodyCompositions: "体組成",
    boneDensities: "骨密度",
    supplements: "サプリ",
    pendingTexts: "未処理テキスト",
    settings: "設定",
  });
  // 全部の表が書き出しの対象になっている（書き出し漏れが無い）
  assert.deepEqual(
    [...BACKUP_TABLES].sort(),
    db.tables.map((table) => table.name).sort(),
  );
});

test("backup.buildBackup: JSON の全文（キーの順・API キー除外・末尾の改行）を固定する", async () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  const rows = rowsFixture();
  stub(db, "table", (name: BackupTable) => ({
    toArray: async () => rows[name],
  }));
  stub(db.settings, "get", async () => rows.settings[0]);

  const backup = await buildBackup();
  assert.equal(`${JSON.stringify(backup, null, 2)}\n`, EXPECTED_JSON);
  assert.deepEqual(Object.keys(backup), [
    "app",
    "formatVersion",
    "exportedAt",
    "seedVersion",
    "tables",
  ]);
  assert.deepEqual(Object.keys(backup.tables), [...BACKUP_TABLES]);
});

test("backup.buildBackup: 設定行から API キーだけを落とす（端末の行は書き換えない）", async () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  const rows = rowsFixture();
  stub(db, "table", (name: BackupTable) => ({
    toArray: async () => rows[name],
  }));
  stub(db.settings, "get", async () => rows.settings[0]);

  const backup = await buildBackup();
  const exported = backup.tables.settings[0];
  assert.ok(exported && typeof exported === "object");
  assert.equal("anthropicApiKey" in exported, false);
  assert.equal(JSON.stringify(backup).includes("sk-ant-secret"), false);
  const original = rows.settings[0];
  assert.ok(original && typeof original === "object");
  assert.equal(Reflect.get(original, "anthropicApiKey"), "sk-ant-secret-1234");
});

test("backup.buildBackup: 設定行が無い端末の seedVersion は 0", async () => {
  freezeTime(new Date(2026, 9, 11, 3, 4));
  stub(db, "table", () => ({ toArray: async () => [] }));
  stub(db.settings, "get", async () => undefined);
  const backup = await buildBackup();
  assert.equal(backup.seedVersion, 0);
  assert.deepEqual(backup.tables.settings, []);
});

test("backup.backupFileName: karada-log-backup-YYYYMMDD.json（既定は今日）", () => {
  assert.equal(
    backupFileName(new Date(2026, 8, 22, 10, 0)),
    "karada-log-backup-20260922.json",
  );
  assert.equal(
    backupFileName(new Date(2026, 0, 2, 23, 59)),
    "karada-log-backup-20260102.json",
  );
  freezeTime(new Date(2026, 9, 11, 3, 4));
  assert.equal(backupFileName(), "karada-log-backup-20261011.json");
});

test("backup.parseBackup: 壊れたファイル・別アプリ・新しすぎる形式は理由つきで弾く", () => {
  const reason = (value: unknown) => {
    const parsed = parseBackup(
      typeof value === "string" ? value : JSON.stringify(value),
    );
    assert.equal(parsed.ok, false);
    return parsed.ok ? "" : parsed.reason;
  };
  const header = { app: "karada-log", formatVersion: 1 };

  // JSON として読めない・オブジェクトではない
  for (const text of ["{", "", "[]", "123", "null", '"x"']) {
    assert.equal(reason(text), "JSON として読み取れません", text);
  }
  // 別アプリ
  assert.equal(
    reason({ app: "other", formatVersion: 1, tables: {} }),
    "karada-log のバックアップではありません",
  );
  assert.equal(
    reason({ formatVersion: 1, tables: {} }),
    "karada-log のバックアップではありません",
  );
  // 形式のバージョンが無い・数値ではない
  for (const formatVersion of [undefined, "1", null]) {
    assert.equal(
      reason({ app: "karada-log", formatVersion, tables: {} }),
      "形式のバージョンが書かれていません",
    );
  }
  // 新しすぎる形式
  assert.equal(
    reason({ app: "karada-log", formatVersion: 2, tables: {} }),
    "このアプリより新しい形式です（形式 2 / このアプリは 1 まで）",
  );
  // tables が無い・配列・null
  for (const tables of [undefined, [], null]) {
    assert.equal(reason({ ...header, tables }), "tables がありません");
  }
  // 表が配列ではない
  assert.equal(
    reason({ ...header, tables: { foods: {} } }),
    "tables.foods が配列ではありません",
  );
  assert.equal(
    reason({ ...header, tables: { mealEntries: "x" } }),
    "tables.mealEntries が配列ではありません",
  );
});

test("backup.parseBackup: 読めたファイルは表の順に件数を数える（無い表は空として扱い missing）", () => {
  const parsed = parseBackup(
    JSON.stringify({
      app: "karada-log",
      formatVersion: 1,
      exportedAt: "2026-09-22T10:00",
      seedVersion: 2,
      tables: { foods: [{ id: 1 }, { id: 2 }], settings: [{ id: 1 }] },
    }),
  );
  assert.ok(parsed.ok);
  assert.deepEqual(Object.keys(parsed), ["ok", "backup", "counts"]);
  assert.deepEqual(Object.keys(parsed.backup), [
    "app",
    "formatVersion",
    "exportedAt",
    "seedVersion",
    "tables",
  ]);
  assert.deepEqual(Object.keys(parsed.backup.tables), [...BACKUP_TABLES]);
  assert.equal(parsed.backup.exportedAt, "2026-09-22T10:00");
  assert.equal(parsed.backup.seedVersion, 2);
  assert.deepEqual(parsed.backup.tables.foods, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(parsed.backup.tables.mealEntries, []);
  assert.deepEqual(
    parsed.counts.map((count) => [count.table, count.count, count.missing]),
    [
      ["foods", 2, false],
      ["mealEntries", 0, true],
      ["shortcutSets", 0, true],
      ["dayMeta", 0, true],
      ["exercises", 0, true],
      ["trainingSessions", 0, true],
      ["sessionExercises", 0, true],
      ["setRecords", 0, true],
      ["bodyCompositions", 0, true],
      ["boneDensities", 0, true],
      ["supplements", 0, true],
      ["pendingTexts", 0, true],
      ["settings", 1, false],
    ],
  );
  assert.deepEqual(parsed.counts[0], {
    table: "foods",
    label: "食品マスタ",
    count: 2,
    missing: false,
  });
});

test("backup.parseBackup: exportedAt / seedVersion の型違いは '' / 0 にし、知らない表は捨てる。版 0 も通す", () => {
  const loose = parseBackup(
    JSON.stringify({
      app: "karada-log",
      formatVersion: 1,
      exportedAt: 5,
      seedVersion: "x",
      tables: { foods: [], extra: [1] },
    }),
  );
  assert.ok(loose.ok);
  assert.equal(loose.backup.exportedAt, "");
  assert.equal(loose.backup.seedVersion, 0);
  assert.deepEqual(Object.keys(loose.backup.tables), [...BACKUP_TABLES]);
  assert.equal(loose.counts.filter((count) => count.missing).length, 12);

  const old = parseBackup(
    JSON.stringify({ app: "karada-log", formatVersion: 0, tables: {} }),
  );
  assert.ok(old.ok);
  assert.equal(old.backup.formatVersion, 0);
});

/** restoreBackup が db に出した呼び出しを順に記録するスタブ一式 */
function stubRestore(options: {
  before: unknown;
  settingsAfterRestore: unknown[];
}): string[] {
  const calls: string[] = [];
  stub(db, "transaction", runScope);
  stub(db.settings, "get", async () => options.before);
  for (const table of db.tables) {
    stub(table, "clear", async () => {
      calls.push(`clear:${table.name}`);
    });
  }
  stub(db, "table", (name: string) => ({
    bulkAdd: async (rows: unknown[]) => {
      calls.push(`bulkAdd:${name}:${rows.length}`);
    },
  }));
  stub(db.settings, "count", async () => options.settingsAfterRestore.length);
  stub(db.settings, "put", async (row: unknown) => {
    calls.push(`put:${JSON.stringify(row)}`);
  });
  stub(db.settings, "toArray", async () => options.settingsAfterRestore);
  stub(db.settings, "update", async (id: number, changes: unknown) => {
    calls.push(`update:${id}:${JSON.stringify(changes)}`);
  });
  return calls;
}

/** どの表も空のバックアップの中身 */
function emptyRows(): Record<BackupTable, unknown[]> {
  return {
    foods: [],
    mealEntries: [],
    shortcutSets: [],
    dayMeta: [],
    exercises: [],
    trainingSessions: [],
    sessionExercises: [],
    setRecords: [],
    bodyCompositions: [],
    boneDensities: [],
    supplements: [],
    pendingTexts: [],
    settings: [],
  };
}

function backupFixture(
  tables: Partial<Record<BackupTable, unknown[]>>,
): BackupFile {
  return {
    app: BACKUP_APP,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: "2026-09-22T10:00",
    seedVersion: 2,
    tables: { ...emptyRows(), ...tables },
  };
}

test("backup.restoreBackup: 全部の表を空にしてから表の順に入れ直し、API キーは今の端末の値に戻す", async () => {
  const calls = stubRestore({
    before: settingsFixture({ anthropicApiKey: "  sk-ant-device-9999 " }),
    settingsAfterRestore: [
      settingsFixture({ anthropicApiKey: "sk-ant-from-file" }),
    ],
  });
  const result = await restoreBackup(
    backupFixture({
      foods: [foodFixture({ id: 1 }), foodFixture({ id: 2 })],
      pendingTexts: [{ id: 1 }],
      settings: [settingsFixture()],
    }),
  );

  assert.deepEqual(calls, [
    ...db.tables.map((table) => `clear:${table.name}`),
    "bulkAdd:foods:2",
    "bulkAdd:pendingTexts:1",
    "bulkAdd:settings:1",
    // 端末のキーは前後の空白を落とした値
    'update:1:{"anthropicApiKey":"sk-ant-device-9999"}',
  ]);
  assert.deepEqual(result, {
    restored: {
      foods: 2,
      mealEntries: 0,
      shortcutSets: 0,
      dayMeta: 0,
      exercises: 0,
      trainingSessions: 0,
      sessionExercises: 0,
      setRecords: 0,
      bodyCompositions: 0,
      boneDensities: 0,
      supplements: 0,
      pendingTexts: 1,
      settings: 1,
    },
    keptApiKey: true,
    keptCurrentSettings: false,
  });
  assert.deepEqual(Object.keys(result.restored), [...BACKUP_TABLES]);
});

test("backup.restoreBackup: ファイルに設定行が無ければ今の設定行（API キーなし）を戻し、キーは別に戻す", async () => {
  const before = settingsFixture({ anthropicApiKey: "sk-ant-device-9999" });
  const calls = stubRestore({ before, settingsAfterRestore: [] });
  const result = await restoreBackup(
    backupFixture({ foods: [foodFixture({ id: 1 })] }),
  );

  const withoutKey = { ...before };
  delete withoutKey.anthropicApiKey;
  assert.deepEqual(calls, [
    ...db.tables.map((table) => `clear:${table.name}`),
    "bulkAdd:foods:1",
    `put:${JSON.stringify(withoutKey)}`,
  ]);
  assert.equal(result.keptCurrentSettings, true);
  assert.equal(result.keptApiKey, true);
});

test("backup.restoreBackup: 端末にキーが無ければ null を書き戻し、keptApiKey は false", async () => {
  const calls = stubRestore({
    before: settingsFixture(),
    settingsAfterRestore: [
      settingsFixture({ anthropicApiKey: "sk-ant-from-file" }),
    ],
  });
  const result = await restoreBackup(
    backupFixture({ settings: [settingsFixture()] }),
  );
  assert.equal(calls.at(-1), 'update:1:{"anthropicApiKey":null}');
  assert.equal(result.keptApiKey, false);
  assert.equal(result.keptCurrentSettings, false);
});
