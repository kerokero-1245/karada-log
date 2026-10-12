/**
 * 例外から、画面に出す文字列を取り出す。
 *
 * Error ならその message、それ以外（throw された文字列や値）は String(e)。
 * 写真の読み取り（Claude API）の例外は、メッセージを日本語に直す lib/photoError.ts の
 * photoErrorMessage を使う。DB への保存など、それ以外の失敗はここ。
 */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
