import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['.output', '.wxt', 'node_modules', '.superpowers/'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Only eslint.config.js lies outside every tsconfig project.
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
      },
    },
  },
  // core/ is framework-free: no framework, storage or browser access.
  {
    files: ['core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'wxt', message: 'core/ must not import wxt.' },
            { name: 'preact', message: 'core/ must not import preact.' },
            { name: 'idb', message: 'core/ must not import idb.' },
          ],
          patterns: [
            { group: ['wxt/*'], message: 'core/ must not import wxt.' },
            { group: ['preact/*'], message: 'core/ must not import preact.' },
            {
              group: ['**/shell/**', '**/entrypoints/**'],
              message: 'core/ must not import from shell/ or entrypoints/.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'browser',
          'chrome',
          'window',
          'document',
          'navigator',
          'indexedDB',
          'localStorage',
        ].map((name) => ({
          name,
          message: 'core/ must not touch the DOM or browser APIs.',
        })),
      ],
    },
  },
);
