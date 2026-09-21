/**
 * 食事記録のフルスクリーンシート。
 *
 * 入力方法は2つ。既定は「テキスト」。
 *  - テキスト: 食べたものをまとめて書いて、解釈した結果を確認してから記録する
 *  - 検索: 検索 →（バリアント選択）→ 数量・時刻 → 「記録に追加」の1本道。
 *    検索が空のときは「よく食べるもの」（useCount 降順）を上位10件だけ出す
 */
import { useMemo, useState } from 'react';
import { db } from '../../db/db';
import type { Food, LogDate } from '../../db/types';
import { Sheet } from '../../components/Sheet';
import { Button, Note } from '../../components/ui';
import { useLiveQuery } from '../../lib/useLiveQuery';
import { formatLogDateShort } from '../../lib/date';
import type { QuickCommitResult } from '../../lib/quickRecord';
import { FoodList } from './FoodList';
import { NewFoodForm } from './NewFoodForm';
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
  | { kind: 'quantity'; food: Food; from: 'list' | 'variant' | 'new' }
  | { kind: 'newFood'; name: string };

export function MealAddSheet({
  logDate,
  boundaryHour,
  initialText = '',
  pendingId = null,
  onClose,
  onRecorded,
}: {
  logDate: LogDate;
  boundaryHour: number;
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

  if (mode === 'text') {
    return (
      <QuickTextSheet
        logDate={logDate}
        boundaryHour={boundaryHour}
        initialText={initialText}
        pendingId={pendingId}
        onClose={onClose}
        onRecorded={onRecorded}
        onSwitchToSearch={() => setMode('search')}
      />
    );
  }

  if (step.kind === 'variant') {
    return (
      <VariantPicker
        group={step.group}
        onSelect={(food) => setStep({ kind: 'quantity', food, from: 'variant' })}
        onBack={() => setStep({ kind: 'list' })}
        onClose={onClose}
      />
    );
  }

  if (step.kind === 'quantity') {
    const back = step.from === 'list' || step.from === 'new' ? { kind: 'list' as const } : null;
    return (
      <QuantityStep
        food={step.food}
        logDate={logDate}
        boundaryHour={boundaryHour}
        onBack={() => setStep(back ?? { kind: 'list' })}
        onClose={onClose}
        onAdded={onClose}
      />
    );
  }

  if (step.kind === 'newFood') {
    return (
      <NewFoodForm
        initialName={step.name}
        onSaved={(food) => setStep({ kind: 'quantity', food, from: 'new' })}
        onBack={() => setStep({ kind: 'list' })}
        onClose={onClose}
      />
    );
  }

  return (
    <Sheet title="記録する" subtitle={`${formatLogDateShort(logDate)} の記録`} onClose={onClose}>
      <div className="space-y-3">
        <ModeTabs mode="search" onChange={setMode} />

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
              onClick={() => setStep({ kind: 'newFood', name: query.trim() })}
            >
              「{query.trim()}」をこの名前で新規登録
            </Button>
          </div>
        )}

        {!(searching && groups.length === 0) && (
          <Button className="w-full" onClick={() => setStep({ kind: 'newFood', name: query.trim() })}>
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
