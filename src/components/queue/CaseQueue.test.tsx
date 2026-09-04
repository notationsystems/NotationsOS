import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { mockNextNavigation } from '@/test/mocks';
import { FIXTURE_CASES } from '@/fixtures';
import { CaseQueue } from './CaseQueue';

beforeAll(() => mockNextNavigation('/cases'));

describe('CaseQueue', () => {
  it('opens with what requires action and a small textual summary', () => {
    render(<CaseQueue cases={[...FIXTURE_CASES]} lastSeenAt="2026-08-31T12:00:00Z" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('5 cases require action');
    const table = screen.getByRole('table', { name: 'Case queue' });
    expect(within(table).getAllByRole('row').length - 1).toBe(5);
    expect(within(table).getByText('Specialty Cargo Lot 7C-104')).toBeInTheDocument();
    expect(within(table).getByText(/CAR-101 · E_LOT_IDENTITY_UNRECONCILED/)).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toContain('World state valid on');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toContain('Information known by');
  });

  it('filters by status and searches by shipment identifier', async () => {
    const user = userEvent.setup();
    render(<CaseQueue cases={[...FIXTURE_CASES]} lastSeenAt="2026-08-31T12:00:00Z" />);
    await user.selectOptions(screen.getByLabelText('Status'), 'ALL');
    expect(screen.getByText('7 of 7 cases')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Search case, manifest, lot, shipment, claim/), 'BAL-77812');
    expect(await screen.findByText('1 of 7 cases')).toBeInTheDocument();
    expect(screen.getByText('Specialty Cargo Lot 7C-104')).toBeInTheDocument();
  });
});
