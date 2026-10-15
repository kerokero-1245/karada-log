/**
 * 骨密度: 記録ボタン（開くとフォーム）と一覧（新しい順）。
 * 体組成とは機種も測り方も違うので別に持つ。減量中は下がりやすいので経過を追う。
 */
import { useState } from "react";
import type { BoneDensity } from "../../db/types";
import { addBoneDensity, deleteBoneDensity } from "../../db/body";
import { Button, Card, EmptyState, ErrorText, Note } from "../../components/ui";
import { Field } from "../../components/Field";
import { NumberInput } from "../../components/NumberInput";
import {
  BONE_FIELDS,
  buildBoneDensity,
  emptyBoneForm,
  formatMeasure,
  sortNewestFirst,
} from "../../lib/bodyComposition";
import type { BoneFormValues } from "../../lib/bodyComposition";
import { formatDateTime, nowIso } from "../../lib/date";
import { errorMessage, SAVE_FAILED } from "../../lib/errors";
import { UNKNOWN_MARK } from "../../lib/format";
import { useBoneDensities } from "../../lib/queries";
import { FormErrors, MeasureFields, NoteField } from "./MeasureFields";

export function BoneSection() {
  const bones = useBoneDensities();
  const [formOpen, setFormOpen] = useState(false);
  if (bones === undefined) return null;
  const newestFirst = sortNewestFirst(bones);
  const devices = [...new Set(bones.map((b) => b.device.trim()))];

  return (
    <>
      {formOpen ? (
        <BoneForm
          last={newestFirst[0] ?? null}
          devices={devices}
          onClose={() => setFormOpen(false)}
        />
      ) : (
        <Button
          variant="primary"
          className="h-12 w-full font-bold"
          onClick={() => setFormOpen(true)}
        >
          骨密度の測定を記録する
        </Button>
      )}
      {newestFirst.length === 0 ? (
        <EmptyState>まだ骨密度の記録がありません。</EmptyState>
      ) : (
        <BoneList rows={newestFirst} />
      )}
    </>
  );
}

function BoneForm({
  last,
  devices,
  onClose,
}: {
  last: BoneDensity | null;
  devices: string[];
  onClose: () => void;
}) {
  const [values, setValues] = useState<BoneFormValues>(() =>
    emptyBoneForm(nowIso(), last),
  );
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const result = buildBoneDensity(values);
  const set = (key: keyof BoneFormValues, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSubmitted(true);
    if (result.record === null) return;
    setBusy(true);
    setSaveError(null);
    try {
      await addBoneDensity(result.record);
      onClose();
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="骨密度を記録する">
      <div className="space-y-4" data-testid="bone-form">
        <MeasureFields
          idPrefix="bone"
          measuredAt={values.measuredAt}
          place={values.place}
          device={values.device}
          devices={devices}
          onChange={set}
        />
        <div className="grid grid-cols-2 gap-2">
          {BONE_FIELDS.map((field) => (
            <Field key={field.key} label={field.label}>
              <NumberInput
                value={values[field.key]}
                onChange={(v) => set(field.key, v)}
                suffix={field.unit === "m/sec" ? "m/s" : field.unit}
              />
            </Field>
          ))}
          <Field label="判定ランク">
            <input
              type="text"
              value={values.rank}
              onChange={(e) => set("rank", e.target.value)}
              placeholder="A / B / C"
              className="h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base"
            />
          </Field>
        </div>
        <Note>
          空欄のままにすると「未確認」として保存します。0
          にはしません。%YAMは若い成人の平均と比べた割合、%AGEは同じ年代の平均と比べた割合です。
        </Note>
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

function BoneList({ rows }: { rows: BoneDensity[] }) {
  const [error, setError] = useState<string | null>(null);
  const remove = async (row: BoneDensity) => {
    if (row.id === undefined) return;
    if (
      !window.confirm(
        `${formatDateTime(row.measuredAt)} の測定を削除しますか？`,
      )
    )
      return;
    setError(null);
    try {
      await deleteBoneDensity(row.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Card title="測定の一覧（新しい順）">
      {error && <ErrorText label="削除できませんでした">{error}</ErrorText>}
      <ul className="divide-y divide-slate-100" data-testid="bone-list">
        {rows.map((row) => (
          <li key={row.id} className="py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold tabular-nums text-slate-800">
                {formatDateTime(row.measuredAt)}
              </span>
              <span className="text-sm font-bold text-slate-700">
                ランク {row.rank === "" ? UNKNOWN_MARK : row.rank}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {[row.device, row.place].filter((s) => s !== "").join(" ・ ")}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-sm tabular-nums text-slate-700">
              {BONE_FIELDS.map((field) => (
                <span key={field.key}>
                  {field.label}{" "}
                  <b>
                    {formatMeasure(
                      row[field.key],
                      field.unit === "%" ? "%" : ` ${field.unit}`,
                    )}
                  </b>
                </span>
              ))}
            </p>
            {row.note !== "" && (
              <p className="mt-0.5 text-xs text-slate-500">{row.note}</p>
            )}
            <button
              type="button"
              onClick={() => void remove(row)}
              className="min-h-11 rounded-lg px-2 text-xs text-slate-500 active:bg-slate-100"
            >
              この測定を削除する
            </button>
          </li>
        ))}
      </ul>
      <Note>機種が違う測定は値を並べて比べないでください。</Note>
    </Card>
  );
}
