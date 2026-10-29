import type { MasterCard as MasterCardData } from '@masterly/contracts';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Heart, Send } from 'lucide-react';
import { Button } from '@/shared/ui';
import { MasterCard, MasterCardSkeleton } from './master-card';
import { MasterMiniCard } from './master-mini-card';
import { PricePin } from './price-pin';

const master: MasterCardData = {
  id: 'm1',
  slug: 'ifix-lab',
  kind: 'workshop',
  name: 'iFix Lab',
  initials: 'IL',
  hue: 205,
  tagline: 'Ремонт iPhone и Android при вас за 30 минут',
  cityId: 'msk',
  districtName: 'Арбат',
  landmark: 'Смоленская',
  address: 'ул. Арбат, 24',
  location: { lat: 55.75, lng: 37.59 },
  rating: 4.9,
  reviewsCount: 128,
  experienceYears: 7,
  completedOrders: 2310,
  responseTimeMin: 8,
  warrantyDays: 180,
  verified: true,
  verification: { identity: true, business: true, address: true, reviewedAt: '2026-09-12T00:00:00.000Z' },
  visitTypes: ['workshop', 'courier'],
  express: true,
  plan: 'pro',
  promoted: null,
  openState: { open: true, closesAt: '21:00', opensAt: null, inDays: null },
  distanceKm: 1.2,
  price: { serviceId: 'display', modelId: 'iphone-13', range: { from: 8900, to: 12300 } },
  serviceIds: ['display', 'battery'],
  photosCount: 9,
  gallery: [
    { id: 'p1', serviceId: 'display', caption: 'Замена дисплея iPhone 13' },
    { id: 'p2', serviceId: 'battery', caption: 'Новый аккумулятор Galaxy S22' },
    { id: 'p3', serviceId: 'camera', caption: 'Камера iPhone 12 Pro' },
  ],
  offersPreview: [
    { serviceId: 'display', priceFrom: 4500 },
    { serviceId: 'battery', priceFrom: 1900 },
    { serviceId: 'port', priceFrom: 1500 },
  ],
};

const meta = {
  title: 'entities/master/MasterCard',
  component: MasterCard,
  parameters: { layout: 'padded' },
  args: {
    master,
    priceCaption: 'Замена дисплея · iPhone 13',
    topActions: (
      <Button variant="ghost" size="icon-sm" aria-label="В избранное">
        <Heart />
      </Button>
    ),
    primaryAction: (
      <Button size="sm">
        <Send /> Заявка
      </Button>
    ),
  },
  decorators: [(Story) => <div className="w-[640px] max-w-full"><Story /></div>],
} satisfies Meta<typeof MasterCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Promoted: Story = { args: { master: { ...master, promoted: { erid: '2SDnje7Q1', advertiser: 'iFix Lab' }, plan: 'pro' } } };
export const Closed: Story = { args: { master: { ...master, openState: { open: false, closesAt: null, opensAt: '10:00', inDays: 1 }, express: false, verified: false } } };
export const Loading: Story = { render: () => <MasterCardSkeleton /> };
export const Mini: Story = { render: () => <MasterMiniCard master={master} /> };
export const MapPins: Story = {
  render: () => (
    <div className="flex items-end gap-4 rounded-3xl bg-surface-2 p-8">
      <PricePin price={8900} rating={4.9} />
      <PricePin price={12500} rating={4.7} active />
      <PricePin price={6400} rating={4.8} promoted />
      <PricePin price={null} rating={4.6} />
      <PricePin price={null} rating={4.6} compact />
    </div>
  ),
};
