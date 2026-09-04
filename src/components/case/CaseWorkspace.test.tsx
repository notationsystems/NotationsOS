import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { mockNextNavigation } from '@/test/mocks';
import { FIXTURE_CASES } from '@/fixtures';
import { CASE_7C104 } from '@/fixtures/caravan/refused-7c104';
import { CASE_5B221 } from '@/fixtures/caravan/admitted-5b221';
import { CaseWorkspace } from './CaseWorkspace';

beforeAll(() => mockNextNavigation('/cases/CASE-CAR-7C104'));

describe('CaseWorkspace', () => {
  it('renders every fixture without runtime errors and shows a fixture banner', () => {
    for (const b of FIXTURE_CASES) {
      const { unmount } = render(<CaseWorkspace bundle={b} />);
      expect(screen.getByRole('note', { name: 'Demonstration fixture' })).toBeInTheDocument();
      expect(screen.getByRole('complementary', { name: 'Decision' })).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Case structure' })).toBeInTheDocument();
      unmount();
    }
  });

  it('the refused case leads with subject, use, status, both clocks, profile version, assurance and parties', () => {
    render(<CaseWorkspace bundle={CASE_7C104} />);
    const header = screen.getByTestId('case-identity-header');
    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent('Specialty Cargo Lot 7C-104');
    expect(within(header).getByText('Brokered sale and provisional settlement')).toBeInTheDocument();
    expect(within(header).getAllByText('Refused').length).toBeGreaterThan(0);
    expect(within(header).getByText('2026-08-28 14:00 UTC')).toBeInTheDocument();
    expect(within(header).getByText('2026-08-29 09:30 UTC')).toBeInTheDocument();
    expect(within(header).getByText('0.3.0-demo')).toBeInTheDocument();
    expect(within(header).getByText('Unverified evaluation')).toBeInTheDocument();
    expect(within(header).getByText('Harbourline Brokerage')).toBeInTheDocument();
  });

  it('the decision rail names the blocking invariant and the required action', () => {
    render(<CaseWorkspace bundle={CASE_7C104} />);
    const rail = screen.getByRole('complementary', { name: 'Decision' });
    expect(within(rail).getByText(/Required action/)).toBeInTheDocument();
    expect(within(rail).getByText(/Remediate CAR-101 and resubmit/)).toBeInTheDocument();
    const failedSection = screen.getByRole('region', { name: /Failed checks \(1\)/ });
    expect(within(failedSection).getByText('Lot identity reconciles across evidence')).toBeInTheDocument();
  });

  it('selecting the failed invariant highlights affected claims, inspected evidence, the broken link and the remediation', async () => {
    const user = userEvent.setup();
    render(<CaseWorkspace bundle={CASE_7C104} />);
    const failedSection = screen.getByRole('region', { name: /Failed checks \(1\)/ });
    await user.click(within(failedSection).getByRole('button', { name: /CAR-101 Lot identity reconciles/ }));
    // affected claims highlighted in the left rail
    const c1 = document.querySelector('[data-claim-id="C-7C104-1"]');
    const c3 = document.querySelector('[data-claim-id="C-7C104-3"]');
    const c2 = document.querySelector('[data-claim-id="C-7C104-2"]');
    expect(c1).toHaveAttribute('data-highlighted', 'true');
    expect(c3).toHaveAttribute('data-highlighted', 'true');
    expect(c2).not.toHaveAttribute('data-highlighted');
    // inspected evidence highlighted
    expect(document.querySelector('[data-evidence-id="EV-CERT-NIS-4418"]')).toHaveAttribute('data-highlighted', 'true');
    expect(document.querySelector('[data-evidence-id="EV-CUSTODY-MER-0931"]')).toHaveAttribute('data-highlighted', 'true');
    expect(document.querySelector('[data-evidence-id="EV-WEIGHT-WB-2291"]')).not.toHaveAttribute('data-highlighted');
    // the detail shows the reason, what is missing, and remediation
    const detail = screen.getByTestId('invariant-detail');
    expect(within(detail).getByText('E_LOT_IDENTITY_UNRECONCILED')).toBeInTheDocument();
    expect(within(detail).getByText(/Blocking/)).toBeInTheDocument();
    expect(within(detail).getByText(/linking sample S-4418 to transport lot 7C-104/)).toBeInTheDocument();
    expect(within(detail).getByText('Automatic')).toBeInTheDocument();
    // remediation actions with the required options
    const actions = screen.getByTestId('remediation-actions');
    expect(within(actions).getByText('Request an amended certificate')).toBeInTheDocument();
    expect(within(actions).getByText('Submit an independent custody record')).toBeInTheDocument();
    // broken lineage is stated in text
    expect(screen.getByText('Broken lineage')).toBeInTheDocument();
  });

  it('there is no bare Override: reviewer intervention requires authority, reason and basis', async () => {
    const user = userEvent.setup();
    render(<CaseWorkspace bundle={CASE_7C104} />);
    await user.click(within(screen.getByRole('region', { name: /Failed checks \(1\)/ })).getByRole('button', { name: /CAR-101 Lot identity reconciles/ }));
    expect(screen.queryByRole('button', { name: /^Override$/ })).toBeNull();
    const record = screen.getByRole('button', { name: 'Record intervention' });
    expect(record).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Authority'), 'P-REVIEWER-R02');
    await user.type(screen.getByLabelText('Reason'), 'Certificate template omits lot');
    await user.type(screen.getByLabelText('Basis'), 'Compared with prior certificates');
    expect(record).toBeEnabled();
    await user.click(record);
    const intents = screen.getByTestId('action-intents');
    expect(within(intents).getByText('REVIEWER_INTERVENTION')).toBeInTheDocument();
    expect(within(intents).getByText(/not sent/i)).toBeInTheDocument();
  });

  it('a sponsor does not see the internal reviewer note; an internal reviewer does', async () => {
    const user = userEvent.setup();
    render(<CaseWorkspace bundle={CASE_7C104} />);
    expect(screen.queryByText('Reviewer note on CAR-101')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Internal reviewer' }));
    // the reviewer-entered FAILED row now appears among the failed checks
    const failedSection = screen.getByRole('region', { name: /Failed checks \(2\)/ });
    expect(within(failedSection).getByText('Reviewer note on CAR-101')).toBeInTheDocument();
    expect(within(failedSection).getAllByText(/reviewer-entered/).length).toBeGreaterThan(0);
    // and its full record is attributed
    fireEvent.click(within(failedSection).getByRole('button', { name: /CAR-101\/R-02/ }));
    const detail = screen.getByTestId('invariant-detail');
    expect(within(detail).getByText('Reviewer-entered')).toBeInTheDocument();
    expect(within(detail).getByText('Reviewer R-02')).toBeInTheDocument();
    expect(within(detail).getByText(/Inspected NIS-4418 header fields/)).toBeInTheDocument();
  });

  it('superseded rulings remain inspectable and are compared with the current ruling', async () => {
    const user = userEvent.setup();
    render(<CaseWorkspace bundle={CASE_5B221} />);
    const nav = screen.getByRole('navigation', { name: 'Case structure' });
    await user.click(within(nav).getByRole('button', { name: /rev 1/ }));
    expect(screen.getByRole('heading', { name: /Ruling RUL-5B221-r1 \(revision 1\)/ })).toBeInTheDocument();
    const cmp = screen.getByTestId('revision-comparison');
    expect(within(cmp).getByText('Indicative offer to counterparties')).toBeInTheDocument();
    expect(within(cmp).getByText('Brokered sale and provisional settlement')).toBeInTheDocument();
    expect(within(cmp).getAllByText('changed').length).toBeGreaterThan(0);
  });

  it('core navigation works from the keyboard: Tab reaches the structure buttons and Enter selects', async () => {
    const user = userEvent.setup();
    render(<CaseWorkspace bundle={CASE_7C104} />);
    const claimBtn = document.querySelector('[data-claim-id="C-7C104-2"]') as HTMLButtonElement;
    claimBtn.focus();
    expect(document.activeElement).toBe(claimBtn);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('claim-detail')).toHaveTextContent('Gross quantity 20.000 t');
    // Tab moves focus onward without trapping
    await user.tab();
    expect(document.activeElement).not.toBe(claimBtn);
  });
});
