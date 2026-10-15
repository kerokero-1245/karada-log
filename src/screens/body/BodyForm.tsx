/**
 * 体組成の記録フォーム。
 * 空欄は「未確認」として null で保存する（0 にしない）。必須は 測定日時・機種・脂肪量・除脂肪量。
 * 測定日時は空で開く（今の時刻を既定にしない。トレの後に記録すると 0 日として印が付いてしまうため）。
 * 値どうしが合わないとき（取り違えなど）は確かめを出すが、保存は止めない。
 * 入力があるかどうかを onDirtyChange で知らせる（タブや表示の切り替えの前に確認するため）。
 * 最後のトレからの日数は、入力中の測定日時とトレーニングの記録から計算して出す（lib/measurement.ts）。
 * 条件が悪くても保存は止めない（印を付けて残す）。
 */
import { useEffect, useState } from "react";
import type { BodyComposition, TrainingSession } from "../../db/types";
import { SEGMENT_KEYS, SEGMENT_LABELS } from "../../db/types";
import { addBodyComposition } from "../../db/body";
import { Button, Card, ErrorText, Notice, Note } from "../../components/ui";
import { Field } from "../../components/Field";
import { NumberInput } from "../../components/NumberInput";
import {
  BODY_MAIN_FIELDS,
  MEAL_HOURS_RULE,
  SALT_RULE,
  SEGMENT_FIELDS,
  buildBodyComposition,
  daysSinceTrainingText,
  emptyBodyForm,
  isFormChanged,
  isPoorCondition,
  trainingStartNote,
} from "../../lib/bodyComposition";
import type {
  BodyFormValues,
  SegmentFieldKey,
} from "../../lib/bodyComposition";
import { formatDateTime } from "../../lib/date";
import { errorMessage, SAVE_FAILED } from "../../lib/errors";
import { FormErrors, MeasureFields, NoteField } from "./MeasureFields";

export function BodyForm({
  sessions,
  last,
  devices,
  minRestDays,
  onClose,
  onDirtyChange,
}: {
  sessions: TrainingSession[];
  last: BodyComposition | null;
  devices: string[];
  minRestDays: number;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [initial] = useState<BodyFormValues>(() => emptyBodyForm(last));
  const [values, setValues] = useState<BodyFormValues>(initial);
  const dirty = isFormChanged(initial, values);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const result = buildBodyComposition(values, sessions, { minRestDays });
  const set = <K extends keyof BodyFormValues>(
    key: K,
    value: BodyFormValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));
  const setSegment = (
    segment: (typeof SEGMENT_KEYS)[number],
    field: SegmentFieldKey,
    value: string,
  ) =>
    setValues((prev) => ({
      ...prev,
      segments: {
        ...prev.segments,
        [segment]: { ...prev.segments[segment], [field]: value },
      },
    }));

  const save = async () => {
    setSubmitted(true);
    if (result.record === null) return;
    setBusy(true);
    setSaveError(null);
    try {
      await addBodyComposition(result.record);
      onClose();
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const { conditions, warnings, checks } = result;
  const poor = isPoorCondition({ warnings });

  return (
    <Card title="体組成を記録する">
      <div className="space-y-4" data-testid="body-form">
        <MeasureFields
          idPrefix="body"
          measuredAt={values.measuredAt}
          place={values.place}
          device={values.device}
          devices={devices}
          onChange={(key, value) => set(key, value)}
        />

        <section>
          <h3 className="text-xs font-bold text-slate-600">主な項目</h3>
          <Note>
            空欄のままにすると「未確認」として保存します。0
            にはしません。四肢骨格筋量は腕と脚の筋肉量の合計で、機種の表示どおりに入れます。
          </Note>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {BODY_MAIN_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                hint={field.required ? "必須" : undefined}
              >
                <NumberInput
                  value={values[field.key]}
                  onChange={(v) => set(field.key, v)}
                  suffix={field.unit === "" ? " " : field.unit}
                />
              </Field>
            ))}
          </div>
        </section>

        {checks.length > 0 && (
          <div data-testid="body-checks">
            <Notice tone="amber">
              <p className="font-bold">
                値を確かめてください（このままでも保存できます）
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {checks.map((check) => (
                  <li key={check}>・{check}</li>
                ))}
              </ul>
            </Notice>
          </div>
        )}

        <section>
          <h3 className="text-xs font-bold text-slate-600">部位別</h3>
          <table className="mt-1 w-full table-fixed text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="w-14 text-left font-normal">部位</th>
                {SEGMENT_FIELDS.map((field) => (
                  <th key={field.key} className="px-0.5 font-normal">
                    {field.label}（{field.unit}）
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SEGMENT_KEYS.map((segment) => (
                <tr key={segment}>
                  <th className="text-left font-bold text-slate-600">
                    {SEGMENT_LABELS[segment]}
                  </th>
                  {SEGMENT_FIELDS.map((field) => (
                    <td key={field.key} className="px-0.5 py-0.5">
                      <NumberInput
                        value={values.segments[segment][field.key]}
                        onChange={(v) => setSegment(segment, field.key, v)}
                        label={`${SEGMENT_LABELS[segment]}の${field.label}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="text-xs font-bold text-slate-600">測定条件</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label={SALT_RULE.label}>
              <NumberInput
                value={values.previousDaySaltG}
                onChange={(v) => set("previousDaySaltG", v)}
                suffix={SALT_RULE.unit}
              />
            </Field>
            <Field label={MEAL_HOURS_RULE.label}>
              <NumberInput
                value={values.hoursSinceLastMeal}
                onChange={(v) => set("hoursSinceLastMeal", v)}
                suffix={MEAL_HOURS_RULE.unit}
              />
            </Field>
          </div>
          <p
            className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-700"
            data-testid="days-since-training"
          >
            最後のトレから{" "}
            <b className="tabular-nums">
              {daysSinceTrainingText(
                values.measuredAt,
                conditions.daysSinceLastTraining,
              )}
            </b>
            {conditions.lastTrainingAt !== null && (
              <span className="ml-1 text-xs text-slate-500">
                （{formatDateTime(conditions.lastTrainingAt)} のトレ
                {trainingStartNote(sessions, values.measuredAt)}
                。測定より後のトレは数えません）
              </span>
            )}
          </p>
          {warnings.length > 0 && (
            <div className="mt-2">
              <Notice tone={poor ? "amber" : "sky"}>
                {poor && (
                  <p className="font-bold">
                    条件が悪い測定として印を付けて保存します
                  </p>
                )}
                <ul className="mt-0.5 space-y-0.5">
                  {warnings.map((w) => (
                    <li key={w.code}>・{w.message}</li>
                  ))}
                </ul>
              </Notice>
            </div>
          )}
        </section>

        <NoteField value={values.note} onChange={(v) => set("note", v)} />

        {submitted && <FormErrors errors={result.errors} />}
        {saveError && <ErrorText label={SAVE_FAILED}>{saveError}</ErrorText>}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClose}>
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
    </Card>
  );
}
