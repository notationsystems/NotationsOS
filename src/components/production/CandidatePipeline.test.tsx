import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import demoJson from '@/fixtures/production/demo.json';
import type { CommittedSource, ProductionDemo } from '@/domain/production';
import { CandidatePipeline } from './CandidatePipeline';

const demo = demoJson as unknown as ProductionDemo;
const carrier = demo.acquisitions[0];
const sources: CommittedSource[] = [{
  evidenceId: carrier.capture.evidence.evidenceId, path: 'examples/carrier/source.json', byteLength: carrier.capture.evidence.byteLength, contentDigest: carrier.capture.evidence.contentDigest,
  text: '{"schema":"caravan.carrier-source.v1","sourceRecordId":"demo-carrier-001","legalName":"  Demonstration Carriers Incorporated  ","registrationNumber":"DEMO-REG-001","operatingSite":null,"validTime":{"state":"UNOBSERVED","from":null,"to":null}}',
}];

describe('CandidatePipeline as an observable process with an inspector', () => {
  it('shows four stages whose every metric names its source, and the coverage gaps with remediation, before any selection', () => {
    render(<CandidatePipeline demo={demo} sources={sources} />);
    const stages = within(screen.getByTestId('process-stages')).getAllByRole('listitem');
    expect(stages.map((s) => s.getAttribute('data-stage'))).toEqual(['COLLECTION', 'EXTRACTION', 'NORMALIZATION', 'READINESS']);
    for (const metric of screen.getByTestId('process-stages').querySelectorAll('[data-metric]')) expect(metric.getAttribute('data-source')).toMatch(/\S/);
    expect(stages[1]).toHaveTextContent('one recorded run');
    const gaps = screen.getByRole('table', { name: 'Coverage gaps' });
    expect(gaps.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(gaps).toHaveTextContent('INGEST_ONLY');
    expect(gaps).toHaveTextContent('never advances a cutoff');
    expect(screen.getByTestId('production-workspace')).toHaveAttribute('data-inspecting', 'none');
    expect(screen.queryByTestId('production-inspector')).not.toBeInTheDocument();
    expect([...document.querySelectorAll('[data-canonical-id]')].filter((e) => e.getAttribute('data-canonical-id') === 'null')).toHaveLength(1);
  });

  it('opens the candidate as evidence beside record: source values, trimmed and null, the missing field not inferred, provenance as a sequence with labelled clocks', async () => {
    const user = userEvent.setup();
    render(<CandidatePipeline demo={demo} sources={sources} />);
    await user.click(within(screen.getByRole('article', { name: 'Normalization demo-caravan-carrier-normalization-001' })).getByRole('button', { name: 'Inspect normalization demo-caravan-carrier-normalization-001' }));
    const inspector = screen.getByTestId('production-inspector');
    expect(screen.getByTestId('production-workspace')).toHaveAttribute('data-inspecting', 'normalization');
    expect(within(inspector).getByRole('heading', { level: 2 })).toHaveTextContent('demo-caravan-carrier-normalization-001');
    const mapping = within(inspector).getByRole('list', { name: 'Field mapping' });
    const row = (field: string) => mapping.querySelector(`[data-field="${field}"]`)!;
    expect(row('legalName')).toHaveAttribute('data-field-status', 'PARSED');
    expect(row('legalName')).toHaveTextContent('Whitespace trimmed by the adapter');
    expect(row('operatingSite')).toHaveAttribute('data-field-status', 'MISSING');
    expect(row('operatingSite')).toHaveTextContent('null');
    expect(row('operatingSite')).toHaveTextContent('missing · not inferred');
    expect(within(inspector).getByTestId('source-bytes')).toHaveTextContent('digest matches the evidence record');
    expect(within(inspector).getByTestId('evidence-side')).toHaveTextContent('275 bytes');
    expect(within(inspector).getByTestId('record-side')).toHaveTextContent('UNRESOLVED');
    expect(within(inspector).getByTestId('times')).toHaveTextContent('knowledge time');
    expect(within(inspector).getByTestId('times')).toHaveTextContent('UNOBSERVED: the source asserted no validity');
    const steps = [...within(inspector).getByTestId('sequence').querySelectorAll('li')].map((li) => `${li.getAttribute('data-step')}:${li.getAttribute('data-outcome')}`);
    expect(steps).toEqual(['policy:DONE', 'ingest:DONE', 'capture:DONE', 'receipt:DONE', 'derive:DONE', 'adapter:DONE', 'candidate:DONE', 'build:demo-caravan-carrier-build-001:DONE', 'refusal:demo-caravan-carrier-build-003:REFUSED']);
    expect([...document.querySelectorAll('[data-canonical-id]')].filter((e) => e.getAttribute('data-canonical-id') === 'null')).toHaveLength(1);
    expect([...document.querySelectorAll('[data-cutoff]')].filter((e) => e.getAttribute('data-cutoff') === 'within')).toHaveLength(1);
  });

  it('states unavailable source bytes for the quarantine, follows a refusal back to what it named, and returns focus on close', async () => {
    const user = userEvent.setup();
    render(<CandidatePipeline demo={demo} sources={sources} />);
    const trigger = within(screen.getByRole('article', { name: 'Normalization demo-caravan-carrier-normalization-002' })).getByRole('button', { name: 'Inspect normalization demo-caravan-carrier-normalization-002' });
    await user.click(trigger);
    let inspector = screen.getByTestId('production-inspector');
    expect(within(inspector).getByTestId('source-unavailable')).toHaveTextContent('no committed file has the same digest');
    expect(within(inspector).getByTestId('record-side')).toHaveTextContent('No record. SCHEMA_MISMATCH');
    expect(within(inspector).getByTestId('inspector-gap')).toHaveTextContent('An adapter contract that accepts the schema the source declares');
    expect(within(inspector).queryByRole('list', { name: 'Field mapping' })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(inspector).getByRole('button', { name: /Inspect refusal/ }));
    inspector = screen.getByTestId('production-inspector');
    expect(within(inspector).getByRole('heading', { level: 2 })).toHaveTextContent('MEMBER_NOT_ELIGIBLE');
    expect(within(inspector).getByTestId('inspector-remediation')).toHaveTextContent('Name only NORMALIZED candidates as members');
    await user.click(within(screen.getByTestId('inspector-mentions')).getByRole('button', { name: /Inspect normalization/ }));
    expect(within(screen.getByTestId('production-inspector')).getByRole('heading', { level: 2 })).toHaveTextContent('demo-caravan-carrier-normalization-002');

    await user.click(screen.getByRole('button', { name: 'Close demo-caravan-carrier-normalization-002' }));
    expect(screen.queryByTestId('production-inspector')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows an INGEST-only acquisition as a coverage stop with its remediation, and a build as a sequence ending in a membership root', async () => {
    const user = userEvent.setup();
    render(<CandidatePipeline demo={demo} sources={sources} />);
    await user.click(within(screen.getByRole('table', { name: 'Acquisitions' })).getByRole('button', { name: 'Inspect acquisition demo-caravan-local-notice-001' }));
    let inspector = screen.getByTestId('production-inspector');
    expect(within(inspector).getByTestId('inspector-gap')).toHaveAttribute('data-gap-code', 'INGEST_ONLY');
    expect(within(inspector).getByTestId('inspector-gap')).toHaveTextContent('permits INGEST only');
    expect(within(inspector).getByTestId('source-unavailable')).toBeInTheDocument();
    await user.click(within(screen.getByRole('article', { name: 'Candidate build demo-caravan-carrier-build-001' })).getByRole('button', { name: 'Inspect build demo-caravan-carrier-build-001' }));
    inspector = screen.getByTestId('production-inspector');
    const labels = [...within(inspector).getByTestId('sequence').querySelectorAll('li')].map((li) => li.getAttribute('data-step'));
    expect(labels).toEqual(['definition', 'cutoff', 'member:demo-caravan-carrier-normalization-001', 'derive:demo-caravan-carrier-normalization-001', 'root']);
    expect(within(inspector).getByTestId('inspector-refused-builds')).toHaveTextContent('MEMBER_AFTER_CUTOFF');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('production-inspector')).not.toBeInTheDocument();
  });
});
