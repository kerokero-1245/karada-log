/**
 * 写真を1枚選ぶボタン。押すと隠した <input type="file"> を開く。
 * capture="environment" を付けているので、スマホでは背面カメラがそのまま立ち上がる。
 *
 * 同じ写真をもう一度選べるように、読み終わったら input の値を空に戻す
 * （戻さないと「同じファイルを選び直しても change が飛ばない」に引っかかる）。
 */
import { useRef } from 'react';
import { Button } from '../../components/ui';

export function PhotoFileButton({
  label,
  inputLabel,
  variant = 'secondary',
  className = '',
  disabled = false,
  onFile,
}: {
  /** ボタンに出す文字 */
  label: string;
  /** input の aria-label。支援技術と自動テストが掴む名前 */
  inputLabel: string;
  variant?: 'primary' | 'secondary';
  className?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        variant={variant}
        className={className}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label={inputLabel}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (file !== null) onFile(file);
        }}
      />
    </>
  );
}
