import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RULING_STATUSES, ASSURANCE_CLASSES } from '@/domain/types';
import { RulingStatusPill } from './RulingStatus';
import { AssuranceBadge, AssuranceDetail } from './AssuranceStatus';
import { TemporalBasisPanel } from './TemporalBasisPanel';
import { CASE_7C104 } from '@/fixtures/caravan/refused-7c104';
import { CASE_5B221 } from '@/fixtures/caravan/admitted-5b221';

describe('RulingStatusPill', () => {
  it('renders every ruling status distinctly: unique label, unique glyph, data-status attribute', () => {
    const { container } = render(<div>{RULING_STATUSES.map((s) => <RulingStatusPill key={s} status={s} />)}</div>);
    const pills = container.querySelectorAll('[data-status]');
    expect(pills.length).toBe(RULING_STATUSES.length);
    const labels = new Set([...pills].map((p) => p.textContent?.trim()));
    expect(labels.size).toBe(RULING_STATUSES.length);
    const statuses = new Set([...pills].map((p) => p.getAttribute('data-status')));
    expect(statuses.size).toBe(RULING_STATUSES.length);
  });

  it('refusal is described as scoped inadmissibility, not falsity', () => {
    render(<RulingStatusPill status="REFUSED" withMeaning />);
    const meaning = screen.getByText(/Not admissible for this declared use/);
    expect(meaning.textContent).toMatch(/not a finding of falsity or misconduct/i);
    expect(meaning.textContent?.toLowerCase()).not.toMatch(/fraud|invalid|wrong/);
  });
});

describe('Assurance', () => {
  it('assurance classes are not conflated and none is labelled a bare "Verified"', () => {
    const { container } = render(<div>{ASSURANCE_CLASSES.map((a) => <AssuranceBadge key={a} assurance={{ class: a, basis: 'test' }} />)}</div>);
    const badges = [...container.querySelectorAll('[data-assurance]')];
    expect(badges.length).toBe(4);
    const labels = badges.map((b) => b.textContent?.trim());
    expect(new Set(labels).size).toBe(4);
    expect(labels).not.toContain('Verified');
    // an unverified evaluation is visually distinct (dashed) from a verified attestation
    const unverified = container.querySelector('[data-assurance="UNVERIFIED_EVALUATION"]') as HTMLElement;
    const verified = container.querySelector('[data-assurance="VERIFIED_ATTESTATION"]') as HTMLElement;
    expect(unverified.style.borderStyle).toBe('dashed');
    expect(verified.style.borderStyle).toBe('solid');
  });

  it('the detail lists what is NOT available, verbatim', () => {
    render(<AssuranceDetail assurance={CASE_7C104.currentRuling!.assurance} />);
    const list = screen.getByRole('list', { name: 'Not available' });
    expect(within(list).getByText('External verification not available')).toBeInTheDocument();
    expect(within(list).getByText('Cryptographic attestation not available')).toBeInTheDocument();
    expect(screen.getByText(/Verification status/)).toHaveTextContent('unverified');
  });

  it('human review states that it is not cryptographic verification', () => {
    render(<AssuranceDetail assurance={CASE_5B221.currentRuling!.assurance} />);
    expect(screen.getByText(/not cryptographic verification/i)).toBeInTheDocument();
    expect(screen.getByText(/partially verified/)).toBeInTheDocument();
  });
});

describe('TemporalBasisPanel', () => {
  it('renders valid time and knowledge time as separately labelled clocks, never a generic "Date"', () => {
    render(<TemporalBasisPanel temporalBasis={CASE_7C104.currentRuling!.temporalBasis} />);
    const valid = screen.getByText('World state valid on');
    const known = screen.getByText('Information known by');
    expect(valid).toBeInTheDocument();
    expect(known).toBeInTheDocument();
    const validDd = document.querySelector('[data-clock="validAt"]');
    const knownDd = document.querySelector('[data-clock="knownAt"]');
    expect(validDd?.textContent).toBe('2026-08-28 14:00 UTC');
    expect(knownDd?.textContent).toBe('2026-08-29 09:30 UTC');
    expect(validDd?.textContent).not.toBe(knownDd?.textContent);
    expect(screen.queryByText(/^Date$/)).toBeNull();
    expect(screen.queryByText(/^Updated$/)).toBeNull();
    expect(screen.queryByText(/^As of$/)).toBeNull();
  });
});
