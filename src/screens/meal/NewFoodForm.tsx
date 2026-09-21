/**
 * 新規食品の簡易登録（F3 の最小版）。
 * 店頭で栄養成分表示を見ながら打つ前提なので、入力欄は必要最小限にする。
 *
 * 入力は「ラベルの表記そのまま」。保存時に1単位あたりへ正規化し、
 * 元の表記は Food.basis に残す。空欄は 0 ではなく null（未確認）として保存する。
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Food, FoodCategory } from '../../db/types';
import { FOOD_CATEGORIES } from '../../db/types';
import { db } from '../../db/db';
import { Sheet } from '../../components/Sheet';
import { Badge, Button, Chip, NutritionGrid, Note } from '../../components/ui';
import { BASIS_OPTIONS, NUTRIENT_FIELDS, buildFood, emptyFoodForm } from '../../lib/foodForm';
import type { BasisKind, FoodFormValues } from '../../lib/foodForm';

export function NewFoodForm({
  initialName,
  onSaved,
  onBack,
  onClose,
}: {
  initialName: string;
  onSaved: (food: Food) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<FoodFormValues>(() => emptyFoodForm(initialName));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const result = useMemo(() => buildFood(values), [values]);
  const set = <K extends keyof FoodFormValues>(key: K, value: FoodFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSubmitted(true);
    if (!result.food) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = (await db.foods.add(result.food as Food)) as number;
      onSaved({ ...(result.food as Food), id });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const needsGrams = values.basisKind !== 'unit';

  return (
    <Sheet
      title="新しい食品を登録"
      subtitle="ラベルの表記のまま入れてください"
      onBack={onBack}
      onClose={onClose}
      footer={
        <Button variant="primary" className="h-14 w-full text-base" disabled={saving} onClick={save}>
          登録して数量へ
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <Field label="名前">
            <input
              type="text"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              className="h-12 w-full rounded-lg border border-slate-300 px-3 text-base"
            />
          </Field>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="カテゴリ">
              <select
                value={values.category}
                onChange={(e) => set('category', e.target.value as FoodCategory)}
                className="h-12 w-full rounded-lg border border-slate-300 bg-white px-2 text-base"
              >
                {FOOD_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="単位ラベル" hint="記録するときの1回分">
              <input
                type="text"
                value={values.unitLabel}
                onChange={(e) => set('unitLabel', e.target.value)}
                placeholder="1個"
                className="h-12 w-full rounded-lg border border-slate-300 px-3 text-base"
              />
            </Field>
          </div>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="text-xs font-bold text-slate-600">表記の基準</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {BASIS_OPTIONS.map((option) => (
              <Chip
                key={option.kind}
                selected={values.basisKind === option.kind}
                onClick={() => set('basisKind', option.kind as BasisKind)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          {needsGrams && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="1単位のグラム数" hint="必須">
                <NumberInput value={values.gramsPerUnit} onChange={(v) => set('gramsPerUnit', v)} suffix="g" />
              </Field>
              {values.basisKind === 'bag' && (
                <Field label="1袋のグラム数" hint="必須">
                  <NumberInput value={values.bagGrams} onChange={(v) => set('bagGrams', v)} suffix="g" />
                </Field>
              )}
            </div>
          )}
          {!needsGrams && (
            <div className="mt-3">
              <Field label="1単位のグラム数" hint="分かれば（任意）">
                <NumberInput value={values.gramsPerUnit} onChange={(v) => set('gramsPerUnit', v)} suffix="g" />
              </Field>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="text-xs font-bold text-slate-600">
            栄養成分（{result.basisLabel}）
          </p>
          <Note>空欄のままにすると「未確認」として保存します。0 にはしません。</Note>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {NUTRIENT_FIELDS.map((field) => (
              <Field key={field.key} label={field.label}>
                <NumberInput
                  value={values[field.key]}
                  onChange={(v) => set(field.key, v)}
                  suffix={field.unit}
                />
              </Field>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip selected={values.source === 'label'} onClick={() => set('source', 'label')}>
              ラベル実測値
            </Chip>
            <Chip selected={values.source === 'estimated'} onClick={() => set('source', 'estimated')}>
              推定値
            </Chip>
          </div>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-bold text-slate-600">
              保存する値（{values.unitLabel || '1単位'} あたり）
            </p>
            {result.unitsPerBasis !== null && result.unitsPerBasis !== 1 && (
              <Badge tone="blue">÷{Math.round(result.unitsPerBasis * 1000) / 1000} で換算</Badge>
            )}
          </div>
          <NutritionGrid value={result.preview} />
        </div>

        {submitted && result.errors.length > 0 && (
          <ul className="list-disc space-y-1 rounded-xl bg-red-50 p-3 pl-7 text-sm text-red-800">
            {result.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        {saveError && <p className="text-sm text-red-700">保存できませんでした: {saveError}</p>}
      </div>
    </Sheet>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-slate-600">
        {label}
        {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  suffix,
}: {
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base tabular-nums"
      />
      {suffix && <span className="shrink-0 text-xs text-slate-500">{suffix}</span>}
    </span>
  );
}
