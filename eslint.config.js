import js from '@eslint/js';
import esbuild from 'esbuild';
import * as espree from 'espree';
import reactHooks from 'eslint-plugin-react-hooks';

const tsStripParser = {
  meta: {
    name: 'esbuild-ts-espree-parser',
    version: '1.0.0',
  },
  parseForESLint(code, options = {}) {
    const filePath = options.filePath || 'file.ts';
    const isTsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
    const transformed = esbuild.transformSync(code, {
      loader: isTsx ? 'tsx' : 'ts',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      format: 'esm',
      target: 'esnext',
    });

    const ast = espree.parse(transformed.code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      range: true,
      loc: true,
      tokens: true,
      comment: true,
    });

    return {
      ast,
      visitorKeys: espree.VisitorKeys,
    };
  },
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'src/assets/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'server.ts'],
    languageOptions: {
      parser: tsStripParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        Headers: 'readonly',
        FormData: 'readonly',
        AbortController: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        React: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
