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
    // Node utility scripts (ESM). typescript-eslint disables no-undef for .ts
    // files, but plain .mjs scripts need the Node globals declared explicitly.
    files: ["scripts/**/*.mjs", "scripts/**/*.js", "**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        __dirname: "readonly"
      }
    }
  },
  {
    ignores: ["dist/**", "**/dist/**", "node_modules/**"]
  }
];
