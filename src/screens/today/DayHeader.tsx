/**
 * 日付・曜日・今日の区分。
 * 区分はチップをタップで手動切替。手動にしたときだけ「自動判定に戻す」を出す。
 */
import type { DayType, LogDate } from '../../db/types';
import { DAY_TYPE_LABELS } from '../../db/types';
import { formatLogDate } from '../../lib/date';

export function DayHeader({
  logDate,
  dayType,
  source,
  targetKcal,
  trainingCount,
  onSelect,
  onReset,
}: {
  logDate: LogDate;
  dayType: DayType;
  source: 'auto' | 'manual';
  targetKcal: number;
  trainingCount: number;
  onSelect: (dayType: DayType) => void;
  onReset: () => void;
}) {
  return (
    <header className="bg-slate-900 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white">
      <div className="mx-auto max-w-md">
        <p className="text-xs text-slate-300">今日（朝4時から翌朝4時まで）</p>
        <h1 className="text-2xl font-bold tracking-wide">{formatLogDate(logDate)}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(['rest', 'gym'] as DayType[]).map((type) => {
            const active = type === dayType;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onSelect(type)}
                aria-pressed={active}
                className={`min-h-11 rounded-full px-4 text-sm font-bold ${
                  active ? 'bg-white text-slate-900' : 'border border-slate-600 text-slate-300'
                }`}
              >
                {DAY_TYPE_LABELS[type]}
              </button>
            );
          })}
          <span className="text-sm text-slate-300">目標 {targetKcal.toLocaleString('ja-JP')} kcal</span>
        </div>

        <p className="mt-2 text-[11px] text-slate-400">
          {source === 'manual' ? (
            <>
              手動で「{DAY_TYPE_LABELS[dayType]}」にしています。
              <button type="button" onClick={onReset} className="ml-1 underline underline-offset-2">
                自動判定に戻す
              </button>
            </>
          ) : trainingCount > 0 ? (
            'トレーニングの記録があるので、自動で「ジムの日」にしています。'
          ) : (
            'トレーニングの記録がないので「休養日」。記録すると自動で「ジムの日」になります。'
          )}
        </p>
      </div>
    </header>
  );
}
