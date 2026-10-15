/**
 * 体組成: 記録ボタン（開くとフォーム）・機種ごとの推移・一覧（新しい順）。
 */
import { useState } from "react";
import type { Settings } from "../../db/types";
import { Button, Card, EmptyState, Note } from "../../components/ui";
import { TrendChart } from "../../components/TrendChart";
import {
  BODY_METRICS,
  bodyTrend,
  groupByDevice,
  sortNewestFirst,
} from "../../lib/bodyComposition";
import { useAllTrainingSessions, useBodyCompositions } from "../../lib/queries";
import { BodyForm } from "./BodyForm";
import { BodyList } from "./BodyList";

export function BodySection({ settings }: { settings: Settings }) {
  const bodies = useBodyCompositions();
  const sessions = useAllTrainingSessions();
  const [formOpen, setFormOpen] = useState(false);

  if (bodies === undefined || sessions === undefined) return null;

  const newestFirst = sortNewestFirst(bodies);
  const groups = groupByDevice(bodies);

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
                  <TrendChart
                    key={metric.key}
                    title={trend.title}
                    legend="● 条件よし ○ 条件が悪い"
                    unit={trend.unit}
                    points={trend.points}
                    reference={trend.reference}
                    testId={`body-chart-${metric.key}`}
                    padRight={56}
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

      {newestFirst.length > 0 && <BodyList rows={newestFirst} />}
    </>
  );
}
