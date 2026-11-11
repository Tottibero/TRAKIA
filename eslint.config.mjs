import js from '@eslint/js'
import boundaries from 'eslint-plugin-boundaries'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import globals from 'globals'

const domainHttpImports = [
  'node:http',
  'node:http/**',
  'node:https',
  'node:https/**',
  'node:http2',
  'node:http2/**',
  'http',
  'http/**',
  'https',
  'https/**',
  'http2',
  'http2/**',
  'express',
  'express/**',
  'fastify',
  'fastify/**',
  'axios',
  'axios/**',
  'undici',
  'undici/**',
  'got',
  'got/**',
  'superagent',
  'superagent/**',
]

const presentationPersistenceImports = [
  '@nestjs/typeorm',
  '@nestjs/typeorm/**',
  'typeorm',
  'typeorm/**',
  '**/infrastructure/**',
  '**/*.entity',
  '**/*.entity.*',
  '**/*.repository',
  '**/*.repository.*',
]

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.cache/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,vue}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/**/*.ts', 'packages/**/*.ts', 'apps/**/*.vue'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'api-domain', pattern: 'apps/api/src/modules/*/domain/**' },
        { type: 'api-application', pattern: 'apps/api/src/modules/*/application/**' },
        { type: 'api-infrastructure', pattern: 'apps/api/src/modules/*/infrastructure/**' },
        { type: 'api-presentation', pattern: 'apps/api/src/modules/*/presentation/**' },
        { type: 'api-module', pattern: 'apps/api/src/modules/*' },
        { type: 'web-shared', pattern: 'apps/web/src/shared/**' },
        { type: 'web-feature', pattern: 'apps/web/src/features/*/**' },
        { type: 'contracts', pattern: 'packages/contracts/src/**' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'api-domain' } },
              disallow: [
                { to: { element: { type: 'api-application' } } },
                { to: { element: { type: 'api-infrastructure' } } },
                { to: { element: { type: 'api-presentation' } } },
              ],
            },
            {
              from: { element: { type: 'api-application' } },
              disallow: [{ to: { element: { type: 'api-presentation' } } }],
            },
            {
              from: { element: { type: 'api-presentation' } },
              disallow: [{ to: { element: { type: 'api-infrastructure' } } }],
            },
            {
              from: { element: { type: 'web-shared' } },
              disallow: [{ to: { element: { type: 'web-feature' } } }],
            },
            {
              from: { element: { type: 'contracts' } },
              disallow: [
                'api-domain',
                'api-application',
                'api-infrastructure',
                'api-presentation',
                'api-module',
                'web-shared',
                'web-feature',
              ].map((type) => ({ to: { element: { type } } })),
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/modules/*/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                'typeorm',
                ...domainHttpImports,
                '**/application/**',
                '**/infrastructure/**',
                '**/presentation/**',
              ],
              message: 'Domain solo depende de código de dominio y librerías neutrales.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Domain no debe realizar llamadas HTTP.' },
      ],
    },
  },
  {
    files: ['packages/contracts/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', 'typeorm', '**/apps/api/**', '**/apps/web/**'],
              message: 'Contracts es independiente de frameworks de servidor y aplicaciones.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/modules/*/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/presentation/**', '**/*.controller'],
              message: 'Application no depende de Presentation.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/modules/*/presentation/**/*.{ts,tsx}', 'apps/api/src/modules/**/*.controller.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: presentationPersistenceImports,
              message: 'Presentation y controladores usan Application; no acceden a persistencia interna.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.vue'],
    languageOptions: { globals: { console: 'readonly', fetch: 'readonly', window: 'readonly' } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/api/**', '**/*.entity'],
              message: 'La web consume contratos externos, no entidades TypeORM.',
            },
            {
              group: ['../../features/**', '../features/**'],
              message: 'shared no puede depender de features; usa una API pública.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/test/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
      },
    },
  },
  { files: ['.dependency-cruiser.cjs'], languageOptions: { globals: { module: 'readonly' } } },
)
