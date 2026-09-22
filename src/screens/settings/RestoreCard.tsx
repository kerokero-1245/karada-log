/**
 * F10: JSON バックアップからの復元。
 *
 * 今のデータを丸ごと置き換える操作なので、必ず
 *   ファイルを選ぶ → 中身（いつのものか・テーブルごとの件数）を見せる → 確認 → 実行
 * の順にする。選んだ瞬間には何も書き換えない。
 *
 * API キーは復元の対象外。ファイルにも入っていないし、今の端末の値をそのまま残す。
 */
import { useRef, useState } from 'react';
import { Button, Card, Note } from '../../components/ui';
import type { BackupCount, BackupFile } from '../../lib/backup';
import { parseBackup, restoreBackup } from '../../lib/backup';
import { formatDateTime } from '../../lib/date';

interface Staged {
  fileName: string;
  backup: BackupFile;
  counts: BackupCount[];
}

export function RestoreCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStaged(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const pick = async (file: File | undefined) => {
    setError(null);
    setDone(null);
    setStaged(null);
    if (!file) return;

    let text = '';
    try {
      text = await file.text();
    } catch {
      setError('このファイルは読み込めません（中身を開けませんでした）');
      return;
    }

    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setError(`このファイルは読み込めません（${parsed.reason}）`);
      return;
    }
    setStaged({ fileName: file.name, backup: parsed.backup, counts: parsed.counts });
  };

  const run = async () => {
    if (!staged) return;
    setBusy(true);
    setError(null);
    try {
      const result = await restoreBackup(staged.backup);
      const total = Object.values(result.restored).reduce((a, b) => a + b, 0);
      const parts = [`復元しました（${total}件）。`];
      if (result.keptApiKey) parts.push('APIキーはこの端末の値のまま残しています。');
      if (result.keptCurrentSettings) parts.push('ファイルに設定が無かったので、今の設定を残しました。');
      setDone(parts.join(''));
      reset();
    } catch (e) {
      setError(`復元できませんでした（${e instanceof Error ? e.message : String(e)}）`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="JSON から復元">
      <label className="block">
        <span className="block text-xs font-bold text-slate-600">バックアップファイル</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          aria-label="バックアップファイル"
          onChange={(e) => void pick(e.target.files?.[0])}
          className="mt-1 w-full text-sm text-slate-700 file:mr-2 file:min-h-11 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:text-sm file:font-medium file:text-slate-700"
        />
      </label>

      {error !== null && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {done !== null && <p className="mt-2 text-sm text-emerald-700">{done}</p>}

      {staged !== null && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">今のデータをすべて置き換えます</p>
          <p className="mt-1 text-xs text-amber-900">
            ファイル: {staged.fileName}
            <br />
            書き出した日時: {staged.backup.exportedAt === '' ? '—' : formatDateTime(staged.backup.exportedAt)}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs">
            {staged.counts.map((row) => (
              <div key={row.table} className="flex justify-between gap-2 border-b border-amber-200 py-0.5">
                <dt className="text-amber-900">{row.label}</dt>
                <dd className="text-right font-medium tabular-nums text-amber-900">
                  {row.count} 件{row.missing ? '（ファイルに無し）' : ''}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" disabled={busy} onClick={() => void run()}>
              この内容に置き換える
            </Button>
            <Button variant="ghost" disabled={busy} onClick={reset}>
              やめる
            </Button>
          </div>
        </div>
      )}

      <div className="mt-2 space-y-0.5">
        <Note>復元すると、今この端末にある記録は残りません。先に JSON をダウンロードしておいてください。</Note>
        <Note>APIキーは復元の対象外です。今の端末の値がそのまま残ります。</Note>
      </div>
    </Card>
  );
}
