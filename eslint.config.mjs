import next from "eslint-config-next";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next ships flat configs in v16; the TypeScript rules (and the
// @typescript-eslint plugin they depend on) live in the separate subpath.
const config = [
  {
    ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**"],
  },
  ...next,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
