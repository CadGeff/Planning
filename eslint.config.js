// ESLint (configuration « flat ») : règles recommandées + quelques règles de rigueur.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["public/vendor/**", "node_modules/**", "playwright-report/**", "test-results/**"] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "no-implicit-globals": "error",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "object-shorthand": "error",
      "prefer-template": "error",
    },
  },
  // Application (navigateur, modules ES)
  {
    files: ["public/js/**/*.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.browser } },
  },
  // Scripts classiques chargés tels quels par le navigateur
  {
    files: ["public/theme.js", "public/config.js"],
    languageOptions: { sourceType: "script", globals: { ...globals.browser } },
  },
  {
    files: ["public/sw.js"],
    languageOptions: { sourceType: "script", globals: { ...globals.serviceworker } },
  },
  // Outillage et tests (Node)
  {
    files: ["*.js", "tests/**/*.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.node } },
    rules: { "no-console": "off" },
  },
  // Code exécuté dans la page par Playwright (page.evaluate)
  {
    files: ["tests/e2e/**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
