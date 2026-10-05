/**
 * 画面共通の小さな部品。
 * モバイル前提なので、押せるものは高さ44px以上（min-h-11）を守る。
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Nutrition } from '../db/types';
import { fmtNum } from '../lib/nutrition';
import { fmtKcalItem } from '../lib/formatKcal';

const BADGE_TONES = {
  blue: 'bg-blue-100 text-blue-800',
  amber: 'bg-amber-100 text-amber-900',
  emerald: 'bg-emerald-100 text-emerald-800',
  violet: 'bg-violet-100 text-violet-800',
  slate: 'bg-slate-100 text-slate-600',
  red: 'bg-red-100 text-red-800',
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Card({
  title,
  right,
  children,
  className = '',
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl bg-white p-3 shadow-sm ${className}`}>
      {title && (
        <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
          <h2 className="text-sm font-bold text-slate-700">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-100 py-0.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

const BUTTON_VARIANTS = {
  primary: 'bg-emerald-600 text-white active:bg-emerald-700 disabled:bg-slate-300',
  secondary: 'border border-slate-300 bg-white text-slate-700 active:bg-slate-100',
  danger: 'border border-red-300 bg-white text-red-700 active:bg-red-50',
  ghost: 'text-slate-600 active:bg-slate-100',
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
};

export function Button({ variant = 'secondary', className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`min-h-11 rounded-lg px-4 text-sm font-medium ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  );
}

/** 選択状態を持つチップ（日の区分の切替など） */
export function Chip({
  selected = false,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={`min-h-11 rounded-full px-4 text-sm font-bold ${
        selected ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-600'
      } ${className}`}
    />
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-slate-500">{children}</p>;
}

/** 栄養値の内訳。数量を変えるたびにここがリアルタイムで動く */
export function NutritionGrid({ value }: { value: Nutrition }) {
  const cells: { label: string; text: string }[] = [
    { label: 'kcal', text: fmtKcalItem(value.kcal) },
    { label: 'P', text: `${fmtNum(value.proteinG)}g` },
    { label: '脂質', text: `${fmtNum(value.fatG)}g` },
    { label: '塩分', text: `${fmtNum(value.saltG)}g` },
    { label: '炭水', text: `${fmtNum(value.carbG)}g` },
  ];
  return (
    <div className="grid grid-cols-5 gap-1 text-center">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-lg bg-slate-100 py-2">
          <div className="text-[10px] text-slate-500">{cell.label}</div>
          <div className="text-sm font-bold tabular-nums text-slate-800">{cell.text}</div>
        </div>
      ))}
    </div>
  );
}
