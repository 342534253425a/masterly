export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bboxAround(center: GeoPoint, radiusKm: number): BBox {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos(toRad(center.lat)));
  return { west: center.lng - dLng, south: center.lat - dLat, east: center.lng + dLng, north: center.lat + dLat };
}

export function bboxContains(box: BBox, point: GeoPoint): boolean {
  return point.lng >= box.west && point.lng <= box.east && point.lat >= box.south && point.lat <= box.north;
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Geohash — ключ кластеризации пинов на карте и шардирования гео-кэша в Redis. */
export function geohashEncode(point: GeoPoint, precision = 7): string {
  let latRange: [number, number] = [-90, 90];
  let lngRange: [number, number] = [-180, 180];
  let hash = '';
  let bits = 0;
  let bitCount = 0;
  let evenBit = true;
  while (hash.length < precision) {
    const range = evenBit ? lngRange : latRange;
    const value = evenBit ? point.lng : point.lat;
    const mid = (range[0] + range[1]) / 2;
    if (value >= mid) {
      bits = (bits << 1) | 1;
      range[0] = mid;
    } else {
      bits <<= 1;
      range[1] = mid;
    }
    if (evenBit) lngRange = range;
    else latRange = range;
    evenBit = !evenBit;
    if (++bitCount === 5) {
      hash += BASE32[bits];
      bits = 0;
      bitCount = 0;
    }
  }
  return hash;
}
