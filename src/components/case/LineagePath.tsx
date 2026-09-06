
import type { ClaimCaseBundle, LineageEdge, LineageNode } from '@/domain/types';
import { LINEAGE_LAYERS } from '@/domain/selectors';
import { humanize } from '@/lib/format';
import { fmtUtc } from '@/lib/format';

const LAYER_LABEL: Record<LineageNode['kind'], string> = {
  SOURCE_ARTIFACT: 'Source artifact',
  EXTRACTED_RECORD: 'Extracted record',
  OBSERVATION: 'Observation',
  CLAIM: 'Claim',
  TRANSFORMATION: 'Transformation',
  INVARIANT_RESULT: 'Invariant result',
  RULING: 'Ruling',
};

const RELATION_LABEL: Record<LineageEdge['relation'], string> = {
  EXTRACTED_FROM: 'extracted from',
  OBSERVED_IN: 'observed in',
  ASSERTS: 'asserts',
  NORMALIZED_BY: 'normalized by',
  INSPECTED_BY: 'inspected by',
  CONTRADICTS: 'contradicts',
  MISSING_LINK: 'missing link',
  SUPPORTS: 'supports',
  RULED_IN: 'ruled in',
  SUPERSEDES: 'supersedes',
};

/**
 * The default lineage view: a layered, deterministic list in the order
 *   source artifact → extracted record → observation → claim → transformation
 *   → invariant result → ruling
 * with the selected path and any broken (missing) links called out in text.
 * This is the non-graph alternative and it is the primary one.
 */
export function LineagePath({
  bundle,
  pathNodeIds,
  highlightNodeIds,
  brokenEdges,
  onSelectNode,
}: {
  bundle: ClaimCaseBundle;
  pathNodeIds: Set<string>;
  highlightNodeIds: Set<string>;
  brokenEdges: LineageEdge[];
  onSelectNode?: (n: LineageNode) => void;
}) {
  const byId = new Map(bundle.lineage.nodes.map((n) => [n.nodeId, n]));
  const inbound = (id: string) => bundle.lineage.edges.filter((e) => e.to === id);
  const anyPath = pathNodeIds.size > 0 || highlightNodeIds.size > 0;
  return (
    <div className="flex flex-col gap-3" data-testid="lineage-path">
      {brokenEdges.length > 0 && (
        <div role="status" className="surface-inset p-2 text-[12.5px]" style={{ borderColor: 'var(--status-refused)', color: 'var(--text-primary)' }}>
          <span className="label-sm" style={{ color: 'var(--status-refused)' }}>Broken lineage</span>
          <ul className="m-0 mt-1 pl-4">
            {brokenEdges.map((e, i) => (
              <li key={i}>
                <span className="id">{byId.get(e.from)?.label ?? e.from}</span> → <span className="id">{byId.get(e.to)?.label ?? e.to}</span>: {e.note ?? RELATION_LABEL[e.relation]}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol className="m-0 p-0 list-none flex flex-col gap-2">
        {LINEAGE_LAYERS.map((layer) => {
          const nodes = bundle.lineage.nodes.filter((n) => n.kind === layer).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
          if (nodes.length === 0) return null;
          return (
            <li key={layer} className="flex flex-col gap-1">
              <span className="label-sm">{LAYER_LABEL[layer]}</span>
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {nodes.map((n) => {
                  const onPath = pathNodeIds.has(n.nodeId) || highlightNodeIds.has(n.nodeId);
                  const dim = anyPath && !onPath;
                  const ins = inbound(n.nodeId);
                  return (
                    <li key={n.nodeId} style={{ opacity: dim ? 0.5 : 1 }}>
                      <button
                        type="button"
                        onClick={() => onSelectNode?.(n)}
                        aria-current={onPath ? 'true' : undefined}
                        className={`w-full text-left flex flex-col gap-0.5 px-2 py-1 rounded-[var(--radius-md)] border text-[12.5px] ${onPath ? 'is-highlighted' : ''}`}
                        style={{ borderColor: onPath ? 'var(--highlight-border)' : 'var(--border-subtle)' }}
                        data-node-id={n.nodeId}
                      >
                        <span style={{ color: 'var(--text-primary)' }}>{n.label}</span>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {n.knownAt && <>known <span className="ts">{fmtUtc(n.knownAt)}</span></>}
                          {ins.length > 0 && (
                            <> · {ins.map((e, i) => (
                              <span key={i} style={{ color: e.broken ? 'var(--status-refused)' : undefined }}>
                                {i > 0 && ', '}{RELATION_LABEL[e.relation]} {byId.get(e.from)?.label ?? e.from}{e.broken ? ' (broken)' : ''}
                              </span>
                            ))}</>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
        Relations: {Object.values(RELATION_LABEL).map(humanize).join(', ')}. Layout is deterministic; there is no force-directed motion.
      </p>
    </div>
  );
}
