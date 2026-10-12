/**
 * 1種目ぶんの記録カード。
 * 重量（バー種別 + プレート）/ セットごとの回数（時間種目は秒数）/ 達成の印 / メモ を入れて保存する。
 * 保存すると進捗ルールで判定し、「次回 +○kg」か「据え置き」を出す。
 */
import { useState } from "react";
import type {
  Exercise,
  ExerciseTarget,
  LoadSpec,
  SessionExercise,
  SetRecord,
} from "../../db/types";
import { Badge, Card } from "../../components/ui";
import { UNKNOWN_MARK } from "../../lib/format";
import { formatNumber } from "../../lib/number";
import {
  describeJudgement,
  isSetAchieved,
  judgeProgress,
  setValue,
  targetValue,
} from "../../lib/progression";
import type { SetInput } from "../../lib/progression";
import {
  judgeTargetOf,
  loadHistory,
  plannedTargetOf,
  saveExerciseRecord,
} from "../../lib/training";
import { useLiveQuery } from "../../lib/useLiveQuery";
import { describeLoad, describeProgression } from "../../lib/weight";
import { HistoryChart } from "./HistoryChart";
import { LoadEditor } from "./LoadEditor";
import { NumberField } from "../../components/NumberField";

const EMPTY_SET: SetInput = { reps: null, seconds: null };

function initialSets(
  exercise: Exercise,
  records: SetRecord[] | null,
): SetInput[] {
  if (records && records.length > 0)
    return records.map((r) => ({ reps: r.reps, seconds: r.seconds }));
  return Array.from({ length: exercise.sets }, () => ({ ...EMPTY_SET }));
}

