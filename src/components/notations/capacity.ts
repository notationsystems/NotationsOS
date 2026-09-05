/**
 * Workspace capacity as the interface shows it. Lifetime commands and
 * saved versions come from the snapshot's `capacity`, which the state API
 * reports and the frontend verifies against the contract before trusting
 * a snapshot at all (src/state-kernel/types.ts). Notation and relation
 * limits are the kernel contract's (docs/LOCAL_NOTATION_STATE_KERNEL.md);
 * their usage is read from the state. The command count is the lifetime
 * count and includes undo and redo, so it only ever grows. At either
 * ceiling the kernel accepts no further preview; at the command ceiling an
 * already accepted batch can still be saved while a version slot remains.
 */
import { MAX_NOTATION_COMMANDS, MAX_NOTATION_SAVED_VERSIONS, type StateKernelSnapshot } from '@/state-kernel/types';

export const KERNEL_CONTRACT_LIMITS = {
  commands: MAX_NOTATION_COMMANDS,
  versions: MAX_NOTATION_SAVED_VERSIONS,
  notations: 64,
  relations: 128,
} as const;

/** Remaining room at which the interface starts warning, per dimension. */
export const WARN_AT = { commands: 16, versions: 4, notations: 6, relations: 12 } as const;

export type CapacityDimension = keyof typeof KERNEL_CONTRACT_LIMITS;
export type CapacityLevel = 'ok' | 'warn' | 'full';

export interface CapacityRow {
  dimension: CapacityDimension;
  label: string;
  used: number;
  limit: number;
  remaining: number;
  level: CapacityLevel;
  source: 'API' | 'CONTRACT';
  meaning: string;
  atLimit: string;
}

export interface WorkspaceCapacityView {
  /** Where limits and usage come from: the API for commands and versions; the contract for notations and relations. */
  source: 'API';
  rows: CapacityRow[];
  commandsExhausted: boolean;
  versionsExhausted: boolean;
  approaching: boolean;
}

const MEANING: Record<CapacityDimension, { label: string; meaning: string; atLimit: string }> = {
  commands: { label: 'Lifetime commands', meaning: 'Every accepted command across the whole saved history, undo and redo included. It never decreases.', atLimit: 'No further command, undo or redo is accepted. Save what is pending, copy your drafts, and have an operator start a new workspace directory; a checkpoint or archive facility is not implemented.' },
  versions: { label: 'Saved versions', meaning: 'One per successful Save. Several commands can share one version.', atLimit: 'The kernel accepts no further preview or save in this workspace. Copy your drafts and have an operator start a new workspace directory; a checkpoint or archive facility is not implemented.' },
  notations: { label: 'Current notations', meaning: 'Notations in the current state. Undo can lower it; their identities stay reserved.', atLimit: 'No further notation can be created until one is undone.' },
  relations: { label: 'Current relations', meaning: 'Authored relations in the current state.', atLimit: 'No further relation can be created until one is undone.' },
};

export function levelOf(remaining: number, warnAt: number): CapacityLevel {
  if (remaining <= 0) return 'full';
  return remaining <= warnAt ? 'warn' : 'ok';
}

export function capacityOf(snapshot: StateKernelSnapshot): WorkspaceCapacityView {
  const c = snapshot.capacity;
  const base: Record<CapacityDimension, { used: number; limit: number; remaining: number; source: 'API' | 'CONTRACT' }> = {
    commands: { used: c.usedCommands, limit: c.maxCommands, remaining: c.remainingCommands, source: 'API' },
    versions: { used: c.usedSavedVersions, limit: c.maxSavedVersions, remaining: c.remainingSavedVersions, source: 'API' },
    notations: { used: snapshot.state.notations.length, limit: KERNEL_CONTRACT_LIMITS.notations, remaining: Math.max(0, KERNEL_CONTRACT_LIMITS.notations - snapshot.state.notations.length), source: 'CONTRACT' },
    relations: { used: snapshot.state.relations.length, limit: KERNEL_CONTRACT_LIMITS.relations, remaining: Math.max(0, KERNEL_CONTRACT_LIMITS.relations - snapshot.state.relations.length), source: 'CONTRACT' },
  };
  const rows = (Object.keys(MEANING) as CapacityDimension[]).map((dimension) => ({ dimension, ...base[dimension], level: levelOf(base[dimension].remaining, WARN_AT[dimension]), ...MEANING[dimension] }));
  const commandsExhausted = base.commands.remaining <= 0;
  const versionsExhausted = base.versions.remaining <= 0;
  return { source: 'API', rows, commandsExhausted, versionsExhausted, approaching: !commandsExhausted && !versionsExhausted && (rows[0].level === 'warn' || rows[1].level === 'warn') };
}
