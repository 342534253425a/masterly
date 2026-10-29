import type { GeoPoint } from '@masterly/contracts';

export interface PinCluster<T> {
  members: T[];
  lng: number;
  lat: number;
}

/**
 * Кластеризация в экранных координатах: пин попадает в кластер, если ближе radiusPx к его центру.
 * Жадный проход O(n·k) — на сотнях пинов города это доли миллисекунды; на десятках тысяч кластеры отдаёт поиск (geotile_grid).
 */
export function clusterPins<T extends { location: GeoPoint }>(pins: readonly T[], project: (point: GeoPoint) => { x: number; y: number }, radiusPx: number): PinCluster<T>[] {
  const clusters: Array<PinCluster<T> & { x: number; y: number }> = [];
  for (const pin of pins) {
    const point = project(pin.location);
    const near = clusters.find((cluster) => Math.hypot(cluster.x - point.x, cluster.y - point.y) < radiusPx);
    if (!near) {
      clusters.push({ members: [pin], lng: pin.location.lng, lat: pin.location.lat, x: point.x, y: point.y });
      continue;
    }
    near.members.push(pin);
    const n = near.members.length;
    near.lng += (pin.location.lng - near.lng) / n;
    near.lat += (pin.location.lat - near.lat) / n;
    near.x += (point.x - near.x) / n;
    near.y += (point.y - near.y) / n;
  }
  return clusters.map(({ members, lng, lat }) => ({ members, lng, lat }));
}

export function boundsOf(points: readonly GeoPoint[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let [minLng, minLat, maxLng, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { lng, lat } of points) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** GeoJSON Feature<Polygon> без зависимости от @types/geojson. */
export interface CircleFeature {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: { type: 'Polygon'; coordinates: Array<Array<[number, number]>> };
}

/** Многоугольник круга радиуса поиска — для подсветки области на карте. */
export function circlePolygon(center: GeoPoint, radiusKm: number, steps = 64): CircleFeature {
  const coordinates: Array<[number, number]> = [];
  const dLat = radiusKm / 110.574;
  const dLng = radiusKm / (111.32 * Math.cos(toRad(center.lat)));
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    coordinates.push([center.lng + dLng * Math.cos(angle), center.lat + dLat * Math.sin(angle)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } };
}
