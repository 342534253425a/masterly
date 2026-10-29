import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

/** Линтер архитектуры Feature-Sliced Design: слои, слайсы, публичные API, запрет кросс-импортов. */
export default defineConfig([
  ...fsd.configs.recommended,
  {
    rules: {
      // В демо часть сущностей используется пока одной страницей — это осознанно
      'fsd/insignificant-slice': 'off',
      // 23 фичи — по одной на действие пользователя: плоский список нагляднее групп; группируем по доменам, когда фич станет больше 30
      'fsd/excessive-slicing': 'off',
    },
  },
]);
