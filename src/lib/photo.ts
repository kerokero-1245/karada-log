/**
 * 写真の前処理。撮った写真を「送れる大きさ」に直して base64 にする。
 *
 * ★ 写真そのものは保存しない。★
 *   IndexedDB にも localStorage にも入れない。ここで作った base64 は
 *   API 呼び出しの引数として渡すだけで、結果（読み取った数値）だけが記録に残る。
 *
 * 長辺 1568px は Claude の画像入力で無駄なく使える上限の目安。これより大きく送っても
 * 精度は上がらず、通信量と料金だけが増える。
 *
 * 向きの補正は createImageBitmap の imageOrientation: 'from-image' に任せる。
 * スマホの写真は EXIF で横倒しになっていることがあり、そのまま送るとラベルが
 * 90度回った状態で渡ることになる。未対応のブラウザでは補正せずそのまま進める
 * （読めないわけではないので、機能を止めるほどではない）。
 */
import { IMAGE_MESSAGE, PhotoError } from './photoError';

/** 長辺の上限 */
export const MAX_EDGE = 1568;
/** JPEG の品質。ラベルの小さい文字が潰れない範囲で軽くする */
export const JPEG_QUALITY = 0.85;

export type PhotoMediaType = 'image/jpeg';

export interface PhotoImage {
  /** data URL の接頭辞を除いた base64 */
  base64: string;
  mediaType: PhotoMediaType;
  width: number;
  height: number;
  /** 送信データのおおよそのバイト数（画面に出す目安） */
  bytes: number;
}

interface Source {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function fromBitmap(file: File): Promise<Source | null> {
  if (typeof createImageBitmap !== 'function') return null;
  for (const options of [{ imageOrientation: 'from-image' } as const, undefined]) {
    try {
      const bitmap = options === undefined ? await createImageBitmap(file) : await createImageBitmap(file, options);
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // imageOrientation 未対応 → オプション無しで再挑戦。それも駄目なら <img> に落とす
    }
  }
  return null;
}

function fromImageElement(file: File): Promise<Source> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        release: () => URL.revokeObjectURL(url),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PhotoError('image', IMAGE_MESSAGE));
    };
    image.src = url;
  });
}

/** 画像ファイル → 長辺1568px 以下の JPEG（base64）。写真は保存しない */
export async function fileToPhoto(file: File): Promise<PhotoImage> {
  if (!file.type.startsWith('image/')) {
    throw new PhotoError('image', '画像ファイルを選んでください。');
  }

  const source = (await fromBitmap(file)) ?? (await fromImageElement(file));
  try {
    if (source.width <= 0 || source.height <= 0) {
      throw new PhotoError('image', IMAGE_MESSAGE);
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) throw new PhotoError('image', IMAGE_MESSAGE);
    // 縮小時のジャギーを抑える。ラベルの細い文字が読めるかどうかに効く
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source.image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const comma = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:image/jpeg') || comma < 0) {
      throw new PhotoError('image', IMAGE_MESSAGE);
    }
    const base64 = dataUrl.slice(comma + 1);

    return {
      base64,
      mediaType: 'image/jpeg',
      width,
      height,
      // base64 は元データの 4/3 の長さになる
      bytes: Math.round((base64.length * 3) / 4),
    };
  } finally {
    source.release();
  }
}

/** 「約 240KB」。送信量の目安表示用 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
}
