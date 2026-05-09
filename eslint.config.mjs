import js from "@eslint/js";
import globals from "globals";

export default [
    {
        ignores: [
            "node_modules/**",
            "coverage/**",
            "playwright-report/**",
            "test-results/**"
        ]
    },
    js.configs.recommended,
    {
        files: ["app/**/*.js", "app/**/*.mjs"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.es2024
            }
        },
        rules: {
            "no-unused-vars": [
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
        files: ["tests/**/*.mjs"],
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
];
