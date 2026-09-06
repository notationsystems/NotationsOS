import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NODE } from '@/domain/spatial';
import { SpatialInquiry } from './SpatialInquiry';

const example = (name: string) => JSON.parse(readFileSync(join(process.cwd(), 'examples', 'spatial', `${name}.json`), 'utf8'));
type Reply = { status: number; json: unknown };
const notFound = (id: string): Reply => ({ status: 404, json: { schema: 'payload.production-error.v1', error: { code: 'SPATIAL_ANALYSIS_NOT_FOUND', message: `No saved analysis has request id ${id}.` } } });
const disabled: Reply = { status: 403, json: { schema: 'payload.production-error.v1', error: { code: 'LOCAL_MODE_DISABLED', message: 'Start the explicitly enabled local production service first.' } } };

/** The local service, faked at the fetch boundary: inspections by request id and one comparison, exactly as the checked-in artifacts record them. */
function service(overrides: Record<string, Reply> = {}, compare: Reply = { status: 200, json: example('comparison') }) {
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    let reply: Reply;
    if (url === '/api/spatial/compare') reply = init?.method === 'POST' ? compare : { status: 405, json: {} };
    else {
      const id = decodeURIComponent(url.replace('/api/spatial/analyses/', ''));
      reply = overrides[id] ?? (id === 'spatial-demo-baseline' ? { status: 200, json: example('baselineAnalysis') } : id === 'spatial-demo-closed-bridge' ? { status: 200, json: example('scenarioAnalysis') } : notFound(id));
    }
    return { ok: reply.status < 400, status: reply.status, statusText: 'status', json: async () => reply.json } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => { window.history.replaceState(null, '', '/spatial'); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const ready = async () => waitFor(() => expect(screen.getByTestId('spatial-inquiry')).toHaveAttribute('data-status', 'READY'));

describe('SpatialInquiry', () => {
  it('says the local analysis service is not enabled, with the remedy, and fetches nothing', () => {
    const fetch = service();
    render(<SpatialInquiry enabled={false} />);
    expect(screen.getByTestId('spatial-inquiry')).toHaveAttribute('data-status', 'DISABLED');
    expect(screen.getByTestId('spatial-disabled')).toHaveTextContent('PAYLOAD_PRODUCTION_LOCAL=1');
    expect(screen.getByTestId('spatial-disabled')).toHaveTextContent('scripts/spatial-demo.ts');
    expect(screen.queryByTestId('spatial-plan')).not.toBeInTheDocument();
    expect(screen.getByTestId('spatial-nonclaims')).toHaveTextContent('Not Space Syntax');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('inspects both saved analyses and draws the baseline as plan, graph and table with every number read from the result', async () => {
    const fetch = service();
    render(<SpatialInquiry enabled />);
    await ready();
    expect(fetch.mock.calls.slice(0, 2).map((call) => String(call[0]))).toEqual(['/api/spatial/analyses/spatial-demo-baseline', '/api/spatial/analyses/spatial-demo-closed-bridge']);
    const plan = screen.getByTestId('spatial-plan');
    expect(plan.querySelectorAll('[data-plan-space]')).toHaveLength(5);
    expect(plan.querySelector('[data-plan-space="S-5"]')).toHaveAttribute('data-status', 'POSSIBLE_ONLY');
    expect(plan.querySelector('[data-plan-passage="P-09"]')).toHaveAttribute('data-state', 'UNKNOWN');
    expect(plan.querySelector('[data-plan-passage="P-09"] line')).toHaveAttribute('stroke-dasharray', '6 4');
    expect(plan.querySelector('[data-plan-space="S-5"]')).toHaveAttribute('aria-label', 'Store S-5: possible only, confirmed depth unknown, possible depth 4');
    const graph = screen.getByTestId('spatial-graph');
    expect(graph.querySelectorAll('[data-graph-node]')).toHaveLength(5);
    expect(graph.querySelectorAll('[data-graph-edge]')).toHaveLength(4);
    expect(graph.textContent).toContain('depth 0 · root');
    // The baseline is one space per column, so every passage is a straight cross-column line.
    expect(graph.querySelectorAll('[data-graph-edge] line')).toHaveLength(4);
    expect(graph.querySelectorAll('[data-graph-edge][data-same-column]')).toHaveLength(0);
    // A cross-column label is wider than the gap between two boxes, so it sits above the
    // row rather than centred on the edge, where it would be written over a box.
    for (const label of graph.querySelectorAll('[data-graph-edge] text')) {
      expect(Number(label.getAttribute('y'))).toBeLessThan(NODE.margin + 18);
    }
    // The drawing declares its own loss, apart from the analysis's non-claims.
    expect(screen.getByTestId('spatial-graph-loss')).toHaveTextContent('bowed clear of the column');
    expect(screen.getByTestId('spatial-nonclaims')).not.toHaveTextContent('bowed clear of the column');
    const table = screen.getByTestId('spatial-table');
    const store = within(table.querySelector('[data-space-row="S-5"]') as HTMLElement).getAllByRole('cell').map((cell) => cell.textContent);
    expect(store.slice(2, 5)).toEqual(['unknown', '4', 'POSSIBLE ONLY']);
    expect(within(table.querySelector('[data-space-row="S-1"]') as HTMLElement).getByText('root')).toBeInTheDocument();
    expect(screen.getByTestId('spatial-mean-confirmed')).toHaveTextContent('2 over 3 reachable non-root spaces');
    expect(screen.getByTestId('spatial-mean-possible')).toHaveTextContent('2.5 over 4 reachable non-root spaces');
    expect(screen.getByTestId('spatial-unresolved')).toHaveTextContent('P-09');
    expect(screen.getByTestId('spatial-source')).toHaveTextContent('spatial-demo-layout');
    expect(screen.getByTestId('spatial-source')).toHaveTextContent('canonical admission false');
    // The comparison is the service's artifact; the page asked for it once both results were in hand.
    await waitFor(() => expect(screen.getByTestId('spatial-changes')).toHaveAttribute('data-count', '3'));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({ baselineRequestId: 'spatial-demo-baseline', scenarioRequestId: 'spatial-demo-closed-bridge' });
    expect(screen.getByTestId('spatial-changes').querySelectorAll('[data-changed-space]')).toHaveLength(3);
  });

  it('shares one selection across the plan, the graph, the table and the inspector, by keyboard as well, and carries it in the link', async () => {
    service();
    const user = userEvent.setup();
    render(<SpatialInquiry enabled />);
    await ready();
    await user.click(screen.getByTestId('spatial-plan').querySelector('[data-plan-space="S-3"]') as Element);
    expect(screen.getByTestId('spatial-table').querySelector('[data-space-row="S-3"]')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('spatial-graph').querySelector('[data-graph-node="S-3"]')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('spatial-plan').querySelector('[data-plan-space="S-3"]')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('spatial-inspector')).toHaveTextContent('Studio');
    expect(screen.getByTestId('spatial-selected-confirmed')).toHaveTextContent('2');
    const passages = screen.getByTestId('spatial-space-passages');
    expect(passages.querySelectorAll('[data-passage]')).toHaveLength(2);
    expect(passages.querySelector('[data-passage="P-07"]')).toHaveTextContent('Hall ↔ Studio');
    expect(passages.querySelector('[data-passage="P-07"]')).toHaveTextContent('manual annotation');
    expect(window.location.hash).toBe('#space=S-3');
    // Enter on a graph node selects it; the table row's button does the same.
    (screen.getByTestId('spatial-graph').querySelector('[data-graph-node="S-4"]') as SVGGElement).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('spatial-inspector')).toHaveTextContent('Office');
    expect(window.location.hash).toBe('#space=S-4');
    await user.click(screen.getByRole('button', { name: 'Select Store S-5' }));
    expect(screen.getByTestId('spatial-selected-confirmed')).toHaveTextContent('unknown');
    expect(screen.getByTestId('spatial-selected-possible')).toHaveTextContent('4');
    // Escape closes the selection and the link drops it.
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('spatial-inspector')).not.toHaveTextContent('Selected space');
    expect(window.location.hash).toBe('');
  });

  it('restores a linked selection on load and ignores a link naming no space of the layout', async () => {
    service();
    window.history.replaceState(null, '', '/spatial#space=S-4');
    const { unmount } = render(<SpatialInquiry enabled />);
    await ready();
    await waitFor(() => expect(screen.getByTestId('spatial-inspector')).toHaveTextContent('Office'));
    // jsdom raises hashchange itself when the hash is set, as a browser does: a pasted link selects.
    window.location.hash = '#space=S-2';
    await waitFor(() => expect(screen.getByTestId('spatial-inspector')).toHaveTextContent('Hall'));
    window.location.hash = '#space=nope!';
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('spatial-inspector')).toHaveTextContent('Hall');
    unmount();
    window.history.replaceState(null, '', '/spatial#space=S-9');
    render(<SpatialInquiry enabled />);
    await ready();
    expect(screen.getByTestId('spatial-inspector')).not.toHaveTextContent('Selected space');
  });

  it('switches to the scenario: depths, statuses, the assumed passage and the means change; baseline facts stay declared', async () => {
    service();
    const user = userEvent.setup();
    render(<SpatialInquiry enabled />);
    await ready();
    await waitFor(() => expect(screen.getByTestId('spatial-view-scenario')).toBeEnabled());
    await user.click(screen.getByTestId('spatial-view-scenario'));
    expect(screen.getByTestId('spatial-inquiry')).toHaveAttribute('data-view', 'scenario');
    const table = screen.getByTestId('spatial-table');
    const studio = within(table.querySelector('[data-space-row="S-3"]') as HTMLElement).getAllByRole('cell').map((cell) => cell.textContent);
    expect(studio.slice(2, 5)).toEqual(['unreachable', 'unreachable', 'DISCONNECTED']);
    expect(table.querySelector('[data-space-row="S-2"]')?.textContent).toContain('unchanged');
    expect(table.querySelector('[data-space-row="S-5"]')?.textContent).toContain('POSSIBLE_ONLY (confirmed unknown, possible 4) → DISCONNECTED');
    expect(screen.getByTestId('spatial-mean-confirmed')).toHaveTextContent('1 over 1 reachable non-root space');
    expect(screen.getByTestId('spatial-unresolved')).toHaveTextContent('P-09');
    expect(screen.getByTestId('spatial-scenario-provenance')).toHaveTextContent('P-07 assumed CLOSED');
    expect(screen.getByTestId('spatial-plan').querySelector('[data-plan-passage="P-07"]')).toHaveAttribute('data-state', 'CLOSED');
    expect(screen.getByTestId('spatial-graph').querySelectorAll('[data-graph-node][data-status="DISCONNECTED"]')).toHaveLength(3);
    // Closing P-07 strands S-3, S-4 and S-5 in one column. Those two passages are bowed
    // clear of it as curves, never drawn back across the column under a box.
    const scenarioGraph = screen.getByTestId('spatial-graph');
    expect([...scenarioGraph.querySelectorAll('[data-graph-edge][data-same-column]')].map((g) => g.getAttribute('data-graph-edge'))).toEqual(['P-08', 'P-09']);
    expect(scenarioGraph.querySelector('[data-graph-edge="P-08"] path')).toHaveAttribute('d', expect.stringMatching(/^M 484 59 Q 528 /));
    expect(scenarioGraph.querySelector('[data-graph-edge="P-08"] line')).toBeNull();
    expect(scenarioGraph.querySelector('[data-graph-edge="P-01"] line')).not.toBeNull();
    await user.click(screen.getByTestId('spatial-plan').querySelector('[data-plan-space="S-3"]') as Element);
    const p07 = screen.getByTestId('spatial-space-passages').querySelector('[data-passage="P-07"]') as HTMLElement;
    expect(p07).toHaveAttribute('data-effective', 'CLOSED');
    expect(p07).toHaveTextContent('declared OPEN');
    expect(p07).toHaveTextContent('scenario assumption');
    expect(screen.getByTestId('spatial-selected-change')).toHaveTextContent('CONFIRMED (confirmed 2, possible 2) → DISCONNECTED (confirmed unreachable, possible unreachable)');
    // Hall is unchanged: no change row, and its passage to the Studio still shows the declared state beside the assumption.
    await user.click(screen.getByRole('button', { name: 'Select Hall S-2' }));
    expect(screen.queryByTestId('spatial-selected-change')).not.toBeInTheDocument();
  });

  it('shows the service refusal verbatim, keeps the baseline, disables the scenario view and asks for no comparison', async () => {
    const fetch = service({ 'spatial-demo-closed-bridge': notFound('spatial-demo-closed-bridge') });
    render(<SpatialInquiry enabled />);
    await ready();
    expect(screen.getByTestId('spatial-scenario-failure')).toHaveAttribute('data-code', 'SPATIAL_ANALYSIS_NOT_FOUND');
    expect(screen.getByTestId('spatial-scenario-failure')).toHaveTextContent('No saved analysis has this request id in the configured evidence directory.');
    expect(screen.getByTestId('spatial-view-scenario')).toBeDisabled();
    expect(screen.getByTestId('spatial-plan').querySelectorAll('[data-plan-space]')).toHaveLength(5);
    expect(screen.queryByTestId('spatial-changes')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses a projection outside the contract and a server that is not in local mode, drawing nothing in their place', async () => {
    const tampered = structuredClone(example('baselineAnalysis')) as { projection: Record<string, unknown> };
    tampered.projection.independentlyVerified = true;
    service({ 'spatial-demo-baseline': { status: 200, json: tampered }, 'spatial-demo-closed-bridge': disabled });
    render(<SpatialInquiry enabled />);
    await waitFor(() => expect(screen.getByTestId('spatial-inquiry')).toHaveAttribute('data-status', 'FAILED'));
    expect(screen.getByTestId('spatial-baseline-failure')).toHaveAttribute('data-code', 'INVALID_SPATIAL_PROJECTION');
    expect(screen.getByTestId('spatial-scenario-failure')).toHaveAttribute('data-code', 'LOCAL_MODE_DISABLED');
    expect(screen.getByTestId('spatial-scenario-failure')).toHaveTextContent('not enabled on this origin');
    expect(screen.queryByTestId('spatial-plan')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spatial-table')).not.toBeInTheDocument();
  });

  it('renders labels and provenance as text, never as markup, and inspects other request ids on request', async () => {
    const marked = structuredClone(example('baselineAnalysis')) as { projection: { layout: { spaces: { label: string }[] } } };
    marked.projection.layout.spaces[2].label = '<b>Studio</b> & co';
    const fetch = service({ 'other-baseline': { status: 200, json: marked } });
    const user = userEvent.setup();
    render(<SpatialInquiry enabled />);
    await ready();
    await user.clear(screen.getByTestId('spatial-baseline-id'));
    await user.type(screen.getByTestId('spatial-baseline-id'), 'other-baseline');
    await user.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/spatial/analyses/other-baseline', expect.anything()));
    await ready();
    await waitFor(() => expect(screen.getAllByText('<b>Studio</b> & co').length).toBeGreaterThan(0));
    expect(document.querySelector('b')).toBeNull();
    await act(async () => { await user.clear(screen.getByTestId('spatial-baseline-id')); await user.type(screen.getByTestId('spatial-baseline-id'), 'not valid!'); });
    await user.click(screen.getByRole('button', { name: 'Inspect' }));
    await waitFor(() => expect(screen.getByTestId('spatial-baseline-failure')).toHaveAttribute('data-code', 'INVALID_SPATIAL_ID'));
  });
});
