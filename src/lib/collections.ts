/**
 * 配列まわりの小さな共通処理。
 */

/** id が付いている行の id を並べる（まだ保存していない行 = id なしは飛ばす） */
export function idsOf(rows: readonly { id?: number }[]): number[] {
  return rows
    .map((row) => row.id)
    .filter((id): id is number => id !== undefined);
}

/**
 * list を keyOf の値ごとに束ねる。
 *
 * Map のキーは最初に現れた順、各グループの中は元の並びのまま
 * （書き出しの行や候補の並びは、この挿入順がそのまま出力になる）。
 */
export function groupBy<T, K>(
  list: readonly T[],
  keyOf: (item: T) => K,
): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of list) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return groups;
}
