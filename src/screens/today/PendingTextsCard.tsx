/**
 * 未処理のテキスト。
 *
 * 食品に結び付けられなかった原文をそのまま預かっている置き場。
 * ★ 栄養値を持たないので、集計には一切入っていない。★
 * タップするとテキストモードでその原文を開き直して、続きから解決できる。
 */
import type { LogDate, PendingText } from '../../db/types';
import { Badge, Button, Card, Note } from '../../components/ui';
import { formatLogDateShort, timeOf } from '../../lib/date';

export function PendingTextsCard({
  items,
  todayLogDate,
  onOpen,
  onDelete,
}: {
  items: PendingText[];
  todayLogDate: LogDate;
  onOpen: (item: PendingText) => void;
  onDelete: (item: PendingText) => void;
}) {
  if (items.length === 0) return null;

  return (
    <Card title={`未処理のテキスト ${items.length}件`}>
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-1">
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="min-h-14 min-w-0 flex-1 rounded-lg px-1 py-1 text-left active:bg-slate-50"
            >
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-slate-800">「{item.text}」</span>
                <Badge tone="amber">{item.reason}</Badge>
              </span>
              <span className="mt-0.5 block text-[11px] tabular-nums text-slate-500">
                {item.logDate === todayLogDate ? '今日' : formatLogDateShort(item.logDate)}{' '}
                {timeOf(item.recordedAt)}
              </span>
            </button>
            <Button variant="ghost" className="shrink-0 px-3 text-xs" onClick={() => onDelete(item)}>
              削除
            </Button>
          </li>
        ))}
      </ul>
      <Note>栄養値を付けていないので、今日の集計には入っていません。記録するか削除すると消えます。</Note>
    </Card>
  );
}
