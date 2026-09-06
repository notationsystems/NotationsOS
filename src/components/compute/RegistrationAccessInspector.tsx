'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { RegistrationAccessExperiment } from '@/compute/registration-access-contract';
import type { RegistrationAccessResult } from '@/compute/registration-access';
import type { ArtifactReference } from '@/observation/contract';

export interface RegistrationAccessInspectorProps {
  mode: 'IN_MEMORY_SYNTHETIC_PREVIEW_NOT_RETAINED';
  manifest: RegistrationAccessExperiment;
  result: RegistrationAccessResult;
  artifacts: Array<{ id: string; content: unknown; contentDigest: string }>;
}

const secondary = { color: 'var(--text-secondary)' };
const selectStyle = { background: 'var(--bg-inset)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)' };
const number = (value: number | null | undefined) => value == null ? 'Unavailable' : value.toLocaleString('en-US', { maximumSignificantDigits: 8 });
const vector = (value: readonly number[] | null | undefined) => value ? `[${value.map(number).join(', ')}]` : 'Unavailable';
const ids = (values: readonly string[]) => values.length ? values.join(' → ') : 'None';

function Panel({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="surface p-3 sm:p-4 min-w-0 flex flex-col gap-3">
    <h2 id={id} className="m-0 text-[15px] font-semibold" style={{ color: 'var(--text-heading)' }}>{title}</h2>
    {children}
  </section>;
}

function Value({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-[12px]" style={secondary}>{label}</dt><dd className="m-0 mono text-[12px] break-words [overflow-wrap:anywhere]">{children}</dd></div>;
}

function Evidence({ reference }: { reference: ArtifactReference }) {
  return <dl className="m-0 grid gap-2">
    <Value label="Preview acquisition identifier">{reference.acquisitionId}</Value>
    <Value label="Preview descriptor digest (not a receipt)">{reference.acquisitionDigest}</Value>
    <Value label="Content digest">{reference.contentDigest}</Value>
  </dl>;
}

function Json({ value }: { value: unknown }) {
  return <pre className="m-0 p-3 text-[11px] whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 rounded" style={{ background: 'var(--bg-inset)' }}>{JSON.stringify(value, null, 2)}</pre>;
}

/** Inspection only: inputs and computed scenarios arrive from the pure server preview. */
export function RegistrationAccessInspector({ mode, manifest, result, artifacts }: RegistrationAccessInspectorProps) {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [measurementIndex, setMeasurementIndex] = useState(0);
  const [artifactId, setArtifactId] = useState(manifest.controls[0]?.evidence.acquisitionId ?? artifacts[0]?.id ?? '');
  const scenarios = [{ id: 'Base graph', result: result.access.base }, ...result.access.scenarios];
  const scenario = scenarios[scenarioIndex] ?? scenarios[0];
  const measurements = [
    ...manifest.controls.map((control) => ({ ...control, role: 'Fitting control' as const })),
    ...manifest.checkPoints.map((control) => ({ ...control, role: 'Withheld check point' as const })),
  ];
  const selected = measurements[measurementIndex] ?? measurements[0];
  const fittingResidual = selected.role === 'Fitting control' ? result.registration.fit?.residuals.find((r) => r.id === selected.id) : null;
  const comparison = selected.role === 'Withheld check point' ? result.registration.comparisons.find((r) => r.id === selected.id) : null;
  const selectedArtifact = artifacts.find((artifact) => artifact.id === artifactId) ?? artifacts[0];
  const measurementArtifact = artifacts.find((artifact) => artifact.id === selected.evidence.acquisitionId && artifact.contentDigest === selected.evidence.contentDigest);
  const fit = result.registration.fit;

  function selectMeasurement(index: number) {
    setMeasurementIndex(index);
    const next = measurements[index];
    if (next && artifacts.some((artifact) => artifact.id === next.evidence.acquisitionId && artifact.contentDigest === next.evidence.contentDigest)) {
      setArtifactId(next.evidence.acquisitionId);
    }
  }

  return <div className="p-3 sm:p-4 max-w-[1400px] mx-auto w-full min-w-0 flex flex-col gap-4 text-[13px]">
    <header className="flex flex-col gap-2">
      <div className="label-sm">Compute · bounded spatial experiment</div>
      <h1 className="m-0 text-[20px] font-semibold" style={{ color: 'var(--text-heading)' }}>Registration and access</h1>
      <p className="m-0" style={secondary}>Weighted rigid alignment and explicit distance semantics over one declared building-access example. <Link href="/product" style={{ color: 'var(--info)' }}>Product architecture</Link></p>
    </header>

    <section aria-label="Experiment boundary" data-testid="registration-boundary" className="p-3 rounded min-w-0" style={{ background: 'var(--highlight-bg)', border: '1px solid var(--border-accent)' }}>
      <p className="m-0 font-semibold">Synthetic demonstration · not a surveyed building</p>
      <p className="mt-1 mb-0">Synthetic BIM-control geometry, not a parsed BIM model. Check points are withheld from the fit, not independently attested. These in-memory results and preview evidence are not retained acquisitions or an admitted release.</p>
      <p className="mt-1 mb-0">No field-accuracy validation, live access verification, safe-egress assurance, full sensor calibration, Earth placement, ellipsoidal geodesic or surface-mesh geodesic is established. Scenario selection does not write data or contact a provider.</p>
      <p className="mt-2 mb-0 mono text-[11px] [overflow-wrap:anywhere]">{mode}</p>
    </section>

    <div className="grid lg:grid-cols-2 gap-4 min-w-0">
      <Panel title="Alignment and withheld checks" id="registration-alignment">
        <p className="m-0" style={secondary}>The source coordinates are treated as fixed. Only matched fitting controls enter weighted least squares; check points and graph nodes do not. Weights use the declared per-axis isotropic target variance.</p>
        <dl className="m-0 grid sm:grid-cols-2 gap-3" data-testid="alignment-summary">
          <Value label="Registration state">{result.registration.state}</Value>
          <Value label="Fitting controls / withheld check points">{manifest.controls.length} / {manifest.checkPoints.length}</Value>
          <Value label="Fitting RMSE (m)">{number(result.registration.fittingRmseM)}</Value>
          <Value label="Withheld check-point discrepancy RMSE (m)">{number(result.registration.checkPointRmseM)}</Value>
          <Value label="Source frame">{manifest.sourceFrame.id} · {manifest.sourceFrame.kind} · {manifest.sourceFrame.units} · {manifest.sourceFrame.handedness}</Value>
          <Value label="Target frame">{manifest.targetFrame.id} · {manifest.targetFrame.kind} · {manifest.targetFrame.units} · {manifest.targetFrame.handedness}</Value>
        </dl>
        <p className="m-0" style={secondary}>A small fitting residual is not independent accuracy. Neither RMSE is a pass/fail threshold. Declared independence and withheld identifiers do not prove physical independence or absence of shared bias.</p>
        {result.registration.blockers.length > 0 && <p className="m-0 [overflow-wrap:anywhere]">Unresolved: {result.registration.blockers.join(', ')}</p>}
        {fit && <details>
          <summary className="cursor-pointer">Transform and conditional local covariance</summary>
          <div className="mt-3 flex flex-col gap-3" data-testid="registration-covariance">
            <p className="m-0">Source → target rigid transform, without scale or reflection. Covariance is a local Gauss–Newton approximation under fixed source geometry and known independent isotropic control noise; it is not global accuracy.</p>
            <dl className="m-0 grid gap-2">
              <Value label="Rotation quaternion [x, y, z, w]">{vector(fit.transform.rotationXyzw)}</Value>
              <Value label="Translation (m)">{vector(fit.transform.translationM)}</Value>
              <Value label="Weighted squared residual sum">{number(fit.weightedResidualSumSquares)}</Value>
              <Value label="Degrees of freedom">{fit.degreesOfFreedom}</Value>
              <Value label="Covariance parameter order">{fit.numerics.covarianceParameterOrder.join(', ')}</Value>
              <Value label="Covariance parameterization">{fit.numerics.covarianceParameterization}</Value>
            </dl>
            <p className="m-0" style={secondary}>Rotation block: rad². Centroid-translation block: m². Cross block: rad·m. This is not covariance of the transform-origin translation.</p>
            <Json value={fit.covariance} />
          </div>
        </details>}
      </Panel>

      <Panel title="Distance and closure scenarios" id="registration-distance">
        <label htmlFor="registration-scenario">Access scenario</label>
        <select id="registration-scenario" className="p-2 w-full min-w-0" style={selectStyle} value={scenarioIndex} onChange={(event) => setScenarioIndex(Number(event.target.value))}>
          {scenarios.map((s, index) => <option key={index} value={index}>{index === 0 ? s.id : `Closure: ${s.id}`}</option>)}
        </select>
        <div data-testid="access-result" aria-live="polite" className="flex flex-col gap-3 min-w-0">
          <dl className="m-0 grid gap-3">
            <Value label="Selected scenario">{scenario.id}</Value>
            <Value label="Endpoints">{result.access.startNodeId} → {result.access.endNodeId}</Value>
            <Value label="Distance frame">{result.access.frame.id} · LOCAL_CARTESIAN · METRE</Value>
            <Value label="EUCLIDEAN_3D — straight-line separation (m)">{number(result.access.straightLine.distanceM)}</Value>
            <Value label="PERMITTED_NETWORK_LENGTH — declared path length (m)">{scenario.result.status === 'REACHABLE' ? number(scenario.result.distanceM) : 'Unavailable — UNREACHABLE'}</Value>
            <Value label="Reachability">{scenario.result.status}</Value>
            <Value label="Ordered node path">{ids(scenario.result.nodeIds)}</Value>
            <Value label="Ordered edge path">{ids(scenario.result.edgeIds)}</Value>
            <Value label="Closed edges">{ids(scenario.result.closedEdgeIds)}</Value>
            <Value label="Excluded UNKNOWN edges">{ids(scenario.result.excludedUnknownEdgeIds)}</Value>
            <Value label="Excluded PROHIBITED edges">{ids(scenario.result.excludedProhibitedEdgeIds)}</Value>
          </dl>
          <p className="m-0" style={secondary}>Only explicitly permitted, unclosed edges participate. UNKNOWN is not permission. A disconnected route stays unreachable; straight-line separation is never substituted. Lengths and connections are declared, not extracted from BIM; travel time and uncertainty propagation are absent.</p>
        </div>
        <details>
          <summary className="cursor-pointer">Declared access graph and evidence</summary>
          <div className="mt-3 flex flex-col gap-3">
            <Evidence reference={manifest.access.evidence} />
            <Json value={manifest.access.geometry} />
          </div>
        </details>
      </Panel>
    </div>

    <div className="grid lg:grid-cols-2 gap-4 min-w-0">
      <Panel title="Measurement inspector" id="registration-measurement">
        <label htmlFor="registration-measurement-choice">Control or check point</label>
        <select id="registration-measurement-choice" className="p-2 w-full min-w-0" style={selectStyle} value={measurementIndex} onChange={(event) => selectMeasurement(Number(event.target.value))}>
          {measurements.map((measurement, index) => <option key={measurement.id} value={index}>{measurement.role}: {measurement.id}</option>)}
        </select>
        <div data-testid="measurement-detail" className="flex flex-col gap-3 min-w-0">
          <dl className="m-0 grid gap-2">
            <Value label="Measurement role">{selected.role} · {selected.role === 'Fitting control' ? 'USED_IN_FIT' : 'EXCLUDED_FROM_FIT'}</Value>
            <Value label="Measurement identifier">{selected.measurementId}</Value>
            <Value label={`Source coordinates (m) — ${manifest.sourceFrame.id}`}>{vector(selected.sourceM)}</Value>
            <Value label={`Target coordinates (m) — ${manifest.targetFrame.id}`}>{vector(selected.targetM)}</Value>
            <Value label="Target variance per axis (m²)">{number(selected.varianceM2)}</Value>
            <Value label="Predicted minus target residual [x, y, z] (m)">{vector(fittingResidual?.residualM ?? comparison?.residualM)}</Value>
            <Value label="Residual distance (m)">{number(fittingResidual?.normM ?? comparison?.distanceM)}</Value>
            {comparison && <Value label="Check-point uncertainty state">{comparison.uncertaintyState}</Value>}
          </dl>
          <Evidence reference={selected.evidence} />
          <p className="m-0" style={secondary}>{measurementArtifact ? 'Matching synthetic artifact is available in the evidence inspector; selecting a measurement selects its artifact.' : 'No matching artifact is available in this preview.'}</p>
          {comparison && <details>
            <summary className="cursor-pointer">Check-point prediction and residual uncertainty</summary>
            <p className="mt-2">Predictive residual covariance combines local fit covariance with declared independent check-point variance. Marginal standardized residuals are not independent unit-normal guarantees. Missing variance or unresolved independence remains unavailable.</p>
            <Json value={{ predictedM: comparison.predictedM, predictiveResidualCovariance: comparison.predictiveResidualCovariance, marginalStandardizedResidual: comparison.marginalStandardizedResidual }} />
          </details>}
        </div>
      </Panel>

      <Panel title="Synthetic evidence inspector" id="registration-evidence">
        <p className="m-0" style={secondary}>These are the exact synthetic preview contents behind the manifest references, not fetched or retained operator evidence. Acquisition digests identify synthetic descriptors, not stored acquisition receipts. Selecting a measurement selects its artifact; this selector also exposes the geometry, graph and assumptions.</p>
        <label htmlFor="registration-artifact">Synthetic artifact</label>
        <select id="registration-artifact" className="p-2 w-full min-w-0" style={selectStyle} value={selectedArtifact?.id ?? ''} onChange={(event) => setArtifactId(event.target.value)}>
          {artifacts.map((artifact) => <option key={artifact.id} value={artifact.id}>{artifact.id}</option>)}
        </select>
        {selectedArtifact && <div data-testid="artifact-detail" className="flex flex-col gap-3 min-w-0">
          <dl className="m-0 grid gap-2">
            <Value label="Artifact identifier">{selectedArtifact.id}</Value>
            <Value label="Exact content digest">{selectedArtifact.contentDigest}</Value>
          </dl>
          <Json value={selectedArtifact.content} />
        </div>}
      </Panel>
    </div>

    <Panel title="Method, assumptions and source snapshot" id="registration-method">
      <dl className="m-0 grid md:grid-cols-2 gap-3">
        <Value label="Experiment">{manifest.experimentId}</Value>
        <Value label="Algorithm version">{result.method.id} · {result.method.version}</Value>
        <Value label="Source representation">{manifest.sourceSnapshot.representationId} · {manifest.sourceSnapshot.kind}</Value>
        <Value label="Access snapshot">{manifest.access.snapshotId}</Value>
        <Value label="Manifest digest">{result.manifestDigest}</Value>
        <Value label="Result digest">{result.digest}</Value>
      </dl>
      <p className="m-0">{manifest.description}</p>
      <p className="m-0" style={secondary}>Validation domain: {manifest.validationDomain}</p>
      <ul className="m-0 pl-5" aria-label="Declared assumptions">
        <li>Fixed source geometry — {manifest.fixedSourceGeometry.state}: {manifest.fixedSourceGeometry.description}</li>
        <li>Independent isotropic control noise — {manifest.independentIsotropicControlNoise.state}: {manifest.independentIsotropicControlNoise.description}</li>
        <li>Independent check points — {manifest.independentCheckPoints.state}: {manifest.independentCheckPoints.description}</li>
      </ul>
      <ul className="m-0 pl-5" aria-label="Validation exclusions">{manifest.exclusions.map((exclusion) => <li key={exclusion}>{exclusion}</li>)}</ul>
      <details>
        <summary className="cursor-pointer">Complete input manifest and method contract</summary>
        <div className="mt-3 flex flex-col gap-3"><Json value={manifest} /><Json value={{ method: result.method, claims: result.claims, accessClaims: result.access.claims }} /></div>
      </details>
    </Panel>
  </div>;
}
