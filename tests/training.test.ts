/**
 * トレーニング記録の読み書き（lib/training.ts）の今の出力を固定する特性テスト。
 *
 * 判定そのものは progression.test.ts、保存した行が書き出しにどう出るかは exportTraining.test.ts が受け持つ。
 * ここでは、保存する行の形（キーの順）・種目マスタの更新・取り消し・履歴の読み出しを確かめる。
 * Node には IndexedDB が無いので、表を tests/fakeTable.ts のメモリ上の表に差し替える。値は架空のサンプル。
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db/db.ts";
import type {
  Exercise,
  SessionExercise,
  SetRecord,
  TrainingSession,
} from "../src/db/types.ts";
import {
  deleteSession,
  judgeTargetOf,
  loadHistory,
  loadSessionRecords,
  nextMenuAfter,
  plannedTargetOf,
  saveExerciseRecord,
  startSession,
} from "../src/lib/training.ts";
import { fakeTable } from "./fakeTable.ts";
import {
  exerciseFixture,
  restoreStubs,
  runScope,
  sessionExerciseFixture,
  sessionFixture,
  setRecordFixture,
  stub,
} from "./helpers.ts";

afterEach(() => restoreStubs());

const FULL_SETS = [
  { reps: 10, seconds: null },
  { reps: 10, seconds: null },
  { reps: 10, seconds: null },
];

/** 保存に使う 3 つの表と種目マスタを、メモリ上の表にする */
function installTables(exercises: Exercise[]) {
  stub(db, "transaction", runScope);
  return {
    exercises: fakeTable<Exercise>(db.exercises, exercises),
    items: fakeTable<SessionExercise>(db.sessionExercises),
    sets: fakeTable<SetRecord>(db.setRecords),
  };
}

test("training.judgeTargetOf / plannedTargetOf: 判定用の規定値と、その回に狙う設定", () => {
  const bench = exerciseFixture();
  assert.deepEqual(judgeTargetOf(bench, bench.current), {
    kind: "weight_reps",
    sets: 3,
    reps: 10,
    seconds: null,
  });
  // 次回の予定があればそれ、無ければ現在の設定
  assert.equal(plannedTargetOf(bench), bench.next);
  const noNext = exerciseFixture({ next: null });
  assert.equal(plannedTargetOf(noNext), noNext.current);
});

test("training.nextMenuAfter: A → B → C → A。記録が無ければ A", () => {
  assert.equal(nextMenuAfter(null), "A");
  assert.equal(nextMenuAfter("A"), "B");
  assert.equal(nextMenuAfter("B"), "C");
  assert.equal(nextMenuAfter("C"), "A");
});

test("training.startSession: 開始時刻は実測（仮置きではない）。行のキーの順は保存データの形", async () => {
  const sessions = fakeTable<TrainingSession>(db.trainingSessions);
  const id = await startSession(
    "B",
    "2026-10-09",
    new Date(2026, 9, 9, 18, 30),
  );
  assert.equal(id, 1);
  assert.deepEqual(sessions, [
    {
      menu: "B",
      startedAt: "2026-10-09T18:30",
      startedAtIsEstimated: false,
      logDate: "2026-10-09",
      note: "",
      id: 1,
    },
  ]);
  assert.deepEqual(Object.keys(sessions[0]).slice(0, 5), [
    "menu",
    "startedAt",
    "startedAtIsEstimated",
    "logDate",
    "note",
  ]);
});

