import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
    {
        ignores: [
            "node_modules/**",
            "coverage/**",
            "playwright-report/**",
            "test-results/**",
            "_site/**",
            "_build/**"
        ]
    },
    js.configs.recommended,
    {
        files: ["app/**/*.mts"],
        extends: [tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.es2024
            }
        },
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "after-used",
                    caughtErrors: "none",
                    ignoreRestSiblings: true
                }
            ]
        }
    },
    {
        files: [
            "eslint.config.mjs",
            "playwright.config.mjs",
            "scripts/**/*.mjs"
        ],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.es2024
            }
        }
    },
    {
        files: ["tests/**/*.mts"],
        extends: [tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2024
            }
        }
    }
]);
