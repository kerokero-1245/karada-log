/**
 * F10: 設定タブの「エクスポート / バックアップ」。
 *
 * 主な用途は **チャットに貼る Markdown**。期間を選んで、コピーするかファイルに落とす。
 * 併せて全データの JSON バックアップも同じカードから取れるようにしてある
 * （端末を変えるとき・壊れたときのため）。
 *
 * クリップボードは環境によって使えない。使えなかったときは読み取り専用の
 * テキスト欄に中身を出して、手で選んでコピーできるようにする。
 */
import { useEffect, useMemo, useState } from 'react';
import type { LogDate, Settings } from '../../db/types';
import { Button, Card, Chip, Note } from '../../components/ui';
import { backupFileName, buildBackup } from '../../lib/backup';
import { addDays } from '../../lib/date';
import { useTodayLogDate } from '../../lib/day';
import { copyText, downloadText } from '../../lib/download';
import { collectExport } from '../../lib/exportData';
import { buildMarkdown } from '../../lib/exportMarkdown';
import type { RangePresetKey } from '../../lib/exportRange';
import {
  DEFAULT_RANGE_PRESET,
  RANGE_PRESETS,
  formatRange,
  rangeDayCount,
  rangeFileStamp,
  resolveRange,
} from '../../lib/exportRange';
import { useLiveQuery } from '../../lib/useLiveQuery';

type CopyState = 'idle' | 'copied' | 'manual';

export function ExportCard({ settings }: { settings: Settings }) {
  const today = useTodayLogDate(settings.dayBoundaryHour);
  const [preset, setPreset] = useState<RangePresetKey>(DEFAULT_RANGE_PRESET);
  const [customStart, setCustomStart] = useState<LogDate>(() => addDays(today, -6));
  const [customEnd, setCustomEnd] = useState<LogDate>(() => today);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [jsonNote, setJsonNote] = useState<string | null>(null);

  const range = useMemo(
    () => resolveRange(preset, today, { start: customStart, end: customEnd }, settings.weekStartsOn),
    [preset, today, customStart, customEnd, settings.weekStartsOn],
  );

  // 記録を足すとここも自動で追いつく（liveQuery）
  const data = useLiveQuery(() => collectExport(range, settings), [range.start, range.end, settings]);
  const markdown = useMemo(() => (data ? buildMarkdown(data) : ''), [data]);

  // 期間を変えたら、前の「コピーしました」は消す（効果ではなく操作の側で片づける）
  const changeRange = (next: () => void) => {
    setCopyState('idle');
    next();
  };

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copy = async () => {
    const ok = await copyText(markdown);
    setCopyState(ok ? 'copied' : 'manual');
  };

  const saveMarkdown = () => {
    downloadText(`karada-log-${rangeFileStamp(range)}.md`, markdown, 'text/markdown');
  };

  const saveJson = async () => {
    setJsonNote(null);
    try {
      const backup = await buildBackup();
      downloadText(backupFileName(), `${JSON.stringify(backup, null, 2)}\n`, 'application/json');
      setJsonNote('JSON を保存しました。APIキーは入っていません。');
    } catch (e) {
      setJsonNote(`書き出せませんでした（${e instanceof Error ? e.message : String(e)}）`);
    }
  };

  const ready = data !== undefined;

  return (
    <Card title="エクスポート / バックアップ">
      <div>
        <h3 className="text-xs font-bold text-slate-600">期間</h3>
        <div className="mt-1 flex flex-wrap gap-2">
          {RANGE_PRESETS.map((item) => (
            <Chip
              key={item.key}
              selected={preset === item.key}
              aria-pressed={preset === item.key}
              className="px-3 text-xs"
              onClick={() => changeRange(() => setPreset(item.key))}
            >
              {item.label}
            </Chip>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex-1">
              <span className="block text-[11px] text-slate-500">開始</span>
              <input
                type="date"
                aria-label="開始日"
                value={customStart}
                onChange={(e) => changeRange(() => setCustomStart(e.target.value))}
                className="mt-0.5 h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
              />
            </label>
            <label className="flex-1">
              <span className="block text-[11px] text-slate-500">終了</span>
              <input
                type="date"
                aria-label="終了日"
                value={customEnd}
                onChange={(e) => changeRange(() => setCustomEnd(e.target.value))}
                className="mt-0.5 h-11 w-full rounded-lg border border-slate-300 px-2 text-sm"
              />
            </label>
          </div>
        )}

        <p className="mt-2 text-sm font-medium tabular-nums text-slate-700">
          {formatRange(range)}（{rangeDayCount(range)}日間）
        </p>
        <Note>週は月曜起点、1日の区切りは朝{settings.dayBoundaryHour}時です。</Note>
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3">
        <h3 className="text-xs font-bold text-slate-600">Markdown（チャットに貼る用）</h3>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button variant="primary" disabled={!ready} onClick={() => void copy()}>
            Markdown をコピー
          </Button>
          <Button disabled={!ready} onClick={saveMarkdown}>
            Markdown をダウンロード
          </Button>
        </div>

        {copyState === 'copied' && <p className="mt-2 text-sm text-emerald-700">コピーしました</p>}
        {copyState === 'manual' && (
          <div className="mt-2">
            <p className="text-sm text-amber-800">
              この環境ではボタンからコピーできませんでした。下の欄を選んでコピーしてください。
            </p>
            <textarea
              readOnly
              aria-label="コピー用のMarkdown"
              value={markdown}
              rows={6}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px]"
            />
          </div>
        )}

        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer list-none py-2 text-sm font-bold text-slate-700">
            ▸ プレビュー
          </summary>
          <pre className="mt-1 max-h-96 overflow-auto rounded-lg bg-slate-50 p-2 text-[10px] leading-relaxed whitespace-pre-wrap break-words text-slate-700">
            {ready ? markdown : '読み込み中…'}
          </pre>
        </details>

        <Note>
          日付・曜日・区分つきの表と、日ごとの品目、トレーニングの重量（内訳つき）、体組成を1枚にまとめます。
        </Note>
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3">
        <h3 className="text-xs font-bold text-slate-600">JSON バックアップ（全データ）</h3>
        <div className="mt-1">
          <Button onClick={() => void saveJson()}>JSON をダウンロード</Button>
        </div>
        {jsonNote !== null && <p className="mt-2 text-sm text-slate-700">{jsonNote}</p>}
        <Note>
          期間に関係なく、この端末の全テーブルをそのまま書き出します。APIキーは書き出しません。
        </Note>
      </div>
    </Card>
  );
}
