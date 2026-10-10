/**
 * Dexie の add / bulkAdd が返す主キーを number にする。
 *
 * 各表の型は主キーを `id?: number` と宣言しているので、add の戻り値の型は `number | undefined` になる。
 * `++id`（自動採番）の表は必ず採番した id を返すので、undefined は起きない。起きたときに
 * undefined を黙って次の処理へ渡さず、その場で止める。
 *
 * bulkAdd(rows, { allKeys: true }) の戻り値は `.map(addedId)` で number[] にできる。
 */
export function addedId(key: number | undefined): number {
  if (key === undefined) {
    throw new Error("保存した行の id を取得できませんでした");
  }
  return key;
}