export function ExerciseCard({
  sessionId,
  exercise,
  saved,
  savedSets,
}: {
  sessionId: number;
  exercise: Exercise;
  saved: SessionExercise | null;
  savedSets: SetRecord[];
}) {
  // 保存済みの記録があれば、その回の規定値は種目マスタの「現在」（保存時に今回の設定を書いている）
  const [planned] = useState<ExerciseTarget>(() =>
    saved && saved.outcome !== "unknown"
      ? exercise.current
      : plannedTargetOf(exercise),
  );
  const [load, setLoad] = useState<LoadSpec>(() => saved?.load ?? planned.load);
  const [sets, setSets] = useState<SetInput[]>(() =>
    initialSets(exercise, saved ? savedSets : null),
  );
  const [note, setNote] = useState(() => saved?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const history = useLiveQuery(
    () => loadHistory(exercise.name),
    [exercise.name, saved?.id, saved?.outcome],
  );

  const target = judgeTargetOf(exercise, planned);
  const goal = targetValue(target);
  const timed = exercise.kind === "timed";
  const unit = timed ? "秒" : "回";
  const preview = judgeProgress(
    sets.filter((set) => setValue(set, exercise.kind) !== null),
    target,
  );
  const used: ExerciseTarget = {
    load,
    reps: planned.reps,
    seconds: planned.seconds,
  };

  const update = (fn: () => void) => {
    fn();
    setDirty(true);
  };

  const setAt = (index: number, value: number | null) =>
    update(() =>
      setSets((prev) =>
        prev.map((set, i) =>
          i === index
            ? timed
              ? { ...set, seconds: value }
              : { ...set, reps: value }
            : set,
        ),
      ),
    );

  const fillAll = () => {
    if (goal === null) return;
    update(() =>
      setSets((prev) =>
        prev.map((set) =>
          timed ? { ...set, seconds: goal } : { ...set, reps: goal },
        ),
      ),
    );
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveExerciseRecord({
        sessionId,
        exercise,
        planned,
        load,
        sets,
        note,
        existing: saved,
      });
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const goalText =
    exercise.kind === "amrap"
      ? `限界まで × ${exercise.sets}`
      : `${goal ?? UNKNOWN_MARK}${unit} × ${exercise.sets}セット`;

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-slate-200 pb-1">
        <h3 className="text-base font-bold text-slate-800">
          {exercise.order}. {exercise.name}
        </h3>
        <span className="text-xs text-slate-500">規定 {goalText}</span>
        {exercise.progression && (
          <span className="text-xs text-slate-500">
            増分 {describeProgression(exercise.progression)}
          </span>
        )}
        {!exercise.verified && <Badge tone="amber">重量は未検証</Badge>}
        {saved && <Badge tone="emerald">記録済み</Badge>}
      </div>
      {exercise.note.trim() !== "" && (
        <p className="mb-2 text-[11px] text-slate-500">{exercise.note}</p>
      )}

      <div className="space-y-3">
        {load.style !== "bodyweight" && (
          <p className="text-[11px] text-slate-500">
            今回の予定: {describeLoad(planned.load)}
          </p>
        )}
        <LoadEditor
          load={load}
          progression={exercise.progression}
          onChange={(next) => update(() => setLoad(next))}
        />

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <p className="text-xs font-bold text-slate-600">
              {timed ? "セットごとの秒数" : "セットごとの回数"}
            </p>
            {goal !== null && (
              <button
                type="button"
                onClick={fillAll}
                className="min-h-9 px-1 text-xs font-bold text-emerald-700 underline underline-offset-2"
              >
                全セット規定どおりに入れる
              </button>
            )}
          </div>
          <ol className="space-y-1.5">
            {sets.map((set, i) => {
              const achieved = isSetAchieved(set, target);
              const value = setValue(set, exercise.kind);
              return (
                <li
                  key={i}
                  className="flex items-center gap-2"
                  data-testid="set-row"
                >
                  <span className="w-12 shrink-0 text-xs text-slate-500">
                    {i + 1}セット
                  </span>
                  <div className="min-w-0 flex-1">
                    <NumberField
                      label={`${i + 1}セット目の${timed ? "秒数" : "回数"}`}
                      unit={unit}
                      step={1}
                      allowEmpty
                      placeholder={goal !== null ? String(goal) : ""}
                      value={value}
                      onChange={(v) => setAt(i, v)}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-[11px]">
                    {achieved === true && (
                      <span className="font-bold text-emerald-700">✓ 規定</span>
                    )}
                    {achieved === false && goal !== null && value !== null && (
                      <span className="text-slate-500">
                        あと{formatNumber(goal - value)}
                        {unit}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() =>
                update(() => setSets((prev) => [...prev, { ...EMPTY_SET }]))
              }
              className="min-h-9 rounded-lg px-2 text-xs text-slate-600 active:bg-slate-100"
            >
              ＋ セットを足す
            </button>
            {sets.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  update(() => setSets((prev) => prev.slice(0, -1)))
                }
                className="min-h-9 rounded-lg px-2 text-xs text-slate-600 active:bg-slate-100"
              >
                − 最後のセットを外す
              </button>
            )}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">
            メモ（順番・握力・体調など）
          </span>
          <textarea
            value={note}
            onChange={(e) => update(() => setNote(e.target.value))}
            rows={2}
            placeholder="例: 順番が3番目だった / 握力が先に切れた"
            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
          />
        </label>

        <div
          className={`rounded-lg p-2 text-sm font-bold ${
            preview === "achieved"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-slate-50 text-slate-700"
          }`}
          data-testid="judgement"
        >
          {saved && !dirty ? "判定: " : "このまま記録すると: "}
          {describeJudgement(
            preview,
            exercise.progression,
            used,
            exercise.kind,
          )}
        </div>

        {error && (
          <p className="text-sm text-red-700">保存できませんでした: {error}</p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || (saved !== null && !dirty)}
          className="h-12 w-full rounded-lg bg-emerald-600 text-sm font-bold text-white active:bg-emerald-700 disabled:bg-slate-300"
        >
          {saved
            ? dirty
              ? "記録を直す"
              : "記録しました"
            : "この種目を記録する"}
        </button>

        <HistoryChart points={history ?? []} kind={exercise.kind} />
      </div>
    </Card>
  );
}
