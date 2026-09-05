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
export interface StateKernelSnapshot {
  schema: 'payload.local-notation-workspace.v1';
  mode: 'LOCAL_DEVELOPMENT';
  enabled: boolean;
  savedVersion: number;
  savedDigest: string | null;
  state: NotationState;
  persistence: 'LOCAL_VERSIONED_FILES' | 'DISABLED';
  canonicalAdmission: false;
}
export interface StateKernelRequest {
  schema: 'payload.notation-command-batch.v1';
  baseVersion: number;
  commands: KernelCommand[];
}
export interface StateKernelFailure { error: { code: string; message: string } }
export const emptyNotationState = (): NotationState => ({ schema: 'notations.notation-state.v1', revision: 0,
  notations: [], relations: [], canUndo: false, canRedo: false });
