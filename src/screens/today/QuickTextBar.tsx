/**
 * ダッシュボードの1行入力。
 * 食べたものを書いて確定すると、テキストモードの記録シートがその内容で開く。
 *
 * ★ ここで確定しても記録には入らない。★
 *   開いたシートで内容を確認して「記録する」を押したときだけ入る（原則1）。
 */
import { useState } from 'react';
import { Button, Card, Note } from '../../components/ui';

export function QuickTextBar({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    <Card title="テキストでまとめて記録">
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="ザバス2本 / ワイルドステーキ300g / スムージー"
          aria-label="食べたものを書く"
          className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base"
        />
        <Button variant="primary" className="h-12 shrink-0 px-4" disabled={text.trim() === ''} onClick={submit}>
          解釈する
        </Button>
      </div>
      <Note>
        読み取った結果を一覧で確認してから記録します。<strong>確定しただけでは集計に入りません。</strong>
      </Note>
    </Card>
  );
}
