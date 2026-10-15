/**
 * 設定タブの「目標の編集」。体組成のグラフに重ねる目標ライン（脂肪量・除脂肪量・期日）を変える。
 * 検証と保存の形は lib/bodyComposition.ts の buildGoalLine、書き込みは db/settings.ts。
 * 期日を変えると、グラフの目標の表示名は期日から作り直す（変えなければ今の表示名のまま）。
 */
import { useState } from "react";
import type { Settings } from "../../db/types";
import { saveGoalLine } from "../../db/settings";
import { Button, Card, ErrorText, Note, Row } from "../../components/ui";
import { Field } from "../../components/Field";
import { NumberInput } from "../../components/NumberInput";
import { buildGoalLine, emptyGoalForm } from "../../lib/bodyComposition";
import type { GoalFormValues } from "../../lib/bodyComposition";
import { formatLogDate } from "../../lib/date";
import { errorMessage, SAVE_FAILED } from "../../lib/errors";
import { formatNumber } from "../../lib/number";
import { FormErrors } from "../body/MeasureFields";

export function GoalCard({ settings }: { settings: Settings }) {
  const goal = settings.goal;
  const [values, setValues] = useState<GoalFormValues | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const open = () => {
    setValues(emptyGoalForm(goal));
    setSubmitted(false);
    setSaveError(null);
    setSaved(false);
  };
  const close = () => setValues(null);

  const result = values === null ? null : buildGoalLine(values, goal);
  const set = (key: keyof GoalFormValues, value: string) =>
    setValues((prev) => (prev === null ? prev : { ...prev, [key]: value }));

  const save = async () => {
    setSubmitted(true);
    if (result === null || result.goal === null) return;
    setBusy(true);
    setSaveError(null);
    try {
      await saveGoalLine(result.goal);
      setValues(null);
      setSaved(true);
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="目標の編集">
      <div className="space-y-3" data-testid="goal-card">
        <dl className="grid grid-cols-1 gap-x-3 text-sm">
          <Row
            label="目標ライン"
            value={`脂肪 ${formatNumber(goal.fatMassKg)}kg / 除脂肪 ${formatNumber(goal.leanMassKg)}kg`}
          />
          <Row
            label="期日"
            value={`${formatLogDate(goal.targetDate)}（${goal.label}）`}
          />
        </dl>
        {values === null ? (
          <>
            {saved && (
              <p className="text-sm text-emerald-700">目標を保存しました。</p>
            )}
            <Button className="w-full" onClick={open}>
              目標ラインを編集する
            </Button>
          </>
        ) : (
          <div className="space-y-3" data-testid="goal-form">
            <div className="grid grid-cols-2 gap-2">
              <Field label="目標の脂肪量" hint="必須">
                <NumberInput
                  value={values.fatMassKg}
                  onChange={(v) => set("fatMassKg", v)}
                  suffix="kg"
                />
              </Field>
              <Field label="目標の除脂肪量" hint="必須">
                <NumberInput
                  value={values.leanMassKg}
                  onChange={(v) => set("leanMassKg", v)}
                  suffix="kg"
                />
              </Field>
            </div>
            <Field label="期日" hint="必須">
              <input
                type="date"
                value={values.targetDate}
                onChange={(e) => set("targetDate", e.target.value)}
                className="h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base tabular-nums"
              />
            </Field>
            {submitted && result !== null && (
              <FormErrors errors={result.errors} />
            )}
            {saveError && (
              <ErrorText label={SAVE_FAILED}>{saveError}</ErrorText>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={close}>
                やめる
              </Button>
              <Button
                variant="primary"
                className="flex-[2] font-bold"
                disabled={busy}
                onClick={() => void save()}
              >
                保存する
              </Button>
            </div>
          </div>
        )}
        <Note>
          からだタブの脂肪量・除脂肪量のグラフに、この値を破線で重ねます。
        </Note>
      </div>
    </Card>
  );
}
