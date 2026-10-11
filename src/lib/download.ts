/** ブラウザからファイルを保存する小さな道具。クリップボードは lib/clipboard.ts */

export function downloadText(
  fileName: string,
  text: string,
  mimeType: string,
): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // click 直後に revoke するとダウンロードが始まらない環境があるので少し待つ
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
