/**
 * データ確認（開発用）のうち、トレーニング・体組成・骨密度の部分。
 * 旧 App.tsx の確認ページから移したもの。F4/F5 の画面ができたら不要になる。
 */
import { db } from '../../db/db';
import type { MenuId } from '../../db/types';
import { MENU_LABELS, OUTCOME_LABELS, SEGMENT_KEYS, SEGMENT_LABELS } from '../../db/types';
import { Badge, Row } from '../../components/ui';
import { formatDateTime } from '../../lib/date';
import { fmtNum } from '../../lib/nutrition';
import { describeLoad, describeProgression } from '../../lib/weight';
import { useLiveQuery } from '../../lib/useLiveQuery';
import { fmtStored } from '../../lib/formatKcal';

export function DevRecordsSection() {
  const data = useLiveQuery(async () => {
    const [exercises, sessions, sessionExercises, setRecords, bodies, bones] = await Promise.all([
      db.exercises.toArray(),
      db.trainingSessions.orderBy('startedAt').toArray(),
      db.sessionExercises.toArray(),
      db.setRecords.toArray(),
      db.bodyCompositions.toArray(),
      db.boneDensities.toArray(),
    ]);
    return { exercises, sessions, sessionExercises, setRecords, bodies, bones };
  }, []);

  if (!data) return <p className="text-xs text-slate-400">読み込み中…</p>;

  return (
    <>
      <div>
        <h3 className="mb-1 text-xs font-bold text-slate-500">種目マスタ（{data.exercises.length}件）</h3>
        {(['A', 'B', 'C'] as MenuId[]).map((menu) => (
          <div key={menu} className="mb-2 last:mb-0">
            <h4 className="text-xs font-bold text-slate-600">{MENU_LABELS[menu]}</h4>
            <ul className="divide-y divide-slate-100">
              {data.exercises
                .filter((exercise) => exercise.menu === menu)
                .sort((a, b) => a.order - b.order)
                .map((exercise) => (
                  <li key={exercise.id} className="py-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs text-slate-400">{exercise.order}.</span>
                      <span className="text-sm font-medium">{exercise.name}</span>
                      {!exercise.verified && <Badge tone="amber">未検証</Badge>}
                      {exercise.kind === 'timed' && <Badge tone="blue">時間ベース</Badge>}
                      {exercise.kind === 'amrap' && <Badge tone="slate">限界まで</Badge>}
                    </div>
                    <div className="text-xs text-slate-700">
                      現在: {describeLoad(exercise.current.load)}
                      {exercise.current.reps !== null && ` × ${exercise.current.reps}回 × ${exercise.sets}セット`}
                      {exercise.current.seconds !== null &&
                        ` × ${exercise.current.seconds}秒 × ${exercise.sets}セット`}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      次回:{' '}
                      {exercise.next
                        ? `${describeLoad(exercise.next.load)}${
                            exercise.next.seconds !== null ? ` × ${exercise.next.seconds}秒` : ''
                          }`
                        : '実測して確定させる'}
                      {' / '}増分: {describeProgression(exercise.progression)}
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-bold text-slate-500">トレーニング記録（{data.sessions.length}件）</h3>
        <ul className="space-y-2">
          {data.sessions.map((session) => {
            const items = data.sessionExercises
              .filter((item) => item.sessionId === session.id)
              .sort((a, b) => a.order - b.order);
            return (
              <li key={session.id} className="rounded border border-slate-200 p-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-medium">{formatDateTime(session.startedAt)}</span>
                  <Badge tone="blue">{MENU_LABELS[session.menu]}</Badge>
                  {session.startedAtIsEstimated && <Badge tone="slate">開始時刻は仮置き</Badge>}
                </div>
                {items.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">種目の記録なし</p>
                ) : (
                  <ul className="mt-1 divide-y divide-slate-100">
                    {items.map((item) => {
                      const sets = data.setRecords
                        .filter((record) => record.sessionExerciseId === item.id)
                        .sort((a, b) => a.setNo - b.setNo);
                      return (
                        <li key={item.id} className="py-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-xs text-slate-400">{item.order}.</span>
                            <span className="text-sm font-medium">{item.exerciseName}</span>
                            <Badge tone={item.outcome === 'achieved' ? 'emerald' : 'slate'}>
                              {OUTCOME_LABELS[item.outcome]}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-700">{describeLoad(item.load)}</div>
                          <div className="text-[11px] text-slate-500">
                            {sets.length > 0
                              ? sets
                                  .map((record) =>
                                    record.reps !== null
                                      ? `${record.setNo}set ${record.reps}回`
                                      : record.seconds !== null
                                        ? `${record.setNo}set ${record.seconds}秒`
                                        : `${record.setNo}set 記録なし`,
                                  )
                                  .join(' / ')
                              : '各セットの記録なし（回数は不明のまま保持）'}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {data.bodies.map((body) => (
        <div key={body.id}>
          <h3 className="mb-1 text-xs font-bold text-slate-500">体組成</h3>
          <p className="text-sm">
            {formatDateTime(body.measuredAt)} / {body.place} / <span className="font-medium">{body.device}</span>
          </p>
          {body.warnings.length > 0 && (
            <div className="mt-1 rounded border border-red-300 bg-red-50 p-2">
              <p className="text-xs font-bold text-red-800">測定条件に注意がある回です</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-red-900">
                {body.warnings.map((warning) => (
                  <li key={warning.code}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}
          <dl className="mt-1 grid grid-cols-2 gap-x-3 text-sm">
            <Row label="体重" value={`${fmtNum(body.weightKg)} kg`} />
            <Row label="体脂肪率" value={`${fmtNum(body.bodyFatPercent)} %`} />
            <Row label="脂肪量" value={`${fmtNum(body.fatMassKg)} kg`} />
            <Row label="除脂肪量" value={`${fmtNum(body.leanMassKg)} kg`} />
            <Row label="筋肉量" value={`${fmtNum(body.muscleMassKg)} kg`} />
            <Row label="基礎代謝" value={`${fmtStored(body.bmrKcal)} kcal`} />
            <Row label="内臓脂肪レベル" value={fmtNum(body.visceralFatLevel)} />
            <Row label="BMI" value={fmtNum(body.bmi)} />
          </dl>
          <table className="mt-2 w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left font-normal">部位</th>
                <th className="text-right font-normal">筋肉量</th>
                <th className="text-right font-normal">脂肪量</th>
                <th className="text-right font-normal">脂肪率</th>
              </tr>
            </thead>
            <tbody>
              {SEGMENT_KEYS.map((key) => (
                <tr key={key} className="border-t border-slate-100">
                  <td className="py-0.5">{SEGMENT_LABELS[key]}</td>
                  <td className="text-right tabular-nums">{fmtNum(body.segmentMuscle[key].muscleKg)}kg</td>
                  <td className="text-right tabular-nums">{fmtNum(body.segmentFat[key].fatKg)}kg</td>
                  <td className="text-right tabular-nums">{fmtNum(body.segmentFat[key].fatPercent)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-2 grid grid-cols-1 text-sm">
            <Row label="前日の塩分" value={`${fmtNum(body.conditions.previousDaySaltG)} g`} />
            <Row
              label="最後のトレ"
              value={body.conditions.lastTrainingAt ? formatDateTime(body.conditions.lastTrainingAt) : '—'}
            />
            <Row label="トレからの日数" value={`${fmtNum(body.conditions.daysSinceLastTraining)} 日`} />
          </dl>
        </div>
      ))}

      {data.bones.map((bone) => (
        <div key={bone.id}>
          <h3 className="mb-1 text-xs font-bold text-slate-500">骨密度</h3>
          <p className="text-sm">
            {formatDateTime(bone.measuredAt)} / {bone.place} / {bone.device}
          </p>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 text-sm">
            <Row label="SOS" value={`${fmtNum(bone.sosMps)} m/sec`} />
            <Row label="%YAM" value={`${fmtNum(bone.yamPercent)} %`} />
            <Row label="%AGE" value={`${fmtNum(bone.agePercent)} %`} />
            <Row label="判定" value={`${bone.rank}ランク`} />
          </dl>
        </div>
      ))}
    </>
  );
}
