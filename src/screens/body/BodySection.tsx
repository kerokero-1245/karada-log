/**
 * 体組成: 記録ボタン（開くとフォーム）・機種ごとの推移・一覧（新しい順）。
 * 推移と一覧の「最後のトレからの日数」と印は、今のトレの記録から計算し直したもの（withCurrentConditions）。
 */
import { useState } from "react";
import type { Settings } from "../../db/types";
import { Button, Card, EmptyState, Note } from "../../components/ui";
import {
  BODY_METRICS,
  bodyTrend,
  groupByDevice,
  sortNewestFirst,
  withCurrentConditions,
} from "../../lib/bodyComposition";
import { useAllTrainingSessions, useBodyCompositions } from "../../lib/queries";
import { BodyForm } from "./BodyForm";
import { BodyList } from "./BodyList";
import { BodyTrendChart } from "./BodyTrendChart";

export function BodySection({
  settings,
  onDirtyChange,
}: {
  settings: Settings;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const bodies = useBodyCompositions();
  const sessions = useAllTrainingSessions();
  const [formOpen, setFormOpen] = useState(false);

  if (bodies === undefined || sessions === undefined) return null;

  const current = withCurrentConditions(
    bodies,
    sessions,
    settings.measurementMinRestDays,
  );
  const newestFirst = sortNewestFirst(current);
  const groups = groupByDevice(current);

  return (
    <>
      {formOpen ? (
        <BodyForm
          key="form"
          sessions={sessions}
          last={newestFirst[0] ?? null}
          devices={groups.map((g) => g.device)}
          minRestDays={settings.measurementMinRestDays}
          onClose={() => setFormOpen(false)}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <Button
          variant="primary"
          className="h-12 w-full font-bold"
          onClick={() => setFormOpen(true)}
        >
          体組成の測定を記録する
        </Button>
      )}

      {groups.length === 0 ? (
        <EmptyState>まだ体組成の記録がありません。</EmptyState>
      ) : (
        groups.map((group) => (
          <Card key={group.device} title={`推移（${group.device}）`}>
            <div className="space-y-3" data-testid="body-trend">
              {BODY_METRICS.map((metric) => {
                const trend = bodyTrend(group.rows, metric.key, settings.goal);
                return trend.points.length === 0 ? (
                  <p key={metric.key} className="text-xs text-slate-500">
                    {metric.label}の記録がまだありません。
                  </p>
                ) : (
                  <BodyTrendChart
                    key={metric.key}
                    trend={trend}
                    testId={`body-chart-${metric.key}`}
                  />
                );
              })}
            </div>
            <Note>
              この機種の測定だけを並べています。目標ラインは設定の値です。
            </Note>
          </Card>
        ))
      )}

      {newestFirst.length > 0 && (
        <BodyList rows={newestFirst} sessions={sessions} />
      )}
    </>
  );
}
