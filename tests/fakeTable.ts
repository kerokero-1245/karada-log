/**
 * Dexie の表（db.foods など）を、メモリ上の配列で動くものに差し替える。
 *
 * Node には IndexedDB が無いので、lib の読み書き関数を動かすには表のメソッドを差し替えるしかない。
 * 差し替えるのは lib が実際に使っている部分だけ（add / bulkAdd / put / get / bulkGet / update /
 * delete / toArray / count / filter / where(...).equals・anyOf・between・below / orderBy）。
 * 並びは Dexie と同じく「索引の値 → 主キー」の昇順にそろえる。
 * 差し替えは helpers.ts の stub を使うので、restoreStubs() で元に戻る。
 *
 * テストの本体ではない（*.test.ts ではないので node --test の対象にならない）。
 */
import { stub } from "./helpers.ts";

type Row = object;

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a < b ? -1 : 1;
}

/**
 * table の主なメソッドを rows（生きた配列）に向ける。戻り値は rows そのもの。
 * 主キーが数値の表は、add / bulkAdd で 1 から（最大の id の次から）採番する。
 */
export function fakeTable<T extends Row>(
  table: object,
  initial: T[] = [],
  keyPath = "id",
): T[] {
  const rows: T[] = [...initial];
  const keyOf = (row: Row): unknown => Reflect.get(row, keyPath);
  let nextId = Math.max(0, ...rows.map((row) => Number(keyOf(row)) || 0)) + 1;

  /** 索引の値 → 主キー の昇順に並べたもの */
  const ordered = (index: string): T[] =>
    [...rows].sort(
      (a, b) =>
        compare(Reflect.get(a, index), Reflect.get(b, index)) ||
        compare(keyOf(a), keyOf(b)),
    );

  const remove = (gone: T[]): number => {
    for (const row of gone) {
      const at = rows.indexOf(row);
      if (at >= 0) rows.splice(at, 1);
    }
    return gone.length;
  };

  const collection = (matched: () => T[]) => ({
    toArray: async () => matched(),
    count: async () => matched().length,
    sortBy: async (index: string) =>
      [...matched()].sort((a, b) =>
        compare(Reflect.get(a, index), Reflect.get(b, index)),
      ),
    delete: async () => remove(matched()),
    filter: (test: (row: T) => boolean) =>
      collection(() => matched().filter(test)),
  });

  const insert = (row: T): unknown => {
    const hasKey = keyOf(row) !== undefined;
    const id = hasKey ? keyOf(row) : nextId;
    if (!hasKey) nextId += 1;
    else if (typeof id === "number" && id >= nextId) nextId = id + 1;
    rows.push(hasKey ? row : { ...row, [keyPath]: id });
    return id;
  };

  stub(table, "add", async (row: T) => insert(row));
  stub(
    table,
    "bulkAdd",
    async (items: T[], options?: { allKeys?: boolean }) => {
      const keys = items.map((item) => insert(item));
      return options?.allKeys ? keys : keys[keys.length - 1];
    },
  );
  stub(table, "put", async (row: T) => {
    const at = rows.findIndex((existing) => keyOf(existing) === keyOf(row));
    if (at >= 0) rows[at] = row;
    else rows.push(row);
    return keyOf(row);
  });
  stub(table, "get", async (key: unknown) =>
    rows.find((row) => keyOf(row) === key),
  );
  stub(table, "bulkGet", async (keys: unknown[]) =>
    keys.map((key) => rows.find((row) => keyOf(row) === key)),
  );
  stub(table, "update", async (key: unknown, changes: object) => {
    const row = rows.find((existing) => keyOf(existing) === key);
    if (row === undefined) return 0;
    Object.assign(row, changes);
    return 1;
  });
  stub(table, "delete", async (key: unknown) => {
    remove(rows.filter((row) => keyOf(row) === key));
  });
  stub(table, "toArray", async () => ordered(keyPath));
  stub(table, "count", async () => rows.length);
  stub(table, "filter", (test: (row: T) => boolean) =>
    collection(() => ordered(keyPath).filter(test)),
  );
  stub(table, "orderBy", (index: string) => collection(() => ordered(index)));
  stub(table, "where", (index: string) => ({
    equals: (value: unknown) =>
      collection(() =>
        ordered(index).filter((row) => Reflect.get(row, index) === value),
      ),
    anyOf: (values: unknown[]) =>
      collection(() =>
        ordered(index).filter((row) =>
          values.includes(Reflect.get(row, index)),
        ),
      ),
    between: (
      lower: unknown,
      upper: unknown,
      includeLower = true,
      includeUpper = false,
    ) =>
      collection(() =>
        ordered(index).filter((row) => {
          const value = Reflect.get(row, index);
          const aboveLower =
            compare(value, lower) > 0 ||
            (includeLower && compare(value, lower) === 0);
          const belowUpper =
            compare(value, upper) < 0 ||
            (includeUpper && compare(value, upper) === 0);
          return aboveLower && belowUpper;
        }),
      ),
    below: (value: unknown) =>
      collection(() =>
        ordered(index).filter(
          (row) => compare(Reflect.get(row, index), value) < 0,
        ),
      ),
  }));

  return rows;
}
