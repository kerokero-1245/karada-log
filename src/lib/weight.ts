/**
 * 重量の計算と内訳表示。
 *
 * EZバー(7kg) と ショートバー(10kg) の取り違え事故が実際に起きているため、
 * 総重量は「数値として保存」せず、必ずバー種別とプレートから計算して、
 * 内訳文字列を常に出せるようにする（原則2）。
 *   例: 30kg（ショートバー10kg + 10kg×2）
 */
import { BAR_LABELS, BAR_WEIGHT_KG, type LoadSpec, type Progression } from '../db/types';

/** 実際に扱っている総重量。自重は null */
export function totalWeightKg(load: LoadSpec): number | null {
  switch (load.style) {
    case 'barbell':
      return round2(BAR_WEIGHT_KG[load.barType] + load.plateKgPerSide * 2);
    case 'dumbbell':
      return round2(load.kgPerHand * load.hands);
    case 'machine':
      return round2(load.stackKg);
    case 'other':
      return round2(load.totalKg);
    case 'bodyweight':
      return load.addedKg;
  }
}

/**
 * 進捗グラフ・前回比較に使う値。
 * ダンベルは「片手◯kg」で追う（12kg×2 → 14kg×2 は片手+2kg）。
 * それ以外は総重量。
 */
export function trackedWeightKg(load: LoadSpec): number | null {
  if (load.style === 'dumbbell') return round2(load.kgPerHand);
  return totalWeightKg(load);
}

/** 内訳つきの表示。例: '30kg（ショートバー10kg + 10kg×2）' */
export function describeLoad(load: LoadSpec): string {
  switch (load.style) {
    case 'barbell': {
      const bar = BAR_WEIGHT_KG[load.barType];
      const total = totalWeightKg(load);
      return `${fmtKg(total)}kg（${BAR_LABELS[load.barType]}${fmtKg(bar)}kg + ${fmtKg(load.plateKgPerSide)}kg×2）`;
    }
    case 'dumbbell':
      return `${fmtKg(load.kgPerHand)}kg×${load.hands}（ダンベル 片手${fmtKg(load.kgPerHand)}kg / 計${fmtKg(totalWeightKg(load))}kg）`;
    case 'machine':
      return `${fmtKg(load.stackKg)}kg（マシン）`;
    case 'other':
      return `${fmtKg(load.totalKg)}kg（${load.description}）`;
    case 'bodyweight':
      return load.addedKg ? `自重 + ${fmtKg(load.addedKg)}kg` : '自重';
  }
}

/** 一覧用の短い表示。例: '30kg' '12kg×2' */
export function describeLoadShort(load: LoadSpec): string {
  switch (load.style) {
    case 'dumbbell':
      return `${fmtKg(load.kgPerHand)}kg×${load.hands}`;
    case 'bodyweight':
      return load.addedKg ? `自重+${fmtKg(load.addedKg)}kg` : '自重';
    default:
      return `${fmtKg(totalWeightKg(load))}kg`;
  }
}

/**
 * 次回の重量を1段階上げる。
 * 3セットとも規定回数に達したときだけ呼ぶ（1セットでも下回ったら据え置き）。
 * バーベルは総重量 +amount なので、プレートは片側 amount/2 を足す。
 */
export function applyProgression(load: LoadSpec, progression: Progression | null): LoadSpec {
  if (!progression || progression.metric !== 'weight') return load;
  switch (load.style) {
    case 'barbell':
      return { ...load, plateKgPerSide: round2(load.plateKgPerSide + progression.amount / 2) };
    case 'dumbbell':
      return {
        ...load,
        kgPerHand: round2(
          load.kgPerHand + (progression.basis === 'perHand' ? progression.amount : progression.amount / load.hands),
        ),
      };
    case 'machine':
      return { ...load, stackKg: round2(load.stackKg + progression.amount) };
    case 'other':
      return { ...load, totalKg: round2(load.totalKg + progression.amount) };
    case 'bodyweight':
      return load;
  }
}

/** 次回の秒数を1段階上げる（ファーマーズウォークなど） */
export function applySecondsProgression(seconds: number | null, progression: Progression | null): number | null {
  if (seconds === null || !progression || progression.metric !== 'seconds') return seconds;
  return seconds + progression.amount;
}

/** 増分の表示。例: '+2.5kg' '+2kg（片側）' '+5秒' */
export function describeProgression(progression: Progression | null): string {
  if (!progression) return '—';
  if (progression.metric === 'seconds') return `+${progression.amount}秒`;
  return progression.basis === 'perHand' ? `+${progression.amount}kg（片側）` : `+${progression.amount}kg`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtKg(n: number | null): string {
  if (n === null) return '—';
  return String(round2(n));
}
