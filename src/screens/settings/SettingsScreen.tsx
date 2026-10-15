/**
 * 「設定」タブ。
 * 目標値は読み取り専用で表示する。体組成の目標ラインだけは「目標の編集」（GoalCard）で変えられる。
 * 旧 App.tsx の確認ページは <details>「データ確認（開発用）」（DevDataSection）として残してある。
 */
import type { Settings } from "../../db/types";
import { DAY_TYPE_LABELS, NUTRIENT_NAMES } from "../../db/types";
import { Card, Note, Row } from "../../components/ui";
import { ScreenHeader } from "../../components/ScreenHeader";
import { ScreenLayout } from "../../components/ScreenLayout";
import { formatLogDate } from "../../lib/date";
import { UNKNOWN_MARK, fmtStored } from "../../lib/format";
import { DevDataSection } from "../dev/DevDataSection";
import { ApiKeyCard } from "./ApiKeyCard";
import { ExportCard } from "./ExportCard";
import { GoalCard } from "./GoalCard";
import { ImportCard } from "./ImportCard";
import { RestoreCard } from "./RestoreCard";

export function SettingsScreen({ settings }: { settings: Settings }) {
  return (
    <ScreenLayout
      header={
        <ScreenHeader>
          <h1 className="text-xl font-bold">設定</h1>
          <p className="mt-1 text-xs text-slate-300">
            データはこの端末の中だけに保存されます。
          </p>
        </ScreenHeader>
      }
    >
      <Card title="目標値">
        <dl className="grid grid-cols-1 gap-x-3 text-sm">
          <Row
            label="基礎代謝（下限）"
            value={`${fmtStored(settings.bmrKcal)} kcal`}
          />
          <Row
            label={DAY_TYPE_LABELS.rest}
            value={`${fmtStored(settings.restDayKcal)} kcal`}
          />
          <Row
            label={DAY_TYPE_LABELS.gym}
            value={`${fmtStored(settings.gymDayKcal)} kcal`}
          />
          <Row
            label={NUTRIENT_NAMES.proteinG}
            value={`目標 ${settings.proteinTargetG}g / 上限 ${settings.proteinCapG}g`}
          />
          <Row label={NUTRIENT_NAMES.fatG} value={`${settings.fatTargetG} g`} />
          <Row
            label={NUTRIENT_NAMES.saltG}
            value={`${settings.saltLimitG}g以内 / 週平均${settings.weeklySaltAverageG}g`}
          />
          <Row
            label="週合計"
            value={`${fmtStored(settings.weeklyKcalTarget)} ± ${fmtStored(settings.weeklyKcalTolerance)} kcal`}
          />
          <Row label="日付の境界" value={`朝${settings.dayBoundaryHour}時`} />
          <Row
            label="週の起点"
            value={
              settings.weekStartsOn === 1
                ? "月曜"
                : String(settings.weekStartsOn)
            }
          />
          <Row
            label="次回測定日"
            value={
              settings.nextMeasurementDate
                ? formatLogDate(settings.nextMeasurementDate)
                : UNKNOWN_MARK
            }
          />
          <Row
            label="目標ライン"
            value={`脂肪 ${settings.goal.fatMassKg}kg / 除脂肪 ${settings.goal.leanMassKg}kg`}
          />
        </dl>
        <Note>
          目標ラインは下の「目標の編集」で変えられます。ほかの値の編集はまだできません。ダッシュボードの目標はここの値を読んでいます。
        </Note>
      </Card>

      <GoalCard settings={settings} />

      <ApiKeyCard settings={settings} />

      <ExportCard settings={settings} />

      <ImportCard settings={settings} />

      <RestoreCard />

      <DevDataSection />
    </ScreenLayout>
  );
}
