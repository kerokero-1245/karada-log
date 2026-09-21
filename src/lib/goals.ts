/**
 * 目標値と進捗バーのモデル。
 *
 * 文言のルール（app-spec-prompt.md「トーンに関する要求」）:
 *  - 「失敗」「違反」「未達」「不足」「超過」「オーバー」は使わない
 *  - 足りていない分は残量（あと○）で示す
 *  - カロリー・P・脂質は下限型。届いていなければ黄色、達成で緑。
 *    目標を上回ったら「目標に到達（+○）」とだけ言う
 *  - P の上限152gは警告しない。超えた分をグレーにして
 *    「これ以上は使われません」とだけ示す（handover: 害はないがカロリーが無駄になる）
 *  - 塩分だけ上限型。上限を超えたら赤。「上限まで あと ○g」/「上限まで -○g」
 */
import type { DayType, NutrientKey, Settings } from '../db/types';
import type { NutritionTotal } from './nutrition';

export type BarTone = 'amber' | 'emerald' | 'sky' | 'red';

export interface BarSegment {
  widthPercent: number;
  className: string;
}

export interface BarMarker {
  percent: number;
  label: string;
}

export interface BarModel {
  key: NutrientKey;
  label: string;
  unit: string;
  kind: 'floor' | 'cap';
  current: number;
  target: number;
  /** P の上限152g。他は null */
  cap: number | null;
  /** 栄養値が未入力（null）で合計に入れられなかった件数 */
  unknownCount: number;
  /** '501 / 2,050 kcal' */
  valueText: string;
  /** 'あと 1,549kcal' / '目標に到達（+30kcal）' / '上限まで あと 5.84g' */
  remainText: string;
  /** バーのマーカーの説明。'目標 140g ／ 上限 152g' */
  legendText: string | null;
  /** グレー部分の説明。警告ではない */
  noteText: string | null;
  tone: BarTone;
  segments: BarSegment[];
  markers: BarMarker[];
}

const TONE_TEXT_CLASS: Record<BarTone, string> = {
  amber: 'text-amber-700',
  emerald: 'text-emerald-700',
  sky: 'text-sky-700',
  red: 'text-red-700',
};

export function toneTextClass(tone: BarTone): string {
  return TONE_TEXT_CLASS[tone];
}

/** その日のカロリー目標。ハードコードせず Settings から読む */
export function dayTargetKcal(settings: Settings, dayType: DayType): number {
  return dayType === 'gym' ? settings.gymDayKcal : settings.restDayKcal;
}

/**
 * 表示桁。kcal は整数＋桁区切り、塩分は小数2桁（2.16 のような値を丸めない）、
 * それ以外は小数1桁。末尾の 0 は落とす（140.0 → 140）。
 */
export function formatAmount(key: NutrientKey, value: number): string {
  if (key === 'kcal') return Math.round(value).toLocaleString('ja-JP');
  const fixed = key === 'saltG' ? value.toFixed(2) : value.toFixed(1);
  return trimZeros(fixed);
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

function clamp(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
}

/** 4本のバー。カロリー / たんぱく質 / 脂質 / 塩分 */
export function buildBars(total: NutritionTotal, settings: Settings, dayType: DayType): BarModel[] {
  return [
    floorBar('kcal', 'カロリー', 'kcal', total.value.kcal ?? 0, dayTargetKcal(settings, dayType), null, total.unknown.kcal),
    floorBar(
      'proteinG',
      'たんぱく質',
      'g',
      total.value.proteinG ?? 0,
      settings.proteinTargetG,
      settings.proteinCapG,
      total.unknown.proteinG,
    ),
    floorBar('fatG', '脂質', 'g', total.value.fatG ?? 0, settings.fatTargetG, null, total.unknown.fatG),
    capBar('saltG', '塩分', 'g', total.value.saltG ?? 0, settings.saltLimitG, total.unknown.saltG),
  ];
}

/** 下限型（カロリー・P・脂質）。届いていなければ黄色、達成で緑 */
function floorBar(
  key: NutrientKey,
  label: string,
  unit: string,
  current: number,
  target: number,
  cap: number | null,
  unknownCount: number,
): BarModel {
  const scaleMax = Math.max(target, cap ?? 0, current, 1);
  const pct = (value: number) => clamp((value / scaleMax) * 100);
  const reached = current >= target;

  const segments: BarSegment[] = [];
  const filled = Math.min(current, target);
  if (filled > 0) {
    segments.push({ widthPercent: pct(filled), className: reached ? 'bg-emerald-500' : 'bg-amber-400' });
  }
  if (current > target) {
    const upper = cap === null ? current : Math.min(current, cap);
    if (upper > target) segments.push({ widthPercent: pct(upper - target), className: 'bg-emerald-300' });
  }
  if (cap !== null && current > cap) {
    // 上限より上は「使われない分」。警告ではないのでグレー
    segments.push({ widthPercent: pct(current - cap), className: 'bg-slate-400' });
  }

  const markers: BarMarker[] = [{ percent: pct(target), label: `目標 ${formatAmount(key, target)}${unit}` }];
  if (cap !== null) markers.push({ percent: pct(cap), label: `上限 ${formatAmount(key, cap)}${unit}` });

  return {
    key,
    label,
    unit,
    kind: 'floor',
    current,
    target,
    cap,
    unknownCount,
    valueText: `${formatAmount(key, current)} / ${formatAmount(key, target)} ${unit}`,
    remainText: reached
      ? `目標に到達（+${formatAmount(key, current - target)}${unit}）`
      : `あと ${formatAmount(key, target - current)}${unit}`,
    legendText: markers.map((m) => m.label).join('　'),
    noteText:
      cap !== null && current > cap
        ? `${formatAmount(key, cap)}${unit} より上の ${formatAmount(key, current - cap)}${unit} は、これ以上は使われません`
        : null,
    tone: reached ? 'emerald' : 'amber',
    segments,
    markers,
  };
}

/** 上限型（塩分）。超えたら赤 */
function capBar(
  key: NutrientKey,
  label: string,
  unit: string,
  current: number,
  limit: number,
  unknownCount: number,
): BarModel {
  const scaleMax = Math.max(limit, current, 1);
  const pct = (value: number) => clamp((value / scaleMax) * 100);
  const over = current > limit;

  const segments: BarSegment[] = [];
  const within = Math.min(current, limit);
  if (within > 0) segments.push({ widthPercent: pct(within), className: 'bg-sky-500' });
  if (over) segments.push({ widthPercent: pct(current - limit), className: 'bg-red-500' });

  return {
    key,
    label,
    unit,
    kind: 'cap',
    current,
    target: limit,
    cap: limit,
    unknownCount,
    valueText: `${formatAmount(key, current)} / ${formatAmount(key, limit)} ${unit}`,
    remainText: over
      ? `上限まで -${formatAmount(key, current - limit)}${unit}`
      : `上限まで あと ${formatAmount(key, limit - current)}${unit}`,
    legendText: `上限 ${formatAmount(key, limit)}${unit}`,
    noteText: null,
    tone: over ? 'red' : 'sky',
    segments,
    markers: [{ percent: pct(limit), label: `上限 ${formatAmount(key, limit)}${unit}` }],
  };
}
