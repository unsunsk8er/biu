import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      'dist/**',
      'dist-harmony/**',
      'dist-electron/**',
      'release/**',
      'node_modules/**',
      'platform/**',
      'archive/**',
      'android/**',
      '.android-tools/**',
      'scripts/smoke/out/**',
      'scripts/smoke/userdata/**',
      '.archive/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs,js,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // TypeScript 已经负责未定义/未使用检查，避免与 tsc 重复误报。
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // 渲染层不保留调试输出；warn/error 用于错误边界与诊断。
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      // preload/冒烟脚本是 CommonJS，require 是唯一合法的加载方式。
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]
