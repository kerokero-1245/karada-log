/**
 * 型ガード。unknown を検査して、`as` を使わずに型を絞るための小さな関数。
 */

/** `{}` のようなオブジェクトか（null と配列は含まない） */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
