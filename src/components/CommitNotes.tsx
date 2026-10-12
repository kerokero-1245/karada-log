/**
 * 「記録した / 取り込んだ」あとのお知らせの共通の文。
 * 今日の画面の「○件を記録しました」の下と、取り込みシートの完了表示で同じ言い方を使う。
 */
import type { LearnedAlias } from "../lib/quickRecord";

/** 栄養値を持たない未処理テキストを預かったこと（集計には入らない） */
export function PendingNote({ count }: { count: number }) {
  return <p>{count}件は未処理として預かりました。集計には入っていません。</p>;
}

/** 手で選んだ食品の呼び名を覚えたこと（次回から自動で当てる） */
export function LearnedNotes({ items }: { items: LearnedAlias[] }) {
  return (
    <>
      {items.map((item) => (
        <p key={item.text}>
          次回から「{item.text}」はこの食品として認識します（{item.foodName}
          ）。
        </p>
      ))}
    </>
  );
}
