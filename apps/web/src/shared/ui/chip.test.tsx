import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Chip } from './chip';

function Toggle() {
  const [active, setActive] = useState(false);
  return (
    <Chip active={active} onClick={() => setActive((v) => !v)}>
      Открыто сейчас
    </Chip>
  );
}

describe('Chip', () => {
  it('сообщает состояние через aria-pressed', () => {
    render(<Toggle />);
    const chip = screen.getByRole('button', { name: 'Открыто сейчас' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });
});
