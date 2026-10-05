/**
 * 食事記録のフルスクリーンシート。
 *
 * 入力方法は3つ。既定は「テキスト」。
 *  - テキスト: 食べたものをまとめて書いて、解釈した結果を確認してから記録する
 *  - 検索: 検索 →（バリアント選択）→ 数量・時刻 → 「記録に追加」の1本道。
 *    検索が空のときは「よく食べるもの」（useCount 降順）を上位10件だけ出す
 *  - 写真: 料理の写真 → プレビュー →「○件を記録」/ 栄養成分表示 → 登録フォーム → 数量
 *    （APIキーが設定されているときだけ出す。未設定なら入口ごと出さない）
 *
 * ★ どの経路でも、記録に入るのはユーザーが最後のボタンを押したときだけ（原則1）。★
 */
import { useMemo, useState } from 'react';
import { db } from '../../db/db';
import type { Food, LogDate } from '../../db/types';
import { Sheet } from '../../components/Sheet';
import { Button, Note } from '../../components/ui';
import { useLiveQuery } from '../../lib/useLiveQuery';
import { formatLogDateShort } from '../../lib/date';
import type { FoodFormValues } from '../../lib/foodForm';
import { formValuesFromLabel, labelNotice } from '../../lib/photoLabel';
import type { QuickCommitResult } from '../../lib/quickRecord';
import type { MealPhotoRead } from '../../lib/vision';
import { FoodList } from './FoodList';
import { NewFoodForm } from './NewFoodForm';
import { PhotoMealSheet } from './PhotoMealSheet';
import { PhotoPickSheet } from './PhotoPickSheet';
import { QuantityStep } from './QuantityStep';
import { QuickTextSheet } from './QuickTextSheet';
import { VariantPicker } from './VariantPicker';
import { ModeTabs } from './ModeTabs';
import type { MealAddMode } from './ModeTabs';
import type { FoodGroup } from './foodGroups';
import { groupFoods, matchesQuery, sortByFrequency } from './foodGroups';

const FREQUENT_LIMIT = 10;

type Step =
  | { kind: 'list' }
  | { kind: 'variant'; group: FoodGroup }
  | { kind: 'quantity'; food: Food; from: 'list' | 'new' }
  /** 食べ方の選択から来たときは、「戻る」で同じ食べ方の選択に戻す */
  | { kind: 'quantity'; food: Food; from: 'variant'; group: FoodGroup }
  | {
      kind: 'newFood';
      name: string;
      /** 写真から読み取った値で埋めて開くときだけ入る */
      values: FoodFormValues | null;
      notice: string | null;
      /** 「戻る」の行き先 */
      back: 'list' | 'photo';
    }
  | { kind: 'photo' }
  | { kind: 'photoMeal'; read: MealPhotoRead };

