import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json"
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["web/src/**/*.ts"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        MessageEvent: "readonly",
        Record: "readonly"
      }
    }
  },
  {
    ignores: ["dist/**", "**/dist/**", "node_modules/**"]
  }
];
