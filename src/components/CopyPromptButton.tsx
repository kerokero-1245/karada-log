/**
 * 「claude.ai 用の依頼文をコピー」。
 *
 * 写真の見積もりはチャット側でやってもらい、返ってきた行をこのアプリに貼る。
 * その往復の最初の一手。文面は lib/importPrompt.ts。
 *
 * クリップボードは環境によって使えない（許可が無い・HTTPS でない など）。
 * 使えなかったときは読み取り専用の欄に出して、手で選んでコピーできるようにする。
 */
import { useEffect, useState } from 'react';
import { Button, Note } from './ui';
import { copyText } from '../lib/download';
import { IMPORT_PROMPT } from '../lib/importPrompt';

type CopyState = 'idle' | 'copied' | 'manual';

export function CopyPromptButton({ className = '' }: { className?: string }) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state !== 'copied') return;
    const timer = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    setState((await copyText(IMPORT_PROMPT)) ? 'copied' : 'manual');
  };

  return (
    <div className={className}>
      <Button className="w-full" onClick={() => void copy()}>
        claude.ai 用の依頼文をコピー
      </Button>

      {state === 'copied' && <p className="mt-1 text-sm text-emerald-700">コピーしました</p>}

      {state === 'manual' && (
        <div className="mt-1">
          <p className="text-sm text-amber-800">
            この環境ではボタンからコピーできませんでした。下の欄を選んでコピーしてください。
          </p>
          <textarea
            readOnly
            aria-label="コピー用の依頼文"
            value={IMPORT_PROMPT}
            rows={6}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px]"
          />
        </div>
      )}

      <Note>
        チャットに写真とこの文面を貼ると、この画面にそのまま貼れる形で返ってきます。
      </Note>
    </div>
  );
}
