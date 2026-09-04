import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dev-dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Tracked as debt rather than a build gate: ~390 existing sites to type properly.
      "@typescript-eslint/no-explicit-any": "warn",
      // Best-effort storage/IndexedDB access deliberately swallows failures.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // Build scripts and PostCSS config run under Node, not in the browser.
    extends: [js.configs.recommended],
    files: ["scripts/**/*.{js,mjs,cjs}", "*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    // Supabase Edge Functions run on Deno.
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node, Deno: "readonly" },
    },
  },
);
