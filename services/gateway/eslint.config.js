import js from "@eslint/js";
import tseslint from "typescript-eslint";

const globals = {
  Buffer: "readonly",
  URL: "readonly",
  console: "readonly",
  fetch: "readonly",
  process: "readonly"
};

export default tseslint.config(
  {
    ignores: ["dist", "coverage"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error"
    }
  }
);
