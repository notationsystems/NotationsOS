/**
 * Workspace capacity as the interface shows it. Limits come from the API
 * when the snapshot carries them (contract request in
 * src/state-kernel/types.ts) and otherwise from the kernel contract
 * (docs/LOCAL_NOTATION_STATE_KERNEL.md); usage is read from the snapshot.
 * The command count is the lifetime count and includes undo and redo, so it
 * only ever grows; at the limit no further command, undo or redo is
 * accepted. At the version limit previews still run and nothing further
 * can be saved.
 */
import type { StateKernelSnapshot, WorkspaceCapacity } from '@/state-kernel/types';

export const KERNEL_CONTRACT_LIMITS: WorkspaceCapacity = {
  commands: { used: 0, limit: 256 },
  versions: { used: 0, limit: 64 },
  notations: { used: 0, limit: 64 },
  relations: { used: 0, limit: 128 },
};

export type CapacityDimension = keyof WorkspaceCapacity;
export type CapacityLevel = 'ok' | 'warn' | 'full';

export interface CapacityRow {
  dimension: CapacityDimension;
  label: string;
  used: number;
  limit: number;
  remaining: number;
  level: CapacityLevel;
  meaning: string;
  atLimit: string;
}

export interface WorkspaceCapacityView {
  source: 'API' | 'CONTRACT';
  rows: CapacityRow[];
  commandsExhausted: boolean;
  versionsExhausted: boolean;
}

const MEANING: Record<CapacityDimension, { label: string; meaning: string; atLimit: string }> = {
  commands: { label: 'Lifetime commands', meaning: 'Every accepted command across the whole saved history, undo and redo included. It never decreases.', atLimit: 'No further command, undo or redo is accepted. Save what is pending, copy your drafts, and have an operator start a new workspace directory; a checkpoint or archive facility is not implemented.' },
  versions: { label: 'Saved versions', meaning: 'One per successful Save. Several commands can share one version.', atLimit: 'Previews still run; nothing further can be saved in this workspace. Copy your drafts and have an operator start a new workspace directory; a checkpoint or archive facility is not implemented.' },
  notations: { label: 'Current notations', meaning: 'Notations in the current state. Undo can lower it; their identities stay reserved.', atLimit: 'No further notation can be created until one is undone.' },
  relations: { label: 'Current relations', meaning: 'Authored relations in the current state.', atLimit: 'No further relation can be created until one is undone.' },
};

export function levelOf(used: number, limit: number): CapacityLevel {
  if (used >= limit) return 'full';
  return used >= Math.ceil(limit * 0.9) ? 'warn' : 'ok';
}

/** Usage read from the snapshot: the draft revision is the lifetime command count with pending commands included. */
export function capacityOf(snapshot: StateKernelSnapshot): WorkspaceCapacityView {
  const source = snapshot.capacity ? 'API' : 'CONTRACT';
  const base = snapshot.capacity ?? {
    commands: { used: snapshot.state.revision, limit: KERNEL_CONTRACT_LIMITS.commands.limit },
    versions: { used: snapshot.savedVersion, limit: KERNEL_CONTRACT_LIMITS.versions.limit },
    notations: { used: snapshot.state.notations.length, limit: KERNEL_CONTRACT_LIMITS.notations.limit },
    relations: { used: snapshot.state.relations.length, limit: KERNEL_CONTRACT_LIMITS.relations.limit },
  };
  const rows = (Object.keys(MEANING) as CapacityDimension[]).map((dimension) => {
    const { used, limit } = base[dimension];
    const remaining = Math.max(0, limit - used);
    return { dimension, used, limit, remaining, level: levelOf(used, limit), ...MEANING[dimension] };
  });
  return { source, rows, commandsExhausted: base.commands.used >= base.commands.limit, versionsExhausted: base.versions.used >= base.versions.limit };
}
