import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BadgeCheck, Megaphone, ShieldCheck, Zap } from 'lucide-react';
import { Avatar } from './avatar';
import { Badge } from './badge';
import { AreaChart, BarList, Donut, Funnel, Sparkline } from './charts';
import { Chip } from './chip';
import { GradientRibbon } from './decor';
import { DeviceIllustration, type IllustrationVariant } from './device-illustration';
import { ProgressRing, Skeleton } from './feedback';
import { KpiCard } from './layout';
import { RatingValue, Stars } from './rating';

const meta = { title: 'shared/ui/Design system', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS: IllustrationVariant[] = ['screen', 'glass', 'battery', 'port', 'camera', 'water', 'back', 'speaker', 'buttons', 'faceid', 'software', 'diagnostics', 'data', 'network'];

export const Illustrations: Story = {
  render: () => (
    <div className="grid grid-cols-4 gap-4 sm:grid-cols-7">
      {VARIANTS.map((variant, i) => (
        <figure key={variant} className="flex flex-col items-center gap-2 rounded-3xl border border-line bg-surface p-3">
          <DeviceIllustration variant={variant} hue={(262 + i * 22) % 360} className="size-24" />
          <figcaption className="text-xs text-muted">{variant}</figcaption>
        </figure>
      ))}
    </div>
  ),
};

export const BadgesAndChips: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge tone="accent">PRO</Badge>
        <Badge tone="success">
          <ShieldCheck /> Гарантия 6 месяцев
        </Badge>
        <Badge tone="warning">
          <Zap /> Срочно за 30 мин
        </Badge>
        <Badge tone="warning" className="uppercase">
          <Megaphone /> Реклама
        </Badge>
        <Badge tone="info">
          <BadgeCheck /> Проверен
        </Badge>
        <Badge>В мастерской</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip active>Замена дисплея</Chip>
        <Chip>Аккумулятор</Chip>
        <Chip>Разъём зарядки</Chip>
      </div>
      <div className="flex items-center gap-4">
        <Avatar initials="IL" hue={205} size="lg" shape="squircle" />
        <Avatar initials="АМ" hue={268} size="lg" online />
        <Stars value={4.7} />
        <RatingValue rating={4.9} count={128} />
      </div>
    </div>
  ),
};

const series = Array.from({ length: 30 }, (_, i) => Math.round(40 + Math.sin(i / 3) * 12 + i * 1.4));

export const Charts: Story = {
  render: () => (
    <div className="grid max-w-4xl gap-6 md:grid-cols-2">
      <KpiCard label="Просмотры профиля" value="989" delta={0.136} series={series} />
      <KpiCard label="Время ответа" value="12 мин" delta={-0.14} series={[...series].reverse()} invert />
      <div className="md:col-span-2">
        <AreaChart labels={series.map((_, i) => `${i + 1} окт`)} series={[{ key: 'views', label: 'Просмотры', values: series }, { key: 'leads', label: 'Заявки', values: series.map((v) => Math.round(v / 6)), color: '#34d399' }]} />
      </div>
      <Funnel stages={[{ label: 'Показы', value: 10556 }, { label: 'Просмотры', value: 989 }, { label: 'Контакты', value: 89 }, { label: 'Заявки', value: 44 }]} />
      <BarList items={[{ label: 'Замена дисплея', value: 21 }, { label: 'Аккумулятор', value: 13 }, { label: 'Разъём зарядки', value: 6 }]} />
      <Donut segments={[{ label: 'Поиск', value: 46 }, { label: 'Карта', value: 21 }, { label: 'SEO', value: 17 }, { label: 'Прямые', value: 16 }]}>
        <span className="text-lg font-extrabold">989</span>
      </Donut>
      <div className="flex items-center gap-6">
        <ProgressRing value={86} size={84} stroke={8}>
          86%
        </ProgressRing>
        <Sparkline values={series} className="h-12 w-40" />
      </div>
    </div>
  ),
};

export const Ribbon: Story = {
  render: () => (
    <div className="relative h-56 w-[720px] overflow-hidden rounded-[28px] border-gradient">
      <GradientRibbon className="absolute inset-0 h-full w-full" />
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="flex w-96 flex-col gap-3">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-24" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  ),
};
