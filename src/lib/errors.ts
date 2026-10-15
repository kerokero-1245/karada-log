/**
 * 失敗の表示に使う文字列。
 *
 * 利用者に読ませる本文は固定の日本語（failureText）にする。例外のメッセージ（errorMessage）は
 * 本文に混ぜず、末尾に小さく添える（components/ui.tsx の ErrorText・ErrorDetail）。
 * 開発時の手掛かりは残すが、本文は例外の内容で変わらない。
 * 写真の読み取り（Claude API）の例外は、メッセージを日本語に直す lib/photoError.ts の
 * photoErrorMessage を使う。DB への保存など、それ以外の失敗はここ。
 */

/**
 * 例外から、本文の末尾に添える内容を取り出す。
 *
 * Error ならその message、それ以外（throw された文字列や値）は String(e)。
 */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 保存に失敗したときの見出し（ErrorText の label） */
export const SAVE_FAILED = "保存できませんでした";

/** 削除に失敗したときの見出し（ErrorText の label） */
export const DELETE_FAILED = "削除できませんでした";

/**
 * 失敗の本文（固定の日本語）。何が失敗したか（label）に、やり直しの案内を続ける。
 * 例: 「保存できませんでした。もう一度お試しください。」
 */
export function failureText(label: string): string {
  return `${label}。もう一度お試しください。`;
}
