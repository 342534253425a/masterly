import type { StorybookConfig } from '@storybook/nextjs-vite';

/** Storybook 10 + Next.js (Vite): каталог дизайн-системы и изолированная разработка слоёв FSD. */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', 'msw-storybook-addon'],
  framework: { name: '@storybook/nextjs-vite', options: {} },
  staticDirs: ['../public', './public'],
  docs: { defaultName: 'Документация' },
};

export default config;