export function MealAddSheet({
  logDate,
  boundaryHour,
  apiKey = null,
  initialText = '',
  pendingId = null,
  onClose,
  onRecorded,
}: {
  logDate: LogDate;
  boundaryHour: number;
  /** 設定済みの Claude API キー。null なら写真の入口を出さない */
  apiKey?: string | null;
  /** テキストモードの初期値（ダッシュボードの入力欄・未処理テキストから開いたとき） */
  initialText?: string;
  /** 未処理テキストから開いたときの元の行。記録したら消す */
  pendingId?: number | null;
  onClose: () => void;
  onRecorded: (result: QuickCommitResult) => void;
}) {
  const foods = useLiveQuery(() => db.foods.toArray(), []);
  const [mode, setMode] = useState<MealAddMode>('text');
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'list' });

  const searching = query.trim() !== '';
  const groups = useMemo(() => {
    const visible = (foods ?? []).filter((food) => (showArchived || !food.archived) && matchesQuery(food, query));
    return sortByFrequency(groupFoods(visible));
  }, [foods, query, showArchived]);
  const shown = searching || showAll ? groups : groups.slice(0, FREQUENT_LIMIT);

  const selectGroup = (group: FoodGroup) => {
    if (group.foods.length > 1) setStep({ kind: 'variant', group });
    else setStep({ kind: 'quantity', food: group.foods[0], from: 'list' });
  };

  /* --- 写真（テキスト／検索のどちらからでも入れる） --- */

  if (step.kind === 'photo' && apiKey !== null) {
    return (
      <PhotoPickSheet
        apiKey={apiKey}
        onLabel={(read) =>
          setStep({
            kind: 'newFood',
            name: read.name ?? '',
            // ★ 読み取った値で埋めるだけ。保存は「登録」を押してから
            values: formValuesFromLabel(read),
            notice: labelNotice(read),
            back: 'photo',
          })
        }
        onMeal={(read) => setStep({ kind: 'photoMeal', read })}
        onBack={() => setStep({ kind: 'list' })}
        onClose={onClose}
      />
    );
  }

  if (step.kind === 'photoMeal') {
    return (
      <PhotoMealSheet
        read={step.read}
        logDate={logDate}
        boundaryHour={boundaryHour}
        onBack={() => setStep({ kind: 'photo' })}
        onClose={onClose}
        onRecorded={onRecorded}
      />
    );
  }

  if (step.kind === 'variant') {
    return (
      <VariantPicker
        group={step.group}
        onSelect={(food) => setStep({ kind: 'quantity', food, from: 'variant', group: step.group })}
        onBack={() => setStep({ kind: 'list' })}
        onClose={onClose}
      />
    );
  }

  if (step.kind === 'quantity') {
    const back: Step = step.from === 'variant' ? { kind: 'variant', group: step.group } : { kind: 'list' };
    return (
      <QuantityStep
        food={step.food}
        logDate={logDate}
        boundaryHour={boundaryHour}
        onBack={() => setStep(back)}
        onClose={onClose}
        onAdded={onClose}
      />
    );
  }

  if (step.kind === 'newFood') {
    const back = step.back;
    return (
      <NewFoodForm
        initialName={step.name}
        initialValues={step.values}
        initialNotice={step.notice}
        apiKey={apiKey}
        onSaved={(food) => setStep({ kind: 'quantity', food, from: 'new' })}
        onBack={() => setStep(back === 'photo' ? { kind: 'photo' } : { kind: 'list' })}
        onClose={onClose}
      />
    );
  }

  if (mode === 'text') {
    return (
      <QuickTextSheet
        logDate={logDate}
        boundaryHour={boundaryHour}
        apiKey={apiKey}
        initialText={initialText}
        pendingId={pendingId}
        onClose={onClose}
        onRecorded={onRecorded}
        onSwitchToSearch={() => setMode('search')}
        onPhoto={() => setStep({ kind: 'photo' })}
      />
    );
  }

  return (
    <Sheet title="記録する" subtitle={`${formatLogDateShort(logDate)} の記録`} onClose={onClose}>
      <div className="space-y-3">
        <ModeTabs mode="search" onChange={setMode} />

        {apiKey !== null && (
          <Button className="w-full" onClick={() => setStep({ kind: 'photo' })}>
            写真から
          </Button>
        )}

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・カテゴリで検索"
          className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
        />

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">
            {searching ? `検索結果（${groups.length}件）` : 'よく食べるもの'}
          </h3>
          <label className="flex min-h-11 items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-5 w-5"
            />
            在庫切れも表示する
          </label>
        </div>

        <FoodList groups={shown} onSelect={selectGroup} />

        {!searching && !showAll && groups.length > FREQUENT_LIMIT && (
          <Button className="w-full" onClick={() => setShowAll(true)}>
            すべて表示（{groups.length}件）
          </Button>
        )}

        {searching && groups.length === 0 && (
          <div className="rounded-xl bg-white p-3 text-center shadow-sm">
            <p className="text-sm text-slate-600">一致する食品がありません。</p>
            <Button
              variant="primary"
              className="mt-2 w-full"
              onClick={() =>
                setStep({ kind: 'newFood', name: query.trim(), values: null, notice: null, back: 'list' })
              }
            >
              「{query.trim()}」をこの名前で新規登録
            </Button>
          </div>
        )}

        {!(searching && groups.length === 0) && (
          <Button
            className="w-full"
            onClick={() =>
              setStep({ kind: 'newFood', name: query.trim(), values: null, notice: null, back: 'list' })
            }
          >
            新しい食品を登録
          </Button>
        )}

        <Note>
          栄養値は記録した時点の値をコピーして残します。あとで食品マスタを直しても、過去の記録は動きません。
        </Note>
      </div>
    </Sheet>
  );
}
