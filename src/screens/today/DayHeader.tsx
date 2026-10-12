/**
 * 日付・曜日・今日の区分。
 * 区分はチップをタップで手動切替。手動にしたときだけ「自動判定に戻す」を出す。
 */
import type { DayType, LogDate } from "../../db/types";
import { DAY_TYPE_LABELS } from "../../db/types";
import { formatLogDate } from "../../lib/date";
import { fmtKcal } from "../../lib/formatKcal";
import { ScreenHeader } from "../../components/ScreenHeader";
import { Chip } from "../../components/ui";

/** 区分のチップを並べる順 */
const DAY_TYPES: DayType[] = ["rest", "gym"];

export function DayHeader({
  logDate,
  dayType,
  source,
  targetKcal,
  trainingCount,
  boundaryHour,
  onSelect,
  onReset,
}: {
  logDate: LogDate;
  dayType: DayType;
  source: "auto" | "manual";
  targetKcal: number;
  trainingCount: number;
  /** 1 日の区切り（Settings.dayBoundaryHour）。「朝○時から翌朝○時まで」の文言に使う */
  boundaryHour: number;
  onSelect: (dayType: DayType) => void;
  onReset: () => void;
}) {
  return (
    <ScreenHeader>
      <p className="text-xs text-slate-300">
        {`今日（朝${boundaryHour}時から翌朝${boundaryHour}時まで）`}
      </p>
      <h1 className="text-2xl font-bold tracking-wide">
        {formatLogDate(logDate)}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {DAY_TYPES.map((type) => {
          return (
            <Chip
              key={type}
              tone="dark"
              selected={type === dayType}
              aria-pressed={type === dayType}
              onClick={() => onSelect(type)}
            >
              {DAY_TYPE_LABELS[type]}
            </Chip>
          );
        })}
        <span className="text-sm text-slate-300">
          目標 {fmtKcal(targetKcal)} kcal
        </span>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        {source === "manual" ? (
          <>
            手動で「{DAY_TYPE_LABELS[dayType]}」にしています。
            <button
              type="button"
              onClick={onReset}
              className="ml-1 underline underline-offset-2"
            >
              自動判定に戻す
            </button>
          </>
        ) : trainingCount > 0 ? (
          "トレーニングの記録があるので、自動で「ジムの日」にしています。"
        ) : (
          "トレーニングの記録がないので「休養日」。記録すると自動で「ジムの日」になります。"
        )}
      </p>
    </ScreenHeader>
  );
}
