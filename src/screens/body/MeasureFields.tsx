/**
 * 体組成・骨密度のフォームで共通の欄（測定日時・場所・機種）。
 * 機種は前回の値を引き継ぎ、これまでの機種を候補に出す（グループ分けのキーなので表記ゆれを作らない）。
 */
import { Field } from "../../components/Field";

const TEXT_INPUT =
  "h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base";

export function MeasureFields({
  idPrefix,
  measuredAt,
  place,
  device,
  devices,
  onChange,
}: {
  idPrefix: string;
  measuredAt: string;
  place: string;
  device: string;
  devices: string[];
  onChange: (key: "measuredAt" | "place" | "device", value: string) => void;
}) {
  const listId = `${idPrefix}-devices`;
  return (
    <div className="space-y-3">
      <Field label="測定日時" hint="必須">
        <input
          type="datetime-local"
          value={measuredAt}
          onChange={(e) => onChange("measuredAt", e.target.value)}
          className={`${TEXT_INPUT} tabular-nums`}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="機種" hint="必須">
          <input
            type="text"
            value={device}
            list={listId}
            onChange={(e) => onChange("device", e.target.value)}
            placeholder="TANITA MC-980"
            className={TEXT_INPUT}
          />
          <datalist id={listId}>
            {devices.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>
        <Field label="場所">
          <input
            type="text"
            value={place}
            onChange={(e) => onChange("place", e.target.value)}
            className={TEXT_INPUT}
          />
        </Field>
      </div>
    </div>
  );
}

/** 保存できない理由の一覧（保存を押した後だけ出す） */
export function FormErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul className="list-disc space-y-1 rounded-xl bg-red-50 p-3 pl-7 text-sm text-red-800">
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

/** メモ欄 */
export function NoteField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-600">メモ</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
      />
    </label>
  );
}
