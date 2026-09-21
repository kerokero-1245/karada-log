/**
 * 設定タブの「写真入力（Claude API）」。
 *
 * キーはこの端末の Settings（IndexedDB）にだけ入る。保存したあとは
 * 末尾4文字しか表示しない（肩越しに見られても全体は読めない）。
 *
 * 「接続テスト」は最小の呼び出し（テキストだけ・max_tokens 32）で、
 * キーが通るかどうかだけを確かめる。写真は送らない。
 */
import { useState } from 'react';
import type { Settings } from '../../db/types';
import { Button, Card, Note } from '../../components/ui';
import { apiKeyOf, clearApiKey, maskApiKey, saveApiKey } from '../../lib/apiKey';
import { photoErrorMessage } from '../../lib/photoError';
import { useOnline } from '../../lib/useOnline';
import { testConnection } from '../../lib/vision';

interface Status {
  ok: boolean;
  text: string;
}

export function ApiKeyCard({ settings }: { settings: Settings }) {
  const saved = apiKeyOf(settings);
  const online = useOnline();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  const save = async () => {
    const key = draft.trim();
    if (key === '') {
      setStatus({ ok: false, text: 'APIキーを入力してください。' });
      return;
    }
    setBusy(true);
    try {
      await saveApiKey(key);
      setDraft('');
      setStatus({ ok: true, text: 'キーを保存しました。写真からの入力が使えます。' });
    } catch (e) {
      setStatus({ ok: false, text: photoErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await clearApiKey();
      setStatus({ ok: true, text: 'キーを削除しました。写真からの入力は出なくなります。' });
    } catch (e) {
      setStatus({ ok: false, text: photoErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (saved === null) return;
    setBusy(true);
    setStatus(null);
    try {
      await testConnection(saved);
      setStatus({ ok: true, text: '接続OK' });
    } catch (e) {
      setStatus({ ok: false, text: photoErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="写真入力（Claude API）">
      {saved === null ? (
        <p className="text-sm text-slate-600">
          キーを入れると、栄養成分表示や料理の写真から入力できるようになります。
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">保存済み:</span>
          <span className="rounded bg-slate-100 px-2 py-1 text-sm tabular-nums text-slate-800">
            {maskApiKey(saved)}
          </span>
        </div>
      )}

      <label className="mt-3 block">
        <span className="block text-xs font-bold text-slate-600">
          APIキー
          <span className="ml-1 font-normal text-slate-400">
            {saved === null ? 'console.anthropic.com で作れます' : '入れ替えるときだけ入力'}
          </span>
        </span>
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-ant-..."
          autoComplete="off"
          aria-label="APIキー"
          className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-base"
        />
      </label>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          保存
        </Button>
        {saved !== null && (
          <>
            <Button disabled={busy || !online} onClick={() => void test()}>
              接続テスト
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void remove()}>
              削除
            </Button>
          </>
        )}
      </div>

      {!online && saved !== null && (
        <p className="mt-2 text-xs text-amber-800">オフラインでは使えません。</p>
      )}

      {status !== null && (
        <p className={`mt-2 text-sm ${status.ok ? 'text-emerald-700' : 'text-red-700'}`}>{status.text}</p>
      )}

      <div className="mt-2 space-y-0.5">
        <Note>キーはこの端末の中だけに保存されます。どこにも同期しません。</Note>
        <Note>写真は読み取りのために Anthropic に送られます。写真そのものは保存しません。</Note>
        <Note>読み取り1枚あたり、数円ほどの利用料がかかります。</Note>
      </div>
    </Card>
  );
}
