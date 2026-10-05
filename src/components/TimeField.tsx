/**
 * 時刻の入力。既定は現在時刻。
 * 0〜4時は前日の記録になるので、行き先の論理日付を明示する
 * （「01:30 → 9/20（日） の記録になります」）。
 * 空にされたときは日付の案内を出さず、保存できない理由を出す
 * （保存ボタンを止めるのは呼ぶ側。lib/date.ts の hasTime で判定する）。
 */
import { formatLogDateShort, hasTime, isoDateTimeIn, toLogDate } from '../lib/date';
import type { LogDate } from '../db/types';

export function TimeField({
  value,
  onChange,
  logDate,
  boundaryHour,
  label = '時刻',
  required = true,
}: {
  value: string;
  onChange: (value: string) => void;
  logDate: LogDate;
  boundaryHour: number;
  label?: string;
  /** false のときは空でも理由を出さない（空の時刻が使われない場合） */
  required?: boolean;
}) {
  const filled = hasTime(value);
  const hour = Number(value.slice(0, 2));
  const beforeBoundary = filled && hour < boundaryHour;
  const destination = filled ? toLogDate(isoDateTimeIn(logDate, value, boundaryHour), boundaryHour) : null;

  return (
    <div>
      <label className="block">
        <span className="block text-xs font-bold text-slate-600">{label}</span>
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!filled && required}
          className={`mt-1 h-14 w-full rounded-lg border bg-white px-3 text-xl tabular-nums ${
            !filled && required ? 'border-red-400' : 'border-slate-300'
          }`}
        />
      </label>
      {beforeBoundary && destination !== null && (
        <p className="mt-1 text-xs text-sky-700">
          {value} → {formatLogDateShort(destination)} の記録になります（朝{boundaryHour}時までは前日に計上）
        </p>
      )}
      {!filled && required && (
        <p className="mt-1 text-xs text-red-700">時刻を入れてください。時刻が空のままでは保存できません。</p>
      )}
    </div>
  );
}
