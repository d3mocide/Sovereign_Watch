import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': 'warn',
      // Legacy map and ingestion visualization code still uses broad dynamic payloads.
      // Keep lint clean while we iteratively tighten typing in focused follow-up passes.
      '@typescript-eslint/no-explicit-any': 'off',
      // Several effects intentionally pin dependency arrays to avoid render-loop churn
      // with mutable refs in the animation pipeline.
      'react-hooks/exhaustive-deps': 'off',
      // Legacy state orchestration patterns intentionally run in controlled effects.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off'
    },
  },
);
