/**
 * 食品のバッジ（食べ方・推定値・在庫切れ）。
 * 数字の出どころ（推定値）と在庫の状態を、どの画面でも同じ見た目で出す。
 * バッジだけを並べる（囲みの要素は付けない）ので、呼ぶ側の flex の中にそのまま置ける。
 */
import { Badge } from "./ui";

export function FoodBadges({
  variantLabel = null,
  estimated = false,
  archived = false,
}: {
  /** 食べ方（バリアント名）。無ければ出さない */
  variantLabel?: string | null;
  /** 値が推定（Food.source === "estimated"）か */
  estimated?: boolean;
  /** 在庫切れか */
  archived?: boolean;
}) {
  return (
    <>
      {variantLabel && <Badge tone="blue">{variantLabel}</Badge>}
      {estimated && <Badge tone="amber">推定値</Badge>}
      {archived && <Badge tone="slate">在庫切れ</Badge>}
    </>
  );
}
