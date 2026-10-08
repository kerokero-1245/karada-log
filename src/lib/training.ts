/**
 * F4: トレーニング記録の読み書き。
 *
 * 判定（3セットとも規定回数 → 次回 +増分 / それ以外は据え置き）は lib/progression.ts の純関数に任せ、
 * ここは DB への保存だけを受け持つ。
 *
 * ★ 守ること ★
 *  - 重量は LoadSpec（バー種別 + プレート片側 / ダンベル片手 / マシンのスタック）のまま保存する。
 *    総重量の数値だけを保存しない（原則2。EZバーとショートバーの取り違え事故があった）。
 *  - 食事の記録（mealEntries）・固定ベース（shortcutSets）には一切書き込まない。
 *    トレーニングを始めると「ジムの日」になるのは、lib/day.ts の resolveDayType が
 *    その日の TrainingSession の件数を見て決めているため（dayMeta は書かない）。
 *    目標カロリーが変わるだけで、計画値が実績に足されることは無い（原則1）。
 *  - セットの回数は入力されたものだけを保存する。未入力のセットを作らない。
 */
import { db } from '../db/db';
import type {
  Exercise,
  ExerciseOutcome,
  ExerciseTarget,
  LoadSpec,
  LogDate,
  MenuId,
  SessionExercise,
  SetRecord,
  TrainingSession,
} from '../db/types';
import { toIsoDateTime } from './date';
import { isSetAchieved, judgeProgress, setValue, suggestNext } from './progression';
import type { JudgeTarget, SetInput } from './progression';

/** 種目マスタと、その回に狙う設定から判定用の規定値を作る */
export function judgeTargetOf(exercise: Exercise, planned: ExerciseTarget): JudgeTarget {
  return { kind: exercise.kind, sets: exercise.sets, reps: planned.reps, seconds: planned.seconds };
}

/** その回に狙う設定。次回の予定があればそれ、無ければ現在の設定 */
export function plannedTargetOf(exercise: Exercise): ExerciseTarget {
  return exercise.next ?? exercise.current;
}

/** トレーニングを始める（その日の区分は自動で「ジムの日」になる） */
export async function startSession(menu: MenuId, logDate: LogDate, now: Date = new Date()): Promise<number> {
  const session: TrainingSession = {
    menu,
    startedAt: toIsoDateTime(now),
    startedAtIsEstimated: false,
    logDate,
    note: '',
  };
  return (await db.trainingSessions.add(session)) as number;
}

export interface SaveExerciseInput {
  sessionId: number;
  exercise: Exercise;
  /** その回に狙った設定（規定回数・規定秒数） */
  planned: ExerciseTarget;
  /** 実際に扱った重量（バー種別 + プレートのまま） */
  load: LoadSpec;
  sets: SetInput[];
  note: string;
  /** すでに保存した記録を直すとき */
  existing: SessionExercise | null;
}

export interface SaveExerciseResult {
  sessionExerciseId: number;
  outcome: ExerciseOutcome;
}

/**
 * 種目の結果を保存し、判定に応じて種目マスタの「現在 / 次回」を更新する。
 * 同じ記録を何度保存し直しても結果は同じ（次回は「今回扱った重量」から計算する）。
 */
