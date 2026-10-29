import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'storybook-static/**', 'next-env.d.ts', 'public/sw.js']),
  {
    rules: {
      // Feature-Sliced Design: импорт только через Public API слайса (index.ts)
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Исключение — кросс-импорт сущностей через @x (FSD): @/entities/catalog/@x/master
              group: ['@/entities/*/*', '!@/entities/*/@x', '@/features/*/*', '@/widgets/*/*', '@/pages/*/*'],
              message: 'Импортируйте через Public API слайса: @/entities/master, а не @/entities/master/ui/...',
            },
          ],
        },
      ],
    },
  },
]);
