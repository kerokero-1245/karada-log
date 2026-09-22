/**
 * F10: Markdown の書き出し（純関数）。
 *
 * ★ ここは純関数だけ。DB も React も触らない。★
 *   DB から集めた形（ExportInput）を受け取って文字列を返すだけ。
 *   集めるのは lib/exportData.ts。
 *
 * 読み手は「チャットの Claude」。そのため次を必ず守る。
 *  - 冒頭に前提を置く。目標値と、「記録の無い日・時間帯は未記録であり、
 *    食べていないという意味ではない」ことを最初に伝える（handover §10-①）。
 *  - 固定ベース（計画）は記録に入ったぶんだけが出ている、と明示する。
 *  - 空のセクションは「なし」と書き、見出しは省かない。
 *    見出しごと消すと、読み手が「無かった」のか「書き出されなかった」のか分けられない。
 *  - 重量は必ず内訳つきで出す（原則2）。バー種別の取り違え事故の再発防止。
 */
import type {
  BodyComposition,
  DayType,
  IsoDateTime,
  LogDate,
  MealEntry,
  Nutrition,
  PendingText,
  SessionExercise,
  SetRecord,
  Settings,
  TrainingSession,
} from '../db/types';
import { DAY_TYPE_LABELS, MENU_LABELS, OUTCOME_LABELS } from '../db/types';
import { WEEKDAY_JA, formatDateTime, formatLogDateShort, parseIso, timeOf, weekStartOf } from './date';
import type { DateRange } from './exportRange';
import { formatRange, rangeDayCount } from './exportRange';
import { buildBars, dayTargetKcal, formatAmount } from './goals';
import { scaleNutrition, sumNutrition } from './nutrition';
import { describeLoad } from './weight';

/* ------------------------------------------------------------------ */
/* 入力の形                                                             */
/* ------------------------------------------------------------------ */

export interface ExportSessionExercise {
  item: SessionExercise;
  /** setNo の昇順。記録が無ければ空配列（回数を作らない） */
  sets: SetRecord[];
}

export interface ExportSession {
  session: TrainingSession;
  items: ExportSessionExercise[];
}

export interface ExportDay {
  logDate: LogDate;
  dayType: DayType;
  /** recordedAt の昇順 */
  entries: MealEntry[];
  sessions: ExportSession[];
}

export interface ExportInput {
  range: DateRange;
  generatedAt: IsoDateTime;
  settings: Settings;
  /** 期間の全日。記録が無い日も「未記録」の行として出すため、抜かさずに渡す */
  days: ExportDay[];
  bodies: BodyComposition[];
  /** 期間内に測定が無く、参考として期間外の最新1件を出しているか */
  bodiesOutOfRange: boolean;
  pendingTexts: PendingText[];
}

/* ------------------------------------------------------------------ */
/* 小さな道具                                                           */
/* ------------------------------------------------------------------ */

const DASH = '—';

/** 表のセル。区切りの | と改行が表を壊すので逃がす */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.map(cell).join(' | ')} |`;
  const rule = `|${headers.map(() => '---').join('|')}|`;
  return [head, rule, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)].join('\n');
}

/** 数量。1 → '1' / 0.5 → '0.5' */
function fmtQuantity(quantity: number): string {
  return String(Math.round(quantity * 100) / 100);
}

function fmtKg(value: number | null, unit = 'kg'): string {
  if (value === null) return DASH;
  return `${trimZeros(value.toFixed(1))}${unit}`;
}

function fmtSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return '±0.0kg';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(1)}kg`;
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

function weekdayOf(logDate: LogDate): string {
  return WEEKDAY_JA[parseIso(logDate).getDay()];
}

