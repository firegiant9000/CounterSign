import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          // The first typed lint in guard/source-rules.test.ts builds a TypeScript program.
          testTimeout: 60_000,
          include: [
            'core/**/*.test.ts',
            'shell/**/*.test.ts',
            'guard/source-rules.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'build',
          environment: 'node',
          include: ['guard/build.test.ts'],
        },
      },
    ],
  },
});
