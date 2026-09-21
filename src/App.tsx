/**
 * 起動時に初期データを1回だけ投入し、ボトムナビでタブを切り替える。
 * ルーターは使わない（画面数が少なく、URL を共有する用途もないため）。
 */
import { useEffect, useState } from 'react';
import { db } from './db/db';
import { ensureSeed } from './lib/ensureSeed';
import { useLiveQuery } from './lib/useLiveQuery';
import { BottomNav } from './components/BottomNav';
import type { TabKey } from './components/BottomNav';
import { TodayScreen } from './screens/TodayScreen';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { DevDataScreen } from './screens/dev/DevDataScreen';

export default function App() {
  const [tab, setTab] = useState<TabKey>('today');
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settings = useLiveQuery(() => db.settings.get(1), []);

  useEffect(() => {
    let cancelled = false;
    ensureSeed().then(
      () => {
        if (!cancelled) setSeeded(true);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-center text-sm text-red-700">
        読み込みに失敗しました: {error}
      </div>
    );
  }

  if (!seeded || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-center text-sm text-slate-500">
        読み込み中…
      </div>
    );
  }

  return (
    <div className="bg-slate-100">
      {tab === 'today' && <TodayScreen settings={settings} />}
      {tab === 'training' && (
        <PlaceholderScreen
          title="トレーニング"
          plan="A / B / C のローテーション、バー種別とセットでの重量記録、次回重量の自動判定（F4）。"
        />
      )}
      {tab === 'body' && (
        <PlaceholderScreen
          title="からだ"
          plan="体組成・骨密度の記録と、脂肪量／除脂肪量を主役にしたグラフ（F5）。"
        />
      )}
      {tab === 'week' && (
        <PlaceholderScreen
          title="週のまとめ"
          plan="週合計カロリー、日別の達成状況、塩分の週平均、トレーニング回数（F8）。"
        />
      )}
      {tab === 'settings' && <DevDataScreen settings={settings} />}
      <BottomNav tab={tab} onChange={setTab} />
    </div>
  );
}