/** '2026-09-21' → '9/21' */
function shortDate(logDate: LogDate): string {
  const d = parseIso(logDate);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function entryNutritionOf(entry: MealEntry): Nutrition {
  return scaleNutrition(entry.snapshot.per, entry.quantity);
}

/** kcal / P / 脂質 / 塩分 のどれかが分かっていない記録か */
function hasUnknownValue(entry: MealEntry): boolean {
  const per = entry.snapshot.per;
  return per.kcal === null || per.proteinG === null || per.fatG === null || per.saltG === null;
}

interface DayTotals {
  nutrition: ReturnType<typeof sumNutrition>;
  unknownEntries: number;
  hasRecords: boolean;
}

function totalsOf(day: ExportDay): DayTotals {
  return {
    nutrition: sumNutrition(day.entries.map(entryNutritionOf)),
    unknownEntries: day.entries.filter(hasUnknownValue).length,
    hasRecords: day.entries.length > 0,
  };
}

/* ------------------------------------------------------------------ */
/* 本体                                                                 */
/* ------------------------------------------------------------------ */

export function buildMarkdown(input: ExportInput): string {
  const blocks = [
    heading(input),
    assumptions(input),
    summarySection(input),
    daySections(input),
    bodySection(input),
    pendingSection(input),
    footer(),
  ];
  return `${blocks.join('\n\n')}\n`;
}

/* 1. 見出しと生成時刻 ---------------------------------------------- */

function heading(input: ExportInput): string {
  const days = rangeDayCount(input.range);
  return [
    `# karada-log 書き出し（${formatRange(input.range)}）`,
    '',
    `生成: ${formatDateTime(input.generatedAt)} ／ ${days}日間`,
  ].join('\n');
}

/* 2. 前提 ------------------------------------------------------------ */

function assumptions(input: ExportInput): string {
  const s = input.settings;
  return [
    '## 前提',
    '',
    `- 1日の目標: ${DAY_TYPE_LABELS.rest} ${formatAmount('kcal', s.restDayKcal)} kcal ／ ${DAY_TYPE_LABELS.gym} ${formatAmount('kcal', s.gymDayKcal)} kcal、たんぱく質 ${s.proteinTargetG}g（上限 ${s.proteinCapG}g）、脂質 ${s.fatTargetG}g、塩分 ${s.saltLimitG}g以内。基礎代謝 ${formatAmount('kcal', s.bmrKcal)} kcal はこれより下に行かせない下限。週合計は ${formatAmount('kcal', s.weeklyKcalTarget)} ± ${s.weeklyKcalTolerance} kcal。`,
    '- 記録の無い日・時間帯は「未記録」です。「食べていない」という意味ではありません。',
    '- 固定ベースは計画です。ユーザーがタップして記録に入れたぶんだけがここに出ています。計画値は集計に入っていません。',
    '- 「推定」は料理写真からの概算、「未確認」は栄養値が分かっていない項目です。未確認の値は合計に足していません。',
  ].join('\n');
}

/* 3. 期間サマリー ---------------------------------------------------- */

function summarySection(input: ExportInput): string {
  const rows = input.days.map((day) => {
    const totals = totalsOf(day);
    const menus = day.sessions.map((s) => s.session.menu).join('・');
    if (!totals.hasRecords) {
      return [
        shortDate(day.logDate),
        weekdayOf(day.logDate),
        DAY_TYPE_LABELS[day.dayType],
        '未記録',
        DASH,
        DASH,
        DASH,
        DASH,
        menus === '' ? DASH : menus,
      ];
    }
    const v = totals.nutrition.value;
    return [
      shortDate(day.logDate),
      weekdayOf(day.logDate),
      DAY_TYPE_LABELS[day.dayType],
      formatAmount('kcal', v.kcal ?? 0),
      formatAmount('proteinG', v.proteinG ?? 0),
      formatAmount('fatG', v.fatG ?? 0),
      formatAmount('saltG', v.saltG ?? 0),
      String(totals.unknownEntries),
      menus === '' ? DASH : menus,
    ];
  });

  return [
    '## 期間サマリー',
    '',
    table(['日付', '曜日', '区分', 'kcal', 'P', '脂質', '塩分', '未確認', 'トレ'], rows),
    '',
    weeklySection(input),
    '',
    saltAverageSection(input),
    '',
    lowFatSection(input),
  ].join('\n');
}

function weeklySection(input: ExportInput): string {
  const s = input.settings;
  const groups = new Map<LogDate, ExportDay[]>();
  for (const day of input.days) {
    const key = weekStartOf(day.logDate, s.weekStartsOn);
    const list = groups.get(key);
    if (list) list.push(day);
    else groups.set(key, [day]);
  }

  const target = `${formatAmount('kcal', s.weeklyKcalTarget)} ± ${s.weeklyKcalTolerance}`;
  const rows = [...groups.entries()].map(([weekStart, days]) => {
    const withRecords = days.filter((day) => day.entries.length > 0);
    const kcal = withRecords.reduce(
      (sum, day) => sum + (sumNutrition(day.entries.map(entryNutritionOf)).value.kcal ?? 0),
      0,
    );
    const last = days[days.length - 1];
    return [
      `${shortDate(weekStart)}〜${shortDate(last.logDate)}`,
      `${days.length}日`,
      `${withRecords.length}日`,
      withRecords.length === 0 ? '未記録' : formatAmount('kcal', kcal),
      target,
    ];
  });

  return [
    '### 週合計（月曜起点）',
    '',
    rows.length === 0
      ? 'なし'
      : table(['週', '期間内の日数', '記録のある日', 'kcal 合計', '週の目標'], rows),
    '',
    '※ 期間の切り方によっては週の一部しか入りません。「期間内の日数」が7日未満の週は、週の目標とそのまま並べて見ないでください。',
  ].join('\n');
}

function saltAverageSection(input: ExportInput): string {
  const s = input.settings;
  const withRecords = input.days.filter((day) => day.entries.length > 0);
  const values = withRecords.map((day) => sumNutrition(day.entries.map(entryNutritionOf)).value.saltG ?? 0);
  const body =
    values.length === 0
      ? 'なし（記録のある日がありません）'
      : `- 記録のある ${values.length}日の平均: ${formatAmount('saltG', values.reduce((a, b) => a + b, 0) / values.length)}g（1日の上限 ${s.saltLimitG}g / 週平均の目安 ${s.weeklySaltAverageG}g）`;
  return ['### 塩分の平均', '', body].join('\n');
}

function lowFatSection(input: ExportInput): string {
  const limit = input.settings.alerts.lowFatDayG;
  const rows = input.days
    .filter((day) => day.entries.length > 0)
    .map((day) => ({ day, fat: sumNutrition(day.entries.map(entryNutritionOf)).value.fatG ?? 0 }))
    .filter((row) => row.fat < limit);

  return [
    `### 脂質が ${limit}g 未満の日（まともに食べていない日の候補）`,
    '',
    rows.length === 0
      ? 'なし'
      : rows
          .map(
            (row) =>
              `- ${formatLogDateShort(row.day.logDate)} 脂質 ${formatAmount('fatG', row.fat)}g ／ ${formatAmount('kcal', sumNutrition(row.day.entries.map(entryNutritionOf)).value.kcal ?? 0)} kcal`,
          )
          .join('\n'),
    '',
    '※ 記録の書き漏らしでも同じ形になります。数値だけで決めず、本人に確かめてください。',
  ].join('\n');
}

/* 4. 日ごとの詳細 ---------------------------------------------------- */

function daySections(input: ExportInput): string {
  const shown = input.days.filter((day) => day.entries.length > 0 || day.sessions.length > 0);
  const empty = input.days.filter((day) => day.entries.length === 0 && day.sessions.length === 0);

  const intro = [
    '## 日ごとの詳細',
    '',
    empty.length === 0
      ? '期間内のすべての日に記録があります。'
      : `記録の無い日: ${empty.map((day) => formatLogDateShort(day.logDate)).join('、')}（未記録です。食べていないという意味ではありません）`,
  ].join('\n');

  if (shown.length === 0) return [intro, '', 'なし'].join('\n');
  return [intro, ...shown.map((day) => daySection(day, input.settings))].join('\n\n');
}

function daySection(day: ExportDay, settings: Settings): string {
  const totals = totalsOf(day);
  const bars = buildBars(totals.nutrition, settings, day.dayType);
  const lines = [`## ${formatLogDateShort(day.logDate)}${DAY_TYPE_LABELS[day.dayType]}`, ''];

  if (!totals.hasRecords) {
    lines.push(
      `食事の記録はありません（未記録）。この日のカロリー目標は ${formatAmount('kcal', dayTargetKcal(settings, day.dayType))} kcal です。`,
    );
  } else {
    lines.push(...bars.map((bar) => `- ${bar.label} ${bar.valueText}（${bar.remainText}）`));
    if (totals.unknownEntries > 0) {
      lines.push(`- 栄養値が分かっていない項目: ${totals.unknownEntries}件（上の合計には入っていません）`);
    }
    lines.push('');
    lines.push(
      table(
        ['時刻', '品目', '数量', 'kcal', 'P', '脂質', '塩分', '備考'],
        day.entries.map((entry) => entryRow(entry)),
      ),
    );
  }

  for (const session of day.sessions) {
    lines.push('');
    lines.push(trainingBlock(session));
  }

  return lines.join('\n');
}

function entryRow(entry: MealEntry): string[] {
  const snapshot = entry.snapshot;
  const value = entryNutritionOf(entry);
  const name = snapshot.variantLabel ? `${snapshot.name}（${snapshot.variantLabel}）` : snapshot.name;

  const notes: string[] = [];
  if (entry.note.trim() !== '') notes.push(`原文「${entry.note.trim()}」`);
  if (snapshot.source === 'estimated') notes.push('推定');
  if (hasUnknownValue(entry)) notes.push('未確認');
  if (entry.fromShortcutSetId !== null) notes.push('固定ベース');

  const num = (key: 'kcal' | 'proteinG' | 'fatG' | 'saltG') => {
    const v = value[key];
    return v === null ? DASH : formatAmount(key, v);
  };

  return [
    timeOf(entry.recordedAt),
    name,
    `${fmtQuantity(entry.quantity)} × ${snapshot.unitLabel}`,
    num('kcal'),
    num('proteinG'),
    num('fatG'),
    num('saltG'),
    notes.length === 0 ? DASH : notes.join('／'),
  ];
}

function trainingBlock(entry: ExportSession): string {
  const session = entry.session;
  const head = `### トレーニング ${MENU_LABELS[session.menu]} ${timeOf(session.startedAt)} 開始${
    session.startedAtIsEstimated ? '（開始時刻は仮置き）' : ''
  }`;

  const lines = [head, ''];
  if (entry.items.length === 0) {
    lines.push('実施したことは記録されていますが、種目ごとの記録はありません。');
  } else {
    for (const { item, sets } of entry.items) {
      lines.push(
        `- ${item.exerciseName} ${describeLoad(item.load)}× ${setsText(sets)} → ${OUTCOME_LABELS[item.outcome]}`,
      );
      if (item.note.trim() !== '') lines.push(`  - メモ: ${item.note.trim()}`);
    }
  }
  if (session.note.trim() !== '') lines.push(`- セッションのメモ: ${session.note.trim()}`);
  return lines.join('\n');
}

/** '10,10,10' / '30秒' / '回数未記録'。回数が分からないものを作らない */
function setsText(sets: SetRecord[]): string {
  if (sets.length === 0) return '回数未記録';
  const parts = sets.map((set) =>
    set.reps !== null ? String(set.reps) : set.seconds !== null ? `${set.seconds}秒` : DASH,
  );
  return parts.every((part) => part === DASH) ? '回数未記録' : parts.join(',');
}

/* 5. 体組成 ---------------------------------------------------------- */

function bodySection(input: ExportInput): string {
  const goal = input.settings.goal;
  const lines = ['## 体組成', ''];

  if (input.bodies.length === 0) {
    lines.push('なし（この端末に体組成の記録がありません）');
    return lines.join('\n');
  }

  if (input.bodiesOutOfRange) {
    lines.push('期間内の測定はありません。参考として、期間外の最新1件を出します。');
    lines.push('');
  }

  lines.push(
    table(
      ['測定日時', '機種', '体重', '体脂肪率', '脂肪量', '除脂肪量', 'BMR', '内臓脂肪', '条件'],
      input.bodies.map((body) => [
        formatDateTime(body.measuredAt),
        body.device,
        fmtKg(body.weightKg),
        body.bodyFatPercent === null ? DASH : `${trimZeros(body.bodyFatPercent.toFixed(1))}%`,
        fmtKg(body.fatMassKg),
        fmtKg(body.leanMassKg),
        body.bmrKcal === null ? DASH : `${formatAmount('kcal', body.bmrKcal)}kcal`,
        body.visceralFatLevel === null ? DASH : String(body.visceralFatLevel),
        body.warnings.length === 0 ? '警告なし' : body.warnings.map((w) => w.message).join('／'),
      ]),
    ),
  );
  lines.push('');
  lines.push(`目標ライン（${goal.label} / 脂肪 ${goal.fatMassKg}kg ・ 除脂肪 ${goal.leanMassKg}kg）との差:`);
  for (const body of input.bodies) {
    const fat = body.fatMassKg === null ? DASH : fmtSigned(body.fatMassKg - goal.fatMassKg);
    const lean = body.leanMassKg === null ? DASH : fmtSigned(body.leanMassKg - goal.leanMassKg);
    lines.push(`- ${formatDateTime(body.measuredAt)}: 脂肪 ${fat} ／ 除脂肪 ${lean}`);
  }
  lines.push('');
  lines.push('※ 機種が違う測定は並べて比べないでください。条件（最後のトレからの日数・前日の塩分・食後経過時間）が悪い回は水分で重く出ます。');
  return lines.join('\n');
}

/* 6. 未処理のテキスト ------------------------------------------------ */

function pendingSection(input: ExportInput): string {
  const lines = ['## 未処理のテキスト', ''];
  if (input.pendingTexts.length === 0) {
    lines.push('なし');
    return lines.join('\n');
  }
  lines.push('食品に結び付けられないまま原文で預かっているものです。栄養値を持たないので、合計には入っていません。');
  lines.push('');
  for (const item of input.pendingTexts) {
    lines.push(`- 「${item.text}」（${formatDateTime(item.recordedAt)} ／ ${item.reason}）`);
  }
  return lines.join('\n');
}

/* 7. 末尾 ------------------------------------------------------------ */

function footer(): string {
  return [
    '---',
    '',
    'このアプリの記録が正です。ここに出ていない時間帯は「未記録」であって「食べていない」ではありません。チャット側で計画値（固定ベースなど）を足して積み上げないでください。',
  ].join('\n');
}
