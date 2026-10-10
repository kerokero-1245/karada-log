/**
 * 単体テスト（node --test）の準備。
 *
 * アプリのソースは Vite（bundler 解決）向けに拡張子なしで import している（'./date'）。
 * Node の ESM は拡張子を補わないので、相対パスで拡張子が無いものだけ '.ts' を足して解決し直す。
 * ただし node_modules の中から出た require / import は触らない（@anthropic-ai/sdk が読み込む
 * standardwebhooks などは、拡張子なしの相対パスを CommonJS のまま解決する）。
 * TypeScript の型は Node の型除去（Node 22.18 以降は既定で有効）で落とす。追加の依存は使わない。
 */
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);
    const fromDependency = (context.parentURL ?? "").includes("/node_modules/");
    if (relative && !hasExtension && !fromDependency)
      return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
