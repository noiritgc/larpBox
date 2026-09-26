import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ChoiceGroup } from './ChoiceGroup';

function Harness() {
  const [value, setValue] = useState<'A' | 'B' | 'NEITHER' | null>(null);
  return (
    <ChoiceGroup
      label="Your endorsement"
      value={value}
      onChange={setValue}
      choices={[
        { value: 'A', label: 'Endorse A' },
        { value: 'B', label: 'Endorse B', disabled: true },
        { value: 'NEITHER', label: 'Endorse neither' },
      ]}
    />
  );
}

describe('ChoiceGroup', () => {
  it('is a labelled radio group whose selection is exposed, not just colored', () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Your endorsement' });
    expect(group).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Endorse A' }));
    expect(screen.getByRole('radio', { name: 'Endorse A' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Endorse neither' })).toHaveAttribute('aria-checked', 'false');
  });

  it('moves with arrow keys and skips unavailable choices', () => {
    render(<Harness />);
    const a = screen.getByRole('radio', { name: 'Endorse A' });
    fireEvent.click(a);
    fireEvent.keyDown(a, { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: 'Endorse neither' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Endorse B' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Endorse neither' }), { key: 'ArrowDown' });
    expect(a).toHaveAttribute('aria-checked', 'true');
  });
});
