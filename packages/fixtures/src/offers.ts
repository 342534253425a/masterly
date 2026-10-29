import { roundPrice } from '@masterly/kernel';
import { MODELS, type ModelFixture } from './devices.js';
import type { MasterFixture, PartsQuality } from './masters.js';
import { Rng } from './prng.js';
import { serviceById, type ServiceFixture } from './services.js';

/** Множитель стоимости запчастей по ценовому сегменту устройства (tier 1…5). */
const TIER_MULTIPLIER = [0.45, 0.7, 1, 1.55, 2.4] as const;

export function tierMultiplier(service: ServiceFixture, tier: number): number {
  return 1 + ((TIER_MULTIPLIER[tier - 1] ?? 1) - 1) * service.elasticity;
}

export interface ModelPrice {
  from: number;
  to: number | null;
}

export interface OfferFixture {
  serviceId: string;
  priceFrom: number;
  priceTo: number;
  durationMin: number;
  warrantyDays: number;
  parts: PartsQuality[];
}

function noise(master: MasterFixture, serviceId: string): number {
  return new Rng(`${master.id}:${serviceId}`).float(0.92, 1.08);
}

/** Цена конкретного мастера на конкретную модель: «от» (копия/OEM) и «до» (оригинал). */
export function priceFor(master: MasterFixture, serviceId: string, model: ModelFixture): ModelPrice | null {
  const service = serviceById.get(serviceId);
  if (!service || !master.serviceIds.includes(serviceId) || !master.brandIds.includes(model.brandId)) return null;
  if (service.brandIds && !service.brandIds.includes(model.brandId)) return null;
  if (service.basePrice === 0) return { from: 0, to: null };
  const base = service.basePrice * tierMultiplier(service, model.tier) * master.priceLevel * noise(master, serviceId);
  if (!service.partsChoice) return { from: roundPrice(base), to: null };
  const hasCopy = master.partsQualities.includes('copy');
  const hasOriginal = master.partsQualities.includes('original');
  return {
    from: roundPrice(base * (hasCopy ? 0.82 : 1)),
    to: hasOriginal ? roundPrice(base * 1.38) : null,
  };
}

export function offersFor(master: MasterFixture): OfferFixture[] {
  const models = MODELS.filter((m) => master.brandIds.includes(m.brandId));
  return master.serviceIds.flatMap((serviceId) => {
    const service = serviceById.get(serviceId);
    if (!service) return [];
    const prices = models.map((m) => priceFor(master, serviceId, m)).filter((p): p is ModelPrice => p !== null);
    if (prices.length === 0) return [];
    const rng = new Rng(`duration:${master.id}:${serviceId}`);
    return [
      {
        serviceId,
        priceFrom: Math.min(...prices.map((p) => p.from)),
        priceTo: Math.max(...prices.map((p) => p.to ?? p.from)),
        durationMin: Math.max(15, Math.round((service.durationMin * (master.express ? 0.8 : 1) * rng.float(0.85, 1.3)) / 5) * 5),
        warrantyDays: service.warrantyDays === 0 ? 0 : Math.max(30, Math.min(master.warrantyDays, service.warrantyDays * 2)),
        parts: service.partsChoice ? master.partsQualities : [],
      },
    ];
  });
}
