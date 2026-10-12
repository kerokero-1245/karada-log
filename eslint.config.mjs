// ESLint 10 の flat config。
// 型情報を使う規則は入れない（型は tsc -b が見る）。
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["node_modules/", "dist/", "dist-ssr/"]),

  // JS / TS 全部に ESLint 本体の recommended。*.ts / *.tsx にはさらに typescript-eslint の recommended（型情報なし）
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    extends: [js.configs.recommended],
  },
  {
    files: ["**/*.{ts,tsx}"],
    // react-hooks は recommended 一式（rules-of-hooks・exhaustive-deps と React Compiler 系の規則）を入れる
    extends: [
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      // 移行前の lint 設定から引き継いだ 2 規則（rules-of-hooks・only-export-components）
      "react-hooks/rules-of-hooks": "error",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // react-hooks/refs は、プラグイン（eslint-plugin-react-hooks 7）の README が "React Compiler rules" に
      // 分類している規則。この repo は React Compiler を使わない（vite.config.ts の react() に設定がない）。
      // Expo の 4 repo と揃えて off にする。
      "react-hooks/refs": "off",
      // const { key: _key, ...rest } = obj のように、rest で落とすためだけに分割した名前は未使用と見なさない
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
    },
  },

  // 動く場所ごとの globals: src はブラウザ、tests/ と設定ファイルは Node
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["tests/**/*.{ts,mjs}", "*.config.{mjs,ts}"],
    languageOptions: { globals: globals.node },
  },
]);
