import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SmartSearch } from './smart-search';

/** Подсказки приходят из тех же MSW-хендлеров (@masterly/mock-api), что и в демо-режиме приложения. */
const meta = {
  title: 'features/search-by-problem/SmartSearch',
  component: SmartSearch,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="h-[520px] w-[680px] max-w-full"><Story /></div>],
} satisfies Meta<typeof SmartSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hero: Story = { args: { variant: 'hero' } };
export const Prefilled: Story = { args: { variant: 'hero', defaultValue: 'разбил экран айфон 13 про', autoFocus: true } };
export const Compact: Story = { args: { variant: 'compact' } };
