/**
 * 初回だけ出る案内カード。ダッシュボードの先頭に置く。
 * 「閉じる」で消え、localStorage に印を残して次からは出さない。
 * localStorage が使えない環境（読み書きで例外）では毎回出すが、閉じればその場では消える。
 */
import { useState } from "react";
import {
  GUIDE_STORAGE_KEY,
  dismissedValue,
  shouldShowGuide,
} from "../../lib/firstRunGuide";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(GUIDE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(GUIDE_STORAGE_KEY, dismissedValue());
  } catch {
    // 保存できなくても、この場では閉じる
  }
}

export function FirstRunGuideCard() {
  const [visible, setVisible] = useState(() => shouldShowGuide(readStored()));
  if (!visible) return null;

  const close = () => {
    writeDismissed();
    setVisible(false);
  };

  return (
    <section
      aria-labelledby="first-run-guide-title"
      className="rounded-xl border border-sky-200 bg-sky-50 p-3"
    >
      <h2 id="first-run-guide-title" className="text-sm font-bold text-sky-900">
        はじめに
      </h2>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-sky-900">
        <li>
          食べたものを記録すると、その日のカロリー・たんぱく質・脂質・塩分を目標と比べて確認できます。
        </li>
        <li>
          記録は「今日」タブの「＋
          記録する」や「テキストでまとめて記録」からできます。
        </li>
        <li>記録の書き出しやバックアップは「設定」タブからできます。</li>
      </ul>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={close}
          className="min-h-11 rounded-lg border border-sky-300 bg-white px-4 text-sm font-bold text-sky-800 active:bg-sky-100"
        >
          閉じる
        </button>
      </div>
    </section>
  );
}
