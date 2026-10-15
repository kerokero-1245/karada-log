/**
 * 数値の文字入力（入力したままの文字列を持つ。検証と数値への変換は呼ぶ側の純関数で行う）。
 * 空欄を 0 にしないフォーム（食品の栄養成分・体組成）に使う。増減ボタンが要る欄は NumberField。
 * label は見出しの label 要素で包まないとき（表の中の欄など）の読み上げ名。
 */
export function NumberInput({
  value,
  onChange,
  suffix,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  label?: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base tabular-nums"
      />
      {/* 単位の幅をそろえて、「kcal」と「g」の欄で入力欄の幅がずれないようにする */}
      {suffix && (
        <span className="w-8 shrink-0 text-xs text-slate-500">{suffix}</span>
      )}
    </span>
  );
}
