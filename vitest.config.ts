import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'core/**/*.test.ts',
            'shell/**/*.test.ts',
            'guard/source-rules.test.ts',
            'tools/**/*.test.ts',
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