export async function saveExerciseRecord(input: SaveExerciseInput): Promise<SaveExerciseResult> {
  const { exercise, planned, load, sessionId, existing } = input;
  const target = judgeTargetOf(exercise, planned);
  const filled = input.sets.filter((set) => setValue(set, exercise.kind) !== null);
  const outcome = judgeProgress(filled, target);

  return db.transaction('rw', db.sessionExercises, db.setRecords, db.exercises, async () => {
    let sessionExerciseId: number;
    if (existing?.id !== undefined) {
      sessionExerciseId = existing.id;
      await db.sessionExercises.update(sessionExerciseId, { load, outcome, note: input.note });
      await db.setRecords.where('sessionExerciseId').equals(sessionExerciseId).delete();
    } else {
      // 実施順は「このセッションで何番目に記録したか」。順番は結果の原因になるので残す
      const done = await db.sessionExercises.where('sessionId').equals(sessionId).count();
      const item: SessionExercise = {
        sessionId,
        exerciseId: exercise.id as number,
        order: done + 1,
        exerciseName: exercise.name,
        load,
        outcome,
        note: input.note,
      };
      sessionExerciseId = (await db.sessionExercises.add(item)) as number;
    }

    const records: SetRecord[] = filled.map((set, i) => ({
      sessionExerciseId,
      setNo: i + 1,
      reps: exercise.kind === 'timed' ? null : set.reps,
      seconds: exercise.kind === 'timed' ? set.seconds : null,
      achieved: isSetAchieved(set, target),
      note: '',
    }));
    if (records.length > 0) await db.setRecords.bulkAdd(records);

    if (exercise.id !== undefined && outcome !== 'unknown') {
      const used: ExerciseTarget = { load, reps: planned.reps, seconds: planned.seconds };
      await db.exercises.update(exercise.id, {
        current: used,
        next: suggestNext(used, outcome, exercise.progression),
        // 実施した重量が入ったので、構成が確定していれば「実測済み」にする
        verified: load.style !== 'other',
      });
    }

    return { sessionExerciseId, outcome };
  });
}

/** 間違えて始めたトレーニングを取り消す（種目とセットの記録もまとめて消す） */
export async function deleteSession(sessionId: number): Promise<void> {
  await db.transaction('rw', db.trainingSessions, db.sessionExercises, db.setRecords, async () => {
    const items = await db.sessionExercises.where('sessionId').equals(sessionId).toArray();
    const ids = items.map((item) => item.id).filter((id): id is number => id !== undefined);
    if (ids.length > 0) await db.setRecords.where('sessionExerciseId').anyOf(ids).delete();
    await db.sessionExercises.where('sessionId').equals(sessionId).delete();
    await db.trainingSessions.delete(sessionId);
  });
}

export interface HistoryPoint {
  logDate: LogDate;
  startedAt: string;
  load: LoadSpec;
  outcome: ExerciseOutcome;
  sets: SetRecord[];
}

/**
 * 種目の履歴（古い順）。同じ名前の種目は同じものとして束ねる
 * （アブローラーのようにメニューごとに別の種目行があるものも、名前が同じなら1本の推移で見る）。
 */
export async function loadHistory(exerciseName: string, limit = 8): Promise<HistoryPoint[]> {
  const items = await db.sessionExercises.filter((item) => item.exerciseName === exerciseName).toArray();
  if (items.length === 0) return [];
  const sessionIds = [...new Set(items.map((item) => item.sessionId))];
  const sessions = await db.trainingSessions.bulkGet(sessionIds);
  const sessionById = new Map(
    sessions.filter((s): s is TrainingSession => s !== undefined).map((s) => [s.id as number, s]),
  );
  const itemIds = items.map((item) => item.id).filter((id): id is number => id !== undefined);
  const sets = itemIds.length === 0 ? [] : await db.setRecords.where('sessionExerciseId').anyOf(itemIds).toArray();

  const points: HistoryPoint[] = [];
  for (const item of items) {
    const session = sessionById.get(item.sessionId);
    if (!session) continue;
    points.push({
      logDate: session.logDate,
      startedAt: session.startedAt,
      load: item.load,
      outcome: item.outcome,
      sets: sets.filter((set) => set.sessionExerciseId === item.id).sort((a, b) => a.setNo - b.setNo),
    });
  }
  points.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return points.slice(-limit);
}

/** 次に回すメニュー（A → B → C → A）。記録が無ければ A */
export function nextMenuAfter(last: MenuId | null): MenuId {
  if (last === 'A') return 'B';
  if (last === 'B') return 'C';
  return 'A';
}

/** セッション内の保存済みの種目記録とセット */
export async function loadSessionRecords(
  sessionId: number,
): Promise<{ items: SessionExercise[]; sets: SetRecord[] }> {
  const items = await db.sessionExercises.where('sessionId').equals(sessionId).toArray();
  const ids = items.map((item) => item.id).filter((id): id is number => id !== undefined);
  const sets = ids.length === 0 ? [] : await db.setRecords.where('sessionExerciseId').anyOf(ids).toArray();
  return { items, sets };
}
