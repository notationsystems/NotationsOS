import pin from './engine-pin.json';

export const GAT_ADAPTER_VERSION = 'payload.gat-ifc-audit.v1' as const;
export const GAT_ENGINE_PIN = Object.freeze(pin);
export interface GatRuntimeIdentity {
  engineRepository: string;
  engineCommit: string;
  sourceTreeDigest: string;
  adapterVersion: typeof GAT_ADAPTER_VERSION;
  pythonVersion: string;
  numpyVersion: string;
  platform: string;
  architecture: string;
}
export const GAT_RUNTIME_IDENTITY: Readonly<GatRuntimeIdentity> = Object.freeze({
  engineRepository: pin.engineRepository, engineCommit: pin.engineCommit,
  sourceTreeDigest: pin.sourceTreeDigest, adapterVersion: GAT_ADAPTER_VERSION,
  pythonVersion: pin.pythonVersion, numpyVersion: pin.numpyVersion,
  platform: pin.platform, architecture: pin.architecture,
});
