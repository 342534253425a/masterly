import { beforeEach, describe, expect, it } from 'vitest';
import { COMPARE_LIMIT, useCompare } from './compare-store';

const entry = (id: string) => ({ id, name: `Мастер ${id}`, initials: 'M', hue: 200 });

describe('compare store', () => {
  beforeEach(() => useCompare.setState({ items: [] }));

  it('переключает мастера и соблюдает лимит', () => {
    const { toggle } = useCompare.getState();
    for (let i = 0; i < COMPARE_LIMIT; i++) expect(toggle(entry(String(i)))).toBe(true);
    expect(toggle(entry('extra'))).toBe(false);
    expect(useCompare.getState().items).toHaveLength(COMPARE_LIMIT);
    toggle(entry('0'));
    expect(useCompare.getState().items.map((item) => item.id)).not.toContain('0');
  });
});
