/**
 * 初回だけ出す案内カードの表示判定。
 *
 * 「閉じる」を押したら二度と出さない。覚えておく先は localStorage のキー 1 つだけにして、
 * Dexie のスキーマ・設定・データの流れには入れない（バックアップや復元の対象にもしない）。
 * 判定は純粋関数にして tests/firstRunGuide.test.ts で固定する。
 */

/** localStorage のキー。 */
export const GUIDE_STORAGE_KEY = 'karada-log.firstRunGuide';

/** 「閉じた」ことを表す保存値。 */
export function dismissedValue(): string {
  return 'dismissed';
}

/** 保存値（localStorage.getItem の戻り値）から、案内カードを出すかを決める。閉じた印が無ければ出す。 */
export function shouldShowGuide(storageValue: string | null): boolean {
  return storageValue !== dismissedValue();
}
