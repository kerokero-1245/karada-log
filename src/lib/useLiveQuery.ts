/**
 * dexie の liveQuery を React から使うための最小フック。
 * dexie-react-hooks は足さず、dexie 本体の liveQuery だけで済ませる（依存を増やさない）。
 *
 * 戻り値が undefined の間は「まだ読めていない」。
 * DB が書き換わると購読が発火して自動で再描画される。
 * querier は deps が変わったときだけ貼り直す（logDate が変わったら購読し直す）。
 */
import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

export function useLiveQuery<T>(querier: () => T | Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);

  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({
      next: (next) => setValue(() => next),
      error: (error) => console.error('[useLiveQuery]', error),
    });
    return () => subscription.unsubscribe();
  }, deps);

  return value;
}