test("training.saveExerciseRecord: 達成なら記録と各セットを保存し、種目マスタを「現在 = 今回 / 次回 = +増分」に更新する", async () => {
  const bench = exerciseFixture();
  const tables = installTables([bench]);
  const planned = bench.next;
  assert.ok(planned);

  const result = await saveExerciseRecord({
    sessionId: 7,
    exercise: bench,
    planned,
    load: planned.load,
    sets: FULL_SETS,
    note: "順番が1番目",
    existing: null,
  });

  assert.deepEqual(result, { sessionExerciseId: 1, outcome: "achieved" });
  assert.deepEqual(tables.items, [
    {
      sessionId: 7,
      exerciseId: 1,
      order: 1,
      exerciseName: "ベンチプレス",
      load: { style: "barbell", barType: "short", plateKgPerSide: 13.75 },
      outcome: "achieved",
      note: "順番が1番目",
      id: 1,
    },
  ]);
  assert.deepEqual(Object.keys(tables.items[0]).slice(0, 7), [
    "sessionId",
    "exerciseId",
    "order",
    "exerciseName",
    "load",
    "outcome",
    "note",
  ]);
  assert.deepEqual(tables.sets, [
    {
      sessionExerciseId: 1,
      setNo: 1,
      reps: 10,
      seconds: null,
      achieved: true,
      note: "",
      id: 1,
    },
    {
      sessionExerciseId: 1,
      setNo: 2,
      reps: 10,
      seconds: null,
      achieved: true,
      note: "",
      id: 2,
    },
    {
      sessionExerciseId: 1,
      setNo: 3,
      reps: 10,
      seconds: null,
      achieved: true,
      note: "",
      id: 3,
    },
  ]);
  assert.deepEqual(Object.keys(tables.sets[0]).slice(0, 6), [
    "sessionExerciseId",
    "setNo",
    "reps",
    "seconds",
    "achieved",
    "note",
  ]);
  // 現在は今回扱った設定、次回はそこから片側 +1.25kg（総重量 +2.5kg）
  assert.deepEqual(tables.exercises[0].current, {
    load: { style: "barbell", barType: "short", plateKgPerSide: 13.75 },
    reps: 10,
    seconds: null,
  });
  assert.deepEqual(tables.exercises[0].next, {
    load: { style: "barbell", barType: "short", plateKgPerSide: 15 },
    reps: 10,
    seconds: null,
  });
  assert.equal(tables.exercises[0].verified, true);
});

test("training.saveExerciseRecord: 実施順は「このセッションで何番目に記録したか」", async () => {
  const bench = exerciseFixture();
  const tables = installTables([bench]);
  const planned = bench.next;
  assert.ok(planned);
  const save = (exerciseId: number, sessionId: number) =>
    saveExerciseRecord({
      sessionId,
      exercise: exerciseFixture({ id: exerciseId }),
      planned,
      load: planned.load,
      sets: FULL_SETS,
      note: "",
      existing: null,
    });
  await save(1, 7);
  await save(2, 7);
  await save(3, 8);
  assert.deepEqual(
    tables.items.map((item) => [item.sessionId, item.exerciseId, item.order]),
    [
      [7, 1, 1],
      [7, 2, 2],
      [8, 3, 1],
    ],
  );
});

test("training.saveExerciseRecord: 保存し直すときは同じ行を更新し、前のセットを消して入れ直す（実施順は動かさない）", async () => {
  const bench = exerciseFixture();
  const tables = installTables([bench]);
  const planned = bench.next;
  assert.ok(planned);
  await saveExerciseRecord({
    sessionId: 7,
    exercise: bench,
    planned,
    load: planned.load,
    sets: FULL_SETS,
    note: "最初",
    existing: null,
  });

  const second = await saveExerciseRecord({
    sessionId: 7,
    exercise: tables.exercises[0],
    planned,
    load: planned.load,
    sets: [
      { reps: 10, seconds: null },
      { reps: 9, seconds: null },
    ],
    note: "",
    existing: tables.items[0],
  });
  // 1 セットでも届かなければ据え置き。セット数が足りなくても据え置き
  assert.deepEqual(second, { sessionExerciseId: 1, outcome: "held" });
  assert.equal(tables.items.length, 1);
  assert.equal(tables.items[0].outcome, "held");
  assert.equal(tables.items[0].note, "");
  assert.equal(tables.items[0].order, 1);
  assert.deepEqual(
    tables.sets.map((set) => [
      set.sessionExerciseId,
      set.setNo,
      set.reps,
      set.achieved,
    ]),
    [
      [1, 1, 10, true],
      [1, 2, 9, false],
    ],
  );
  // 据え置きの次回は、今回扱った設定のまま
  assert.deepEqual(tables.exercises[0].next, tables.exercises[0].current);
});

test("training.saveExerciseRecord: 時間ベースの種目は秒数を保存し、達成なら次回の秒数を足す", async () => {
  const farmer = exerciseFixture({
    id: 2,
    name: "ファーマーズウォーク",
    kind: "timed",
    current: {
      load: { style: "dumbbell", kgPerHand: 16, hands: 2 },
      reps: null,
      seconds: 40,
    },
    next: {
      load: { style: "dumbbell", kgPerHand: 16, hands: 2 },
      reps: null,
      seconds: 45,
    },
    progression: { metric: "seconds", amount: 5, basis: "total" },
  });
  const tables = installTables([farmer]);
  const planned = farmer.next;
  assert.ok(planned);

  const result = await saveExerciseRecord({
    sessionId: 7,
    exercise: farmer,
    planned,
    load: planned.load,
    sets: [
      { reps: null, seconds: 45 },
      { reps: null, seconds: 46 },
      { reps: null, seconds: 47 },
    ],
    note: "",
    existing: null,
  });
  assert.equal(result.outcome, "achieved");
  assert.deepEqual(
    tables.sets.map((set) => [set.reps, set.seconds, set.achieved]),
    [
      [null, 45, true],
      [null, 46, true],
      [null, 47, true],
    ],
  );
  assert.equal(tables.exercises[0].current.seconds, 45);
  assert.equal(tables.exercises[0].next?.seconds, 50);
});

