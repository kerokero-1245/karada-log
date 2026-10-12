/**
 * データ確認（開発用）のうち、体組成・骨密度の部分。
 * 旧 App.tsx の確認ページから移したもの。からだタブ（準備中）の画面ができたら不要になる。
 * トレーニングの部分は、トレタブができたので外した（件数は DevDataSection の「件数」に残っている）。
 */
import { db } from "../../db/db";
import { SEGMENT_KEYS, SEGMENT_LABELS } from "../../db/types";
import { Row } from "../../components/ui";
import { formatDateTime } from "../../lib/date";
import { fmtNum } from "../../lib/nutrition";
import { useLiveQuery } from "../../lib/useLiveQuery";
import { UNKNOWN_MARK, fmtStored } from "../../lib/format";

export function DevRecordsSection() {
  const data = useLiveQuery(async () => {
    const [bodies, bones] = await Promise.all([
      db.bodyCompositions.toArray(),
      db.boneDensities.toArray(),
    ]);
    return { bodies, bones };
  }, []);

  if (!data) return <p className="text-xs text-slate-400">読み込み中…</p>;

  return (
    <>
      {data.bodies.map((body) => (
        <div key={body.id}>
          <h3 className="mb-1 text-xs font-bold text-slate-500">体組成</h3>
          <p className="text-sm">
            {formatDateTime(body.measuredAt)} / {body.place} /{" "}
            <span className="font-medium">{body.device}</span>
          </p>
          {body.warnings.length > 0 && (
            <div className="mt-1 rounded border border-red-300 bg-red-50 p-2">
              <p className="text-xs font-bold text-red-800">
                測定条件に注意がある回です
              </p>
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
                  <td className="text-right tabular-nums">
                    {fmtNum(body.segmentMuscle[key].muscleKg)}kg
                  </td>
                  <td className="text-right tabular-nums">
                    {fmtNum(body.segmentFat[key].fatKg)}kg
                  </td>
                  <td className="text-right tabular-nums">
                    {fmtNum(body.segmentFat[key].fatPercent)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-2 grid grid-cols-1 text-sm">
            <Row
              label="前日の塩分"
              value={`${fmtNum(body.conditions.previousDaySaltG)} g`}
            />
            <Row
              label="最後のトレ"
              value={
                body.conditions.lastTrainingAt
                  ? formatDateTime(body.conditions.lastTrainingAt)
                  : UNKNOWN_MARK
              }
            />
            <Row
              label="トレからの日数"
              value={`${fmtNum(body.conditions.daysSinceLastTraining)} 日`}
            />
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
