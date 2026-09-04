import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { mockNextNavigation } from '@/test/mocks';
import { CASE_7C104 } from '@/fixtures/caravan/refused-7c104';
import { CASE_5B221 } from '@/fixtures/caravan/admitted-5b221';
import { CASE_3F440 } from '@/fixtures/caravan/thin';
import { RulingViewer } from './RulingViewer';

beforeAll(() => mockNextNavigation('/rulings/RUL-7C104-r2'));

describe('RulingViewer (relying-party projection)', () => {
  it('answers the one-minute questions for the refused ruling', () => {
    render(<RulingViewer bundle={CASE_7C104} rulingId="RUL-7C104-r2" />);
    expect(screen.getAllByText('Refused').length).toBeGreaterThan(0);
    expect(screen.getByText('Ruled for use').nextSibling).toHaveTextContent('Brokered sale and provisional settlement');
    expect(document.querySelector('[data-clock="validAt"]')).toHaveTextContent('2026-08-28 14:00 UTC');
    expect(document.querySelector('[data-clock="knownAt"]')).toHaveTextContent('2026-08-29 09:30 UTC');
    expect(screen.getByText('0.3.0-demo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Why it was refused' })).toBeInTheDocument();
    expect(screen.getByText(/It is not a finding that any submitted figure is false/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Supersession chain' })).toBeInTheDocument();
    expect(screen.getByTestId('machine-readable-export')).toBeInTheDocument();
    expect(screen.getByText('API request and response example')).toBeInTheDocument();
  });

  it('the counterparty projection of the refused ruling withholds the private contract; the public projection withholds the ruling entirely', async () => {
    const user = userEvent.setup();
    render(<RulingViewer bundle={CASE_7C104} rulingId="RUL-7C104-r2" />);
    expect(screen.queryByText('Sale contract HB-3310 (specification extract)')).toBeNull();
    expect(screen.getByText(/1 artifact withheld/)).toBeInTheDocument();
    const exportText = screen.getByRole('tabpanel').textContent ?? '';
    expect(exportText).not.toContain('HB-3310');
    expect(exportText).not.toContain('Price basis');
    expect(exportText).not.toContain('rotation B');
    expect(exportText).not.toContain('CAR-101/R-02');
    await user.click(screen.getByRole('button', { name: 'Public' }));
    // a COUNTERPARTY_SHARED ruling is not a public ruling
    expect(screen.getByText(/not visible at the Public ruling visibility/)).toBeInTheDocument();
    expect(screen.queryByTestId('machine-readable-export')).toBeNull();
  });

  it('the public projection of a public ruling shows status, use, clocks, checks and conditions but withholds the artifacts', async () => {
    const user = userEvent.setup();
    render(<RulingViewer bundle={CASE_5B221} rulingId="RUL-5B221-r2" />);
    await user.click(screen.getByRole('button', { name: 'Public' }));
    expect(screen.getAllByText('Admitted with conditions').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-clock="validAt"]')).toHaveTextContent('2026-08-17 16:00 UTC');
    expect(document.querySelector('[data-clock="knownAt"]')).toHaveTextContent('2026-08-26 09:30 UTC');
    expect(screen.getAllByText(/COND-5B221-1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/4 artifacts withheld at Public ruling visibility/)).toBeInTheDocument();
    expect(screen.queryByText('Inspection certificate NIS-4402')).toBeNull();
    const exportText = screen.getByRole('tabpanel').textContent ?? '';
    expect(exportText).not.toContain('NIS-4402');
    expect(exportText).not.toContain('WB-2277');
    expect(exportText).toContain('ADMITTED_WITH_CONDITIONS');
    expect(screen.getByText(/withheld from this export/)).toBeInTheDocument();
    // reviewer-entered approval is counterparty-only and does not leak
    expect(exportText).not.toContain('CAR-102/R-02');
  });

  it('a superseded ruling carries a supersession banner and links to the current ruling', () => {
    render(<RulingViewer bundle={CASE_5B221} rulingId="RUL-5B221-r1" />);
    const banner = screen.getByTestId('supersession-banner');
    expect(banner).toHaveTextContent('Superseded.');
    expect(within(banner).getAllByRole('link', { name: 'RUL-5B221-r2' }).length).toBeGreaterThan(0);
    const chain = screen.getByTestId('supersession-chain');
    expect(within(chain).getByText('current')).toBeInTheDocument();
  });

  it('a revoked ruling says reliance must stop and that revocation is not a finding about the cargo', () => {
    render(<RulingViewer bundle={CASE_3F440} rulingId="RUL-3F440-r1" />);
    const banner = screen.getByTestId('supersession-banner');
    expect(banner).toHaveTextContent('Revoked.');
    expect(banner).toHaveTextContent(/not a finding about the cargo/);
  });

  it('human-reviewed assurance is shown with its basis and its non-availability list', () => {
    render(<RulingViewer bundle={CASE_5B221} rulingId="RUL-5B221-r2" />);
    expect(screen.getAllByText('Human reviewed').length).toBeGreaterThan(0);
    const list = screen.getByRole('list', { name: 'Not available' });
    expect(within(list).getByText('External witnessing not available')).toBeInTheDocument();
  });
});
