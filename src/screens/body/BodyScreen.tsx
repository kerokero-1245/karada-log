/**
 * F5: 「からだ」タブ。体組成と骨密度を切り替えて、記録・推移・一覧を見る。
 *
 *  - 体組成のグラフは脂肪量と除脂肪量が主役（体重は一覧にだけ出す）。目標ラインは設定の goal。
 *  - 機種が違う測定は同じグラフに並べない（機種ごとにカードを分ける）。
 *  - 測定条件は「最後のトレからの日数」で見る。条件が悪い回は白抜きの点と「⚠」で区別するが、
 *    記録は止めない（悪い条件でも測った事実は残す）。
 *  - フォームに入力があるうちに体組成 / 骨密度を切り替えるときは、確かめてから切り替える
 *    （入力があるかは onDirtyChange でアプリにも知らせ、タブの切り替えでも確かめる）。
 */
import { useCallback, useState } from "react";
import type { Settings } from "../../db/types";
import { Chip } from "../../components/ui";
import { ScreenHeader } from "../../components/ScreenHeader";
import { ScreenLayout } from "../../components/ScreenLayout";
import { LEAVE_FORM_CONFIRM } from "../../lib/bodyComposition";
import { BodySection } from "./BodySection";
import { BoneSection } from "./BoneSection";

type View = "body" | "bone";

const VIEWS: { key: View; label: string }[] = [
  { key: "body", label: "体組成" },
  { key: "bone", label: "骨密度" },
];

export function BodyScreen({
  settings,
  onDirtyChange,
}: {
  settings: Settings;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [view, setView] = useState<View>("body");
  const [dirty, setDirty] = useState(false);
  const reportDirty = useCallback(
    (next: boolean) => {
      setDirty(next);
      onDirtyChange(next);
    },
    [onDirtyChange],
  );
  const changeView = (next: View) => {
    if (next === view) return;
    if (dirty && !window.confirm(LEAVE_FORM_CONFIRM)) return;
    setView(next);
  };
  return (
    <ScreenLayout
      header={
        <ScreenHeader>
          <h1 className="text-xl font-bold">からだ</h1>
          <p className="mt-1 text-xs text-slate-300">
            機種が違う測定は並べて比べません。
          </p>
          <div className="mt-3 flex gap-2" role="group" aria-label="表示">
            {VIEWS.map((item) => (
              <Chip
                key={item.key}
                tone="dark"
                size="sm"
                selected={view === item.key}
                aria-pressed={view === item.key}
                onClick={() => changeView(item.key)}
              >
                {item.label}
              </Chip>
            ))}
          </div>
        </ScreenHeader>
      }
    >
      {view === "body" ? (
        <BodySection settings={settings} onDirtyChange={reportDirty} />
      ) : (
        <BoneSection onDirtyChange={reportDirty} />
      )}
    </ScreenLayout>
  );
}
