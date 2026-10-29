import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArrowRight, Heart, Search, Send } from 'lucide-react';
import { Button } from './button';

const meta = {
  title: 'shared/ui/Button',
  component: Button,
  args: { children: 'Оставить заявку' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'outline', 'ghost', 'soft', 'danger', 'success', 'link'] },
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg', 'xl'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary', children: (<><Send />Оставить заявку</>) } };
export const Loading: Story = { args: { loading: true } };

export const Gallery: Story = {
  render: () => (
    <div className="flex max-w-xl flex-wrap items-center gap-3">
      <Button>
        Найти мастера <ArrowRight />
      </Button>
      <Button variant="secondary">Написать</Button>
      <Button variant="outline">Сравнить</Button>
      <Button variant="soft">Pro</Button>
      <Button variant="ghost">Отмена</Button>
      <Button variant="danger">Удалить</Button>
      <Button variant="success">Ремонт выполнен</Button>
      <Button size="icon" aria-label="Поиск">
        <Search />
      </Button>
      <Button size="icon" variant="ghost" aria-label="В избранное">
        <Heart />
      </Button>
    </div>
  ),
};
