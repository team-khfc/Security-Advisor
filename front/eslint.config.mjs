import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'react/no-danger': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.object.name="document"][callee.property.name="write"]',
          message: 'document.write 대신 React 렌더링을 사용하세요.',
        },
        {
          selector: 'CallExpression[callee.object.name="Math"][callee.property.name="random"]',
          message: '식별자는 crypto.randomUUID를 사용하세요.',
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'public/**', 'next-env.d.ts', 'coverage/**']),
]);
