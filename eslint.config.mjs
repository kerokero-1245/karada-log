// ESLint 10 の flat config（oxlint から移した）。
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
    extends: [tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    // react-hooks の recommended（reactHooks.configs.flat.recommended）は、rules-of-hooks と exhaustive-deps のほかに
    // React Compiler 系の 14 規則も有効にする。oxlint から引き継ぐ範囲を超えるので recommended は使わず、必要な規則だけを明示する。
    rules: {
      // .oxlintrc.json から引き継いだ 2 規則（react/rules-of-hooks・react/only-export-components）
      "react-hooks/rules-of-hooks": "error",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // src/lib/useLiveQuery.ts の抑止コメントが指す規則。重大度は plugin の recommended と同じ warn
      "react-hooks/exhaustive-deps": "warn",
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
