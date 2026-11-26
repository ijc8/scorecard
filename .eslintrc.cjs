module.exports = {
    root: true,
    env: { browser: true, es2022: true, worker: true },
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:react-hooks/recommended"],
    ignorePatterns: ["dist", "public", ".eslintrc.cjs"],
    parser: "@typescript-eslint/parser",
    rules: {
        // The code leans on `any` at its edges (worklet messages, vendored libraries).
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
        // Several effects deliberately run once, or only when one particular value changes.
        "react-hooks/exhaustive-deps": "off",
        "no-empty": ["error", { allowEmptyCatch: true }],
        "prefer-const": ["error", { destructuring: "all" }],
    },
}
