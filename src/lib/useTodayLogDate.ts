/**
 * 現在時刻の論理日付（「今日」）。1分ごとに評価し直すので、
 * 画面を開いたまま朝4時をまたぐと自動で翌日に切り替わる。
 */
import { useEffect, useState } from "react";
import type { LogDate } from "../db/types";
import { DAY_BOUNDARY_HOUR, todayLogDate } from "./date";

export function useTodayLogDate(
  boundaryHour: number = DAY_BOUNDARY_HOUR,
): LogDate {
  const [logDate, setLogDate] = useState<LogDate>(() =>
    todayLogDate(boundaryHour),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setLogDate((prev) => {
        const next = todayLogDate(boundaryHour);
        return next === prev ? prev : next;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, [boundaryHour]);

  return logDate;
}