test("training.saveExerciseRecord: 入力のあるセットだけ保存し、判定できなければ種目マスタは更新しない", async () => {
  const farmer = exerciseFixture({ id: 2, kind: "timed" });
  const amrap = exerciseFixture({
    id: 3,
    name: "アブローラー",
    kind: "amrap",
    current: {
      load: { style: "bodyweight", addedKg: null },
      reps: null,
      seconds: null,
    },
    next: null,
    progression: null,
  });
  const tables = installTables([farmer, amrap]);
  const before = structuredClone(tables.exercises);

  // 何も入力されていないセットは保存しない（判定は unknown）
  const empty = await saveExerciseRecord({
    sessionId: 7,
    exercise: farmer,
    planned: farmer.current,
    load: farmer.current.load,
    sets: [{ reps: null, seconds: null }],
    note: "",
    existing: null,
  });
  assert.equal(empty.outcome, "unknown");
  assert.equal(tables.sets.length, 0);

  // 限界までの種目は回数を残すが、判定しない（achieved は null）
  const rollout = await saveExerciseRecord({
    sessionId: 7,
    exercise: amrap,
    planned: amrap.current,
    load: amrap.current.load,
    sets: [{ reps: 12, seconds: null }],
    note: "",
    existing: null,
  });
  assert.equal(rollout.outcome, "unknown");
  assert.deepEqual(
    tables.sets.map((set) => [set.reps, set.achieved]),
    [[12, null]],
  );
  assert.deepEqual(tables.exercises, before);
});

test("training.saveExerciseRecord: 構成が分からない重量（other）で記録しても「実測済み」にはしない", async () => {
  const unverified = exerciseFixture({ id: 4, verified: false });
  const tables = installTables([unverified]);
  const planned = unverified.next;
  assert.ok(planned);
  await saveExerciseRecord({
    sessionId: 7,
    exercise: unverified,
    planned,
    load: { style: "other", totalKg: 20, description: "構成不明" },
    sets: FULL_SETS,
    note: "",
    existing: null,
  });
  assert.equal(tables.exercises[0].verified, false);
  assert.deepEqual(tables.exercises[0].next?.load, {
    style: "other",
    totalKg: 22.5,
    description: "構成不明",
  });

  // バーベルで記録すれば実測済みになる
  await saveExerciseRecord({
    sessionId: 7,
    exercise: tables.exercises[0],
    planned,
    load: planned.load,
    sets: FULL_SETS,
    note: "",
    existing: null,
  });
  assert.equal(tables.exercises[0].verified, true);
});

test("training.deleteSession: セッションと、その種目・セットの記録をまとめて消す（ほかのセッションは残す）", async () => {
  stub(db, "transaction", runScope);
  const sessions = fakeTable<TrainingSession>(db.trainingSessions, [
    sessionFixture({ id: 1 }),
    sessionFixture({ id: 2, logDate: "2026-09-22" }),
  ]);
  const items = fakeTable<SessionExercise>(db.sessionExercises, [
    sessionExerciseFixture({ id: 1, sessionId: 1 }),
    sessionExerciseFixture({ id: 2, sessionId: 1, order: 2 }),
    sessionExerciseFixture({ id: 3, sessionId: 2 }),
  ]);
  const sets = fakeTable<SetRecord>(db.setRecords, [
    setRecordFixture({ id: 1, sessionExerciseId: 1 }),
    setRecordFixture({ id: 2, sessionExerciseId: 2 }),
    setRecordFixture({ id: 3, sessionExerciseId: 3 }),
  ]);

  await deleteSession(1);
  assert.deepEqual(
    sessions.map((row) => row.id),
    [2],
  );
  assert.deepEqual(
    items.map((row) => row.id),
    [3],
  );
  assert.deepEqual(
    sets.map((row) => row.id),
    [3],
  );

  // 種目の記録が無いセッションも消せる
  await deleteSession(2);
  assert.deepEqual(sessions, []);
});

