/** Local authored notation state only; not evidence, canonical corpus state or identity resolution. */
export interface Notation { id: string; title: string; body: string }
export interface NotationRelation { id: string; from: string; to: string; label: string }
export type KernelCommand = { commandId: string } & (
  | { kind: 'CREATE_NOTATION'; notation: Notation }
  | { kind: 'UPDATE_NOTATION'; notationId: string; title: string; body: string }
  | { kind: 'CREATE_RELATION'; relation: NotationRelation }
  | { kind: 'UNDO' | 'REDO' }
);
export interface NotationState {
  schema: 'notations.notation-state.v1';
  revision: number;
  notations: Notation[];
  relations: NotationRelation[];
  canUndo: boolean;
  canRedo: boolean;
}
/**
 * Frontend contract request (optional until the backend supplies it): the
 * workspace's limits and usage as the kernel and the store know them. The
 * frontend falls back to the documented limits and derives usage from the
 * snapshot when this is absent, and says which it did.
 */
export interface WorkspaceCapacity {
  commands: { used: number; limit: number };
  versions: { used: number; limit: number };
  notations: { used: number; limit: number };
  relations: { used: number; limit: number };
}
export interface StateKernelSnapshot {
  schema: 'payload.local-notation-workspace.v1';
  mode: 'LOCAL_DEVELOPMENT';
  enabled: boolean;
  savedVersion: number;
  savedDigest: string | null;
  state: NotationState;
  persistence: 'LOCAL_VERSIONED_FILES' | 'DISABLED';
  canonicalAdmission: false;
  capacity?: WorkspaceCapacity;
}
export interface StateKernelRequest {
  schema: 'payload.notation-command-batch.v1';
  baseVersion: number;
  commands: KernelCommand[];
}
export interface StateKernelFailure { error: { code: string; message: string } }
export const emptyNotationState = (): NotationState => ({ schema: 'notations.notation-state.v1', revision: 0,
  notations: [], relations: [], canUndo: false, canRedo: false });
