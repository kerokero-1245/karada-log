/**
 * 時刻の入力。既定は現在時刻。
 * 0〜4時は前日の記録になるので、行き先の論理日付を明示する
 * （「01:30 → 9/20（日） の記録になります」）。
 */
import { formatLogDateShort, isoDateTimeIn, toLogDate } from '../lib/date';
import type { LogDate } from '../db/types';

export function TimeField({
  value,
  onChange,
  logDate,
  boundaryHour,
  label = '時刻',
}: {
  value: string;
  onChange: (value: string) => void;
  logDate: LogDate;
  boundaryHour: number;
  label?: string;
}) {
  const hour = Number(value.slice(0, 2));
  const beforeBoundary = Number.isFinite(hour) && hour < boundaryHour;
  const destination = toLogDate(isoDateTimeIn(logDate, value, boundaryHour), boundaryHour);

  return (
    <div>
      <label className="block">
        <span className="block text-xs font-bold text-slate-600">{label}</span>
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 h-14 w-full rounded-lg border border-slate-300 bg-white px-3 text-xl tabular-nums"
        />
      </label>
      {beforeBoundary && (
        <p className="mt-1 text-xs text-sky-700">
          {value} → {formatLogDateShort(destination)} の記録になります（朝{boundaryHour}時までは前日に計上）
        </p>
      )}
    </div>
  );
}
