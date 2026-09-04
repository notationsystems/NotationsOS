import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { mockNextNavigation } from '@/test/mocks';
import { CASE_7C104 } from '@/fixtures/caravan/refused-7c104';
import { ReplayView, knowledgeInstants } from './ReplayView';

beforeAll(() => mockNextNavigation('/replay/CASE-CAR-7C104'));

describe('ReplayView (bitemporal replay)', () => {
  it('starts at the present and shows three separately labelled clocks', () => {
    render(<ReplayView bundle={CASE_7C104} />);
    expect(screen.getByTestId('replay-banner')).toHaveTextContent('Viewing the present knowledge state');
    const clocks = screen.getByTestId('three-clocks');
    expect(within(clocks).getByText('World state valid on')).toBeInTheDocument();
    expect(within(clocks).getByText('Information known on')).toBeInTheDocument();
    expect(within(clocks).getByText('Ruling issued on')).toBeInTheDocument();
  });

  it('moving the knowledge cutoff earlier hides later evidence, changes the applicable ruling and shows a textual banner', async () => {
    const user = userEvent.setup();
    render(<ReplayView bundle={CASE_7C104} />);
    const instants = knowledgeInstants(CASE_7C104);
    // Jump to just after r1 was issued (2026-08-27 09:10) — before the BoL and custody record were known
    const target = instants.find((t) => t === '2026-08-27T09:10:00Z')!;
    await user.click(screen.getByRole('button', { name: target.slice(5, 16).replace('T', ' ') }));
    const banner = screen.getByTestId('replay-banner');
    expect(banner).toHaveTextContent('Viewing this case as it was knowable on 2026-08-27 09:10 UTC');
    expect(banner).toHaveTextContent('Later evidence and corrections are hidden');
    expect(banner).toHaveTextContent('2 evidence');
    expect(screen.getAllByText('Pending evidence').length).toBeGreaterThan(0);
    expect(screen.getByText(/later superseded/)).toBeInTheDocument();
    expect(screen.queryByText(/Claimant custody log MER-CL-0931/)).toBeNull();
    expect(document.querySelector('[data-clock="validAt"]')).toHaveTextContent('2026-08-28 14:00 UTC');
    expect(document.querySelector('[data-clock="knownAt"]')).toHaveTextContent('2026-08-27 09:10 UTC');
    expect(document.querySelector('[data-clock="ruledAt"]')).toHaveTextContent('2026-08-27 09:10 UTC');
    // Then versus now comparison appears
    expect(screen.getByTestId('revision-comparison')).toBeInTheDocument();
  });
});
