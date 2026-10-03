import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TeamChip } from '@/components/leases/TeamChip';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('TeamChip', () => {
  it('renders the team name as the chip label', () => {
    renderWithProviders(<TeamChip label="DEV" />);

    expect(screen.getByText('DEV')).toBeInTheDocument();
  });

  it('is not a control when it has no handler: the table cell only states the team', () => {
    renderWithProviders(<TeamChip label="QA" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('QA')).not.toHaveAttribute('aria-pressed');
  });

  it('becomes a pressed-state toggle when it filters, and reports its own name on click', async () => {
    const user = userEvent.setup();
    const clicked: string[] = [];

    renderWithProviders(
      <TeamChip
        label="DEV"
        selected={false}
        onClick={(label: string): void => {
          clicked.push(label);
        }}
      />,
    );

    const chip: HTMLElement = screen.getByRole('button', { name: 'DEV' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    await user.click(chip);

    expect(clicked).toEqual(['DEV']);
  });

  it('mirrors the selection in aria-pressed, so the active filter is not carried by colour', () => {
    renderWithProviders(
      <TeamChip label="QA" selected onClick={vi.fn<(label: string) => void>()} />,
    );

    expect(screen.getByRole('button', { name: 'QA' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('carries a border when it states a team, and none when it is a filter control', () => {
    const view = renderWithProviders(<TeamChip label="DEV" />);
    const statedClasses: string = screen.getByText('DEV').className;
    view.unmount();

    renderWithProviders(
      <TeamChip label="DEV" selected={false} onClick={vi.fn<(label: string) => void>()} />,
    );

    expect(statedClasses).toContain('border-border');
    expect(screen.getByRole('button', { name: 'DEV' }).className).not.toContain(
      'border-transparent',
    );
  });
});
