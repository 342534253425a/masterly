import type { IllustrationVariant } from '@/shared/ui';

const BY_SERVICE: Record<string, IllustrationVariant> = {
  display: 'screen',
  glass: 'glass',
  battery: 'battery',
  port: 'port',
  camera: 'camera',
  water: 'water',
  back: 'back',
  speaker: 'speaker',
  buttons: 'buttons',
  faceid: 'faceid',
  software: 'software',
  diagnostics: 'diagnostics',
  data: 'data',
  network: 'network',
};

/** Цвет подсветки иллюстрации на услугу — карточки каталога не сливаются. */
const HUE_BY_SERVICE: Record<string, number> = {
  display: 262, glass: 230, battery: 152, port: 200, camera: 290, water: 196, back: 318,
  speaker: 248, buttons: 275, faceid: 168, software: 220, diagnostics: 280, data: 210, network: 186,
};

export const illustrationFor = (serviceId: string): IllustrationVariant => BY_SERVICE[serviceId] ?? 'diagnostics';
export const hueFor = (serviceId: string): number => HUE_BY_SERVICE[serviceId] ?? 262;
