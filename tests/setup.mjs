/**
 * 単体テスト（node --test）の準備。
 *
 * アプリのソースは Vite（bundler 解決）向けに拡張子なしで import している（'./date'）。
 * Node の ESM は拡張子を補わないので、相対パスで拡張子が無いものだけ '.ts'（無ければ '.tsx'）を足して解決し直す。
 * ただし node_modules の中から出た require / import は触らない（@anthropic-ai/sdk が読み込む
 * standardwebhooks などは、拡張子なしの相対パスを CommonJS のまま解決する）。
 * TypeScript の型は Node の型除去（Node 22.18 以降は既定で有効）で落とす。
 * .tsx（グラフの SVG を renderToStaticMarkup で見るテスト）は、型除去が JSX を扱えないので、
 * devDependencies の typescript の transpileModule で JS に変換して読む。追加の依存は使わない。
 */
import { createRequire, registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let ts = null;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);
    const parent = context.parentURL ?? "";
    const fromDependency = parent.includes("/node_modules/");
    if (relative && !hasExtension && !fromDependency) {
      const base = new URL(specifier, parent);
      const tsx = new URL(`${base.href}.tsx`);
      const useTsx =
        !existsSync(fileURLToPath(`${base.href}.ts`)) &&
        existsSync(fileURLToPath(tsx));
      return nextResolve(`${specifier}${useTsx ? ".tsx" : ".ts"}`, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith(".tsx")) return nextLoad(url, context);
    ts ??= require("typescript");
    const fileName = fileURLToPath(url);
    const out = ts.transpileModule(readFileSync(fileName, "utf8"), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: true,
      },
      fileName,
    });
    return { format: "module", source: out.outputText, shortCircuit: true };
  },
});
