/**
 * 推移グラフの縦の範囲（lib/trendChart.ts）。トレの推移と体組成の推移の両方が使う。
 *
 * 点が 1 つ・値がすべて同じでも崩れないように上下へ 1 ずつ余白を取り、それ以外は幅の 15% を足す。
 * 目標ライン（体組成）は点の外にあっても見えるように、範囲に含める。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { trendRange } from "../src/lib/trendChart.ts";

test("trendChart.trendRange: 幅が 0（点が 1 つ・全部同じ値）なら上下に 1 ずつ", () => {
  assert.deepEqual(trendRange([40]), { lo: 39, hi: 41 });
  assert.deepEqual(trendRange([40, 40, 40]), { lo: 39, hi: 41 });
});

test("trendChart.trendRange: 幅があれば上下に幅の 15% を足す", () => {
  const { lo, hi } = trendRange([40, 50]);
  assert.ok(Math.abs(lo - 38.5) < 1e-9, `lo=${lo}`);
  assert.ok(Math.abs(hi - 51.5) < 1e-9, `hi=${hi}`);
});

test("trendChart.trendRange: 目標ラインの値も範囲に入れる（点より下でも上でも）", () => {
  const below = trendRange([14, 15], [11]);
  assert.ok(below.lo < 11 && below.hi > 15, JSON.stringify(below));
  const above = trendRange([55], [56]);
  assert.ok(above.lo < 55 && above.hi > 56, JSON.stringify(above));
  // 目標が点と同じ値なら、幅 0 の扱い（±1）
  assert.deepEqual(trendRange([56], [56]), { lo: 55, hi: 57 });
});

test("trendChart.trendRange: 最小幅を渡すと、それより狭い範囲は中央を保ったまま最小幅まで広げる", () => {
  // 除脂肪 56 → 55.9（0.1kg の差）が、描画域いっぱいの急落に見えないように
  const narrow = trendRange([56, 56, 55.9], [56], { minSpan: 2 });
  assert.ok(Math.abs(narrow.hi - narrow.lo - 2) < 1e-9, JSON.stringify(narrow));
  assert.ok(
    Math.abs((narrow.hi + narrow.lo) / 2 - 55.95) < 1e-9,
    JSON.stringify(narrow),
  );
  // 最小幅より広ければ今までどおり（幅の 15% を足すだけ）
  const wide = trendRange([40, 50], [], { minSpan: 2 });
  assert.ok(Math.abs(wide.lo - 38.5) < 1e-9 && Math.abs(wide.hi - 51.5) < 1e-9);
  // 幅が 0 でも最小幅になる
  assert.deepEqual(trendRange([56], [56], { minSpan: 4 }), { lo: 54, hi: 58 });
});

test("trendChart.trendRange: 最小幅を渡さなければ広げない（トレの推移の既定は変えない）", () => {
  const { lo, hi } = trendRange([56, 56, 55.9], [56]);
  assert.ok(Math.abs(hi - lo - 0.13) < 1e-9, JSON.stringify({ lo, hi }));
});
