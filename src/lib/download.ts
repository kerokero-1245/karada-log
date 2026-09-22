/**
 * ブラウザからファイルを保存する／クリップボードに入れる小さな道具。
 *
 * iOS Safari ではクリップボードが使えないことがある（許可が無い・HTTPS でない など）。
 * 使えなくても操作が止まらないように、成否を boolean で返して呼び出し側で手動コピーに逃がす。
 */

export function downloadText(fileName: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // click 直後に revoke するとダウンロードが始まらない環境があるので少し待つ
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** コピーできたら true。できなければ false（例外は投げない） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
