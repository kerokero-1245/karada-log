/**
 * オンラインかどうか。写真の読み取りは通信が要るので、圏外ではボタンを止める。
 *
 * navigator.onLine は「つながっている見込み」でしかないが、
 * 圏外で押してタイムアウトまで待たされるよりは、先に止めて理由を出すほうがよい。
 *
 * ブラウザ側の値をそのまま読む purpose なので useSyncExternalStore を使う
 * （effect で setState して同期させると、余分な再レンダリングが1回増える）。
 */
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // 画面を組み立てる側（SSR）では常にオンライン扱い。このアプリでは通らない
    () => true,
  );
}
