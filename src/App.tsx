/**
 * 起動時に初期データを1回だけ投入し、ボトムナビでタブを切り替える。
 * ルーターは使わない（画面数が少なく、URL を共有する用途もないため）。
 * 「からだ」タブのフォームに入力があるうちに別のタブへ移るときは、確かめてから移る。
 */
import { useEffect, useState } from "react";
import { db } from "./db/db";
import { ensureSeed } from "./lib/ensureSeed";
import { useLiveQuery } from "./lib/useLiveQuery";
import { LEAVE_FORM_CONFIRM } from "./lib/bodyComposition";
import { errorMessage } from "./lib/errors";
import { ErrorText } from "./components/ui";
import { BottomNav } from "./components/BottomNav";
import type { TabKey } from "./components/BottomNav";
import { TodayScreen } from "./screens/TodayScreen";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { TrainingScreen } from "./screens/training/TrainingScreen";
import { BodyScreen } from "./screens/body/BodyScreen";
import { SettingsScreen } from "./screens/settings/SettingsScreen";

export default function App() {
  const [tab, setTab] = useState<TabKey>("today");
  const [bodyDirty, setBodyDirty] = useState(false);
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
        if (!cancelled) setError(errorMessage(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const changeTab = (next: TabKey) => {
    if (
      tab === "body" &&
      next !== "body" &&
      bodyDirty &&
      !window.confirm(LEAVE_FORM_CONFIRM)
    )
      return;
    setTab(next);
  };

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-center">
        <ErrorText label="読み込みに失敗しました">{error}</ErrorText>
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
      {tab === "today" && <TodayScreen settings={settings} />}
      {tab === "training" && <TrainingScreen settings={settings} />}
      {tab === "body" && (
        <BodyScreen settings={settings} onDirtyChange={setBodyDirty} />
      )}
      {tab === "week" && (
        <PlaceholderScreen
          title="週のまとめ"
          plan="1 週間のカロリーの合計、日ごとの目標の達成状況、塩分の週平均、トレーニングの回数。"
        />
      )}
      {tab === "settings" && <SettingsScreen settings={settings} />}
      <BottomNav tab={tab} onChange={changeTab} />
    </div>
  );
}