test("training.loadHistory: 同じ名前の種目を古い順に束ね、セットは setNo 順。limit は新しいほうから数える", async () => {
  fakeTable<TrainingSession>(db.trainingSessions, [
    sessionFixture({
      id: 1,
      logDate: "2026-09-14",
      startedAt: "2026-09-14T19:00",
    }),
    sessionFixture({
      id: 2,
      menu: "C",
      logDate: "2026-09-18",
      startedAt: "2026-09-18T19:00",
    }),
    sessionFixture({
      id: 3,
      logDate: "2026-09-21",
      startedAt: "2026-09-21T19:00",
    }),
  ]);
  fakeTable<SessionExercise>(db.sessionExercises, [
    sessionExerciseFixture({
      id: 1,
      sessionId: 3,
      outcome: "held",
      load: { style: "barbell", barType: "short", plateKgPerSide: 13.75 },
    }),
    sessionExerciseFixture({
      id: 2,
      sessionId: 1,
      outcome: "achieved",
      load: { style: "barbell", barType: "short", plateKgPerSide: 12.5 },
    }),
    sessionExerciseFixture({
      id: 3,
      sessionId: 2,
      outcome: "unknown",
      exerciseName: "別の種目",
    }),
    // セッションが見つからない行は飛ばす
    sessionExerciseFixture({ id: 4, sessionId: 99 }),
    sessionExerciseFixture({
      id: 5,
      sessionId: 2,
      exerciseId: 9,
      load: { style: "barbell", barType: "short", plateKgPerSide: 13 },
    }),
  ]);
  fakeTable<SetRecord>(db.setRecords, [
    setRecordFixture({ id: 1, sessionExerciseId: 1, setNo: 2, reps: 9 }),
    setRecordFixture({ id: 2, sessionExerciseId: 1, setNo: 1, reps: 10 }),
    setRecordFixture({ id: 3, sessionExerciseId: 2, setNo: 1, reps: 10 }),
  ]);

  const points = await loadHistory("ベンチプレス");
  assert.deepEqual(
    points.map((point) => ({
      logDate: point.logDate,
      startedAt: point.startedAt,
      plate: point.load.style === "barbell" ? point.load.plateKgPerSide : null,
      outcome: point.outcome,
      reps: point.sets.map((set) => set.reps),
    })),
    [
      {
        logDate: "2026-09-14",
        startedAt: "2026-09-14T19:00",
        plate: 12.5,
        outcome: "achieved",
        reps: [10],
      },
      {
        logDate: "2026-09-18",
        startedAt: "2026-09-18T19:00",
        plate: 13,
        outcome: "achieved",
        reps: [],
      },
      {
        logDate: "2026-09-21",
        startedAt: "2026-09-21T19:00",
        plate: 13.75,
        outcome: "held",
        reps: [10, 9],
      },
    ],
  );
  assert.deepEqual(Object.keys(points[0]), [
    "logDate",
    "startedAt",
    "load",
    "outcome",
    "sets",
  ]);
  // 新しい 2 件だけ
  assert.deepEqual(
    (await loadHistory("ベンチプレス", 2)).map((point) => point.logDate),
    ["2026-09-18", "2026-09-21"],
  );
  assert.deepEqual(await loadHistory("存在しない種目"), []);
});

test("training.loadSessionRecords: セッションの種目の記録と、そのセット（空配列でも落ちない）", async () => {
  fakeTable<SessionExercise>(db.sessionExercises, [
    sessionExerciseFixture({ id: 1, sessionId: 1 }),
    sessionExerciseFixture({ id: 2, sessionId: 1, order: 2 }),
    sessionExerciseFixture({ id: 3, sessionId: 2 }),
  ]);
  fakeTable<SetRecord>(db.setRecords, [
    setRecordFixture({ id: 1, sessionExerciseId: 1, setNo: 1 }),
    setRecordFixture({ id: 2, sessionExerciseId: 2, setNo: 1 }),
    setRecordFixture({ id: 3, sessionExerciseId: 3, setNo: 1 }),
  ]);

  const records = await loadSessionRecords(1);
  assert.deepEqual(
    records.items.map((item) => item.id),
    [1, 2],
  );
  assert.deepEqual(
    records.sets.map((set) => set.id),
    [1, 2],
  );
  assert.deepEqual(Object.keys(records), ["items", "sets"]);

  const none = await loadSessionRecords(99);
  assert.deepEqual(none, { items: [], sets: [] });
});
