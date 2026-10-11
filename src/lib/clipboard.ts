/**
 * クリップボードに入れる小さな道具。
 *
 * iOS Safari ではクリップボードが使えないことがある（許可が無い・HTTPS でない など）。
 * 使えなくても操作が止まらないように、成否を boolean で返して呼び出し側で手動コピーに逃がす。
 */

/** コピーできたら true。できなければ false（例外は投げない） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText)
      return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
