/**
 * 重量の入力。総重量の数値ではなく「何をどう積んだか」を入れる（原則2）。
 *  - バーベル: バー種別（EZバー 7kg / ショートバー 10kg）を必ず選び、プレートは片側の重量
 *  - ダンベル: 片手の重量
 *  - マシン: スタックの重量
 * 入力のたびに「合計（内訳）」を出し、バーの取り違えに気づけるようにする。
 */
import type { BarType, LoadSpec, Progression } from '../../db/types';
import { BAR_LABELS, BAR_WEIGHT_KG } from '../../db/types';
import { describeLoad } from '../../lib/weight';
import { NumberField } from './NumberField';

const BAR_TYPES: BarType[] = ['ez', 'short'];

export function LoadEditor({
  load,
  progression,
  onChange,
}: {
  load: LoadSpec;
  progression: Progression | null;
  onChange: (load: LoadSpec) => void;
}) {
  const weightStep = progression && progression.metric === 'weight' && progression.amount > 0 ? progression.amount : 1;

  return (
    <div className="space-y-2">
      {load.style === 'barbell' && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="バーの種類">
            {BAR_TYPES.map((type) => {
              const active = load.barType === type;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...load, barType: type })}
                  className={`min-h-11 rounded-full px-4 text-sm font-bold ${
                    active ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-600'
                  }`}
                >
                  {BAR_LABELS[type]} {BAR_WEIGHT_KG[type]}kg
                </button>
              );
            })}
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">プレート（片側）</p>
            <NumberField
              label="プレート片側の重量"
              unit="kg"
              step={1.25}
              value={load.plateKgPerSide}
              onChange={(v) => onChange({ ...load, plateKgPerSide: v ?? 0 })}
            />
          </div>
        </>
      )}

      {load.style === 'dumbbell' && (
        <div>
          <p className="mb-1 text-xs text-slate-500">ダンベル 片手（{load.hands}本）</p>
          <NumberField
            label="ダンベル片手の重量"
            unit="kg"
            step={progression?.basis === 'perHand' ? weightStep : 1}
            value={load.kgPerHand}
            onChange={(v) => onChange({ ...load, kgPerHand: v ?? 0 })}
          />
        </div>
      )}

      {load.style === 'machine' && (
        <div>
          <p className="mb-1 text-xs text-slate-500">マシンの重量</p>
          <NumberField
            label="マシンの重量"
            unit="kg"
            step={weightStep}
            value={load.stackKg}
            onChange={(v) => onChange({ ...load, stackKg: v ?? 0 })}
          />
        </div>
      )}

      {load.style === 'other' && (
        <div className="space-y-2 rounded-lg bg-amber-50 p-2">
          <p className="text-xs text-amber-900">
            構成がまだ分かっていない重量です（{load.description}）。バーの種類とプレートで入れ直すと、次回から内訳つきで残ります。
          </p>
          <div className="flex flex-wrap gap-2">
            {BAR_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  onChange({
                    style: 'barbell',
                    barType: type,
                    plateKgPerSide: Math.max(0, Math.round(((load.totalKg - BAR_WEIGHT_KG[type]) / 2) * 100) / 100),
                  })
                }
                className="min-h-11 rounded-full border border-amber-400 bg-white px-3 text-sm font-bold text-amber-900"
              >
                {BAR_LABELS[type]}で入力する
              </button>
            ))}
          </div>
          <NumberField
            label="合計の重量"
            unit="kg"
            step={weightStep}
            value={load.totalKg}
            onChange={(v) => onChange({ ...load, totalKg: v ?? 0 })}
          />
        </div>
      )}

      {load.style !== 'bodyweight' && (
        <p className="text-sm font-bold tabular-nums text-slate-800" data-testid="load-total">
          合計 {describeLoad(load)}
        </p>
      )}
      {load.style === 'bodyweight' && <p className="text-sm text-slate-600">自重</p>}
    </div>
  );
}
