import { describe, expect, it } from 'vitest';
import { activeFilterCount, loadSearchFilters, toSearchParams } from './search-params';

describe('search URL state', () => {
  it('URL → параметры API без UI-полей и пустых значений', async () => {
    const filters = await loadSearchFilters({ q: 'разбил экран', service: 'zamena-displeya', openNow: 'true', priceMax: '9000', view: 'map' });
    expect(toSearchParams(filters, 'moskva')).toEqual({ city: 'moskva', sort: 'relevance', q: 'разбил экран', service: 'zamena-displeya', openNow: true, priceMax: 9000 });
    expect(activeFilterCount(filters)).toBe(3);
  });

  it('геопоиск добавляет радиус по умолчанию', async () => {
    const filters = await loadSearchFilters({ lat: '55.75', lng: '37.61', city: 'sankt-peterburg' });
    expect(toSearchParams(filters, 'moskva')).toMatchObject({ city: 'sankt-peterburg', lat: 55.75, lng: 37.61, radiusKm: 10 });
  });
});
