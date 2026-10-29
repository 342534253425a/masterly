import {
  AirVent,
  BatteryCharging,
  Camera,
  Car,
  Cpu,
  Droplets,
  HardDriveDownload,
  Laptop,
  Layers,
  Plug,
  PlugZap,
  Power,
  Scan,
  ScanFace,
  Signal,
  Smartphone,
  Sparkles,
  Stethoscope,
  Volume2,
  WashingMachine,
  Wrench,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

/** Иконки каталога приходят с бэкенда строкой — маппим на компоненты (без динамического импорта). */
const ICONS: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  scan: Scan,
  'battery-charging': BatteryCharging,
  'plug-zap': PlugZap,
  camera: Camera,
  droplets: Droplets,
  layers: Layers,
  'volume-2': Volume2,
  power: Power,
  'scan-face': ScanFace,
  cpu: Cpu,
  stethoscope: Stethoscope,
  'hard-drive-download': HardDriveDownload,
  signal: Signal,
  laptop: Laptop,
  'washing-machine': WashingMachine,
  wrench: Wrench,
  plug: Plug,
  'air-vent': AirVent,
  sparkles: Sparkles,
  car: Car,
};

export function DynamicIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? Wrench;
  return <Icon aria-hidden {...props} />;
}
