/**
 * 画面共通の小さな部品。
 * モバイル前提なので、押せるものは高さ44px以上（min-h-11）を守る。
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { NUTRIENT_DISPLAY_ORDER, NUTRIENT_LABELS } from "../db/types";
import type { Nutrition } from "../db/types";
import { fmtNum } from "../lib/nutrition";
import { fmtKcalItem } from "../lib/formatKcal";
import { failureText } from "../lib/errors";

const BADGE_TONES = {
  blue: "bg-blue-100 text-blue-800",
  amber: "bg-amber-100 text-amber-900",
  emerald: "bg-emerald-100 text-emerald-800",
  violet: "bg-violet-100 text-violet-800",
  slate: "bg-slate-100 text-slate-600",
  red: "bg-red-100 text-red-800",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * 白い面（角丸・影・余白）。シートやカードの中身をまとめる枠。
 * 要素の種類は as で選ぶ（div / section / details）。足りない余白や並びは className で足す（上書きはしない）。
 */
export function Panel({
  as: Tag = "div",
  className = "",
  children,
}: {
  as?: "div" | "section" | "details";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={`rounded-xl bg-white p-3 shadow-sm${className === "" ? "" : ` ${className}`}`}
    >
      {children}
    </Tag>
  );
}

export function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <Panel as="section">
      {title && (
        <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
          <h2 className="text-sm font-bold text-slate-700">{title}</h2>
        </div>
      )}
      {children}
    </Panel>
  );
}

const NOTICE_TONES = {
  sky: "border-sky-200 bg-sky-50 text-sky-900",
  amber: "border-amber-300 bg-amber-50 text-amber-900",
} as const;

/** 枠つきのお知らせ（小さな文字）。sky は情報、amber は注意 */
export function Notice({
  tone,
  children,
}: {
  tone: keyof typeof NOTICE_TONES;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3 text-xs ${NOTICE_TONES[tone]}`}>
      {children}
    </div>
  );
}

/** 一覧の中身がまだ無いときの表示（中央寄せの 1 行） */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-white p-4 text-center text-sm text-slate-500">
      {children}
    </p>
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
  primary:
    "bg-emerald-600 text-white active:bg-emerald-700 disabled:bg-slate-300",
  secondary:
    "border border-slate-300 bg-white text-slate-700 active:bg-slate-100",
  danger: "border border-red-300 bg-white text-red-700 active:bg-red-50",
  ghost: "text-slate-600 active:bg-slate-100",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
};

export function Button({
  variant = "secondary",
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`min-h-11 rounded-lg px-4 text-sm font-medium ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  );
}

const CHIP_SIZES = {
  md: "px-4 text-sm",
  sm: "text-xs px-3",
} as const;

/** light は白い面の上、dark は濃い背景（画面のヘッダー）の上 */
const CHIP_TONES = {
  light: {
    on: "bg-slate-900 text-white",
    off: "border border-slate-300 bg-white text-slate-600",
  },
  dark: {
    on: "bg-white text-slate-900",
    off: "border border-slate-600 text-slate-300",
  },
} as const;

/**
 * 選択状態を持つチップ（日の区分の切替など）。
 * 大きさ（size）と背景の明るさ（tone）は props で選ぶ。className で上書きはしない
 * （Tailwind は同じ項目のクラスのうち CSS の並びが後のものが勝つので、足しても効くとは限らない）。
 */
export function Chip({
  selected = false,
  size = "md",
  tone = "light",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  size?: keyof typeof CHIP_SIZES;
  tone?: keyof typeof CHIP_TONES;
}) {
  return (
    <button
      type="button"
      {...rest}
      className={`min-h-11 rounded-full ${CHIP_SIZES[size]} font-bold ${
        CHIP_TONES[tone][selected ? "on" : "off"]
      } ${className}`}
    />
  );
}

/**
 * 失敗の表示（赤い本文 + 末尾の小さな理由）。本文は固定の日本語で、何が失敗したか（label）に
 * 「もう一度お試しください。」を続ける（例: 「保存できませんでした。もう一度お試しください。」）。
 * 理由（children。例外のメッセージ）は本文に混ぜず、末尾に小さく添える。
 */
export function ErrorText({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  return (
    <p className="text-sm text-red-700">
      {failureText(label)}
      <ErrorDetail>{children}</ErrorDetail>
    </p>
  );
}

/** 失敗の本文の末尾に添える、例外のメッセージ（開発時の手掛かり。小さい muted の文字）。空なら何も出さない */
export function ErrorDetail({ children }: { children: string }) {
  if (children === "") return null;
  return (
    <span className="mt-0.5 block text-[11px] break-words text-slate-500">
      {children}
    </span>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] leading-relaxed text-slate-500">{children}</p>
  );
}

/** 栄養値の内訳。数量を変えるたびにここがリアルタイムで動く */
export function NutritionGrid({ value }: { value: Nutrition }) {
  const cells = NUTRIENT_DISPLAY_ORDER.map((key) => ({
    label: NUTRIENT_LABELS[key],
    text: key === "kcal" ? fmtKcalItem(value.kcal) : `${fmtNum(value[key])}g`,
  }));
  return (
    <div className="grid grid-cols-5 gap-1 text-center">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-lg bg-slate-100 py-2">
          <div className="text-[10px] text-slate-500">{cell.label}</div>
          <div className="text-sm font-bold tabular-nums text-slate-800">
            {cell.text}
          </div>
        </div>
      ))}
    </div>
  );
}
