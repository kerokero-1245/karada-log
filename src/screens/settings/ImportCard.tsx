/**
 * 設定タブの「記録を貼り付けて取り込む」。エクスポートの隣に置く（出す／入れるを並べる）。
 *
 * ★ カードを開いただけでも、貼っただけでも記録には入らない。★
 *   シートの中で内容を確認して「○件を取り込む」を押したときだけ入る（原則1）。
 */
import { useState } from 'react';
import type { Settings } from '../../db/types';
import { Button, Card, Note } from '../../components/ui';
import { useTodayLogDate } from '../../lib/day';
import { ImportSheet } from '../import/ImportSheet';

export function ImportCard({ settings }: { settings: Settings }) {
  const today = useTodayLogDate(settings.dayBoundaryHour);
  const [open, setOpen] = useState(false);

  return (
    <Card title="記録を貼り付けて取り込む">
      <p className="text-sm text-slate-600">
        claude.ai に写真を投げて見積もってもらった行を、まとめて貼り付けて取り込みます。
        日付ごとに分けて確認してから記録できます。
      </p>
      <div className="mt-2">
        <Button variant="primary" className="w-full" onClick={() => setOpen(true)}>
          貼り付けて取り込む
        </Button>
      </div>
      <Note>
        依頼文をコピーするボタンもこの中にあります。貼っただけでは集計に入りません。
      </Note>

      {open && (
        <ImportSheet
          today={today}
          boundaryHour={settings.dayBoundaryHour}
          onClose={() => setOpen(false)}
        />
      )}
    </Card>
  );
}
