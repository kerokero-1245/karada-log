/**
 * 「写真から」の入口。料理の写真か、栄養成分表示かを選ぶ。
 *
 * ★ ここでは何も保存しない。★
 *   読み取った結果を親に渡すだけ。
 *   ラベルなら登録フォームを埋めて開き、料理ならプレビューを出す。
 *   記録に入るのは、そのあとユーザーがボタンを押したときだけ（原則1）。
 *
 * 写真は API に送るためだけに使い、端末にも残さない。
 */
import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Note } from '../../components/ui';
import { fileToPhoto } from '../../lib/photo';
import { photoErrorMessage } from '../../lib/photoError';
import { useOnline } from '../../lib/useOnline';
import { estimateMealPhoto, readNutritionLabel } from '../../lib/vision';
import type { LabelRead, MealPhotoRead } from '../../lib/vision';
import { PhotoFileButton } from './PhotoFileButton';

type Kind = 'meal' | 'label';

const BUSY_LABELS: Record<Kind, string> = {
  meal: '料理の写真を読み取っています…',
  label: '栄養成分表示を読み取っています…',
};

export function PhotoPickSheet({
  apiKey,
  onLabel,
  onMeal,
  onBack,
  onClose,
}: {
  apiKey: string;
  onLabel: (read: LabelRead) => void;
  onMeal: (read: MealPhotoRead) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const online = useOnline();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: Kind, file: File) => {
    setBusy(kind);
    setError(null);
    try {
      const photo = await fileToPhoto(file);
      if (kind === 'label') {
        onLabel(await readNutritionLabel(photo.base64, photo.mediaType, apiKey));
      } else {
        onMeal(await estimateMealPhoto(photo.base64, photo.mediaType, apiKey));
      }
      // 成功したときは親が画面を切り替えるので、ここで busy は戻さない
    } catch (e) {
      setError(photoErrorMessage(e));
      setBusy(null);
    }
  };

  const disabled = !online || busy !== null;

  return (
    <Sheet title="写真から" subtitle="写真は保存されません" onBack={onBack} onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
          <div>
            <PhotoFileButton
              variant="primary"
              className="h-14 w-full text-base"
              label="料理の写真"
              inputLabel="料理の写真を選ぶ"
              disabled={disabled}
              onFile={(file) => void run('meal', file)}
            />
            <Note>お皿の写真から品目と量を見積もります。数値は概算です。</Note>
          </div>

          <div>
            <PhotoFileButton
              variant="primary"
              className="h-14 w-full text-base"
              label="栄養成分表示"
              inputLabel="栄養成分表示を選ぶ"
              disabled={disabled}
              onFile={(file) => void run('label', file)}
            />
            <Note>パッケージの表示を読み取って、新しい食品の登録フォームを埋めます。</Note>
          </div>
        </div>

        {!online && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            オフラインでは使えません。電波の届くところでお試しください。
          </p>
        )}

        {busy !== null && (
          <p className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900" role="status">
            {BUSY_LABELS[busy]}（10〜30秒ほどかかります）
          </p>
        )}

        {error !== null && (
          <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
        )}

        <Note>
          写真は Anthropic に送って読み取り、結果だけを使います。写真そのものはこの端末にも残りません。
          読み取った数値は概算です。記録に入れる前に画面で確かめられます。
        </Note>
      </div>
    </Sheet>
  );
}
