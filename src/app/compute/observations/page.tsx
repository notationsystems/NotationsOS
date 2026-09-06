import type { Metadata } from 'next';
import { ObservationReplay } from '@/components/compute/ObservationReplay';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { buildObservationReplayPreview } from '@/observation/preview';

export const metadata: Metadata = { title: 'Observation replay' };

/** Pure synthetic preview computed in memory on the server: no retained acquisitions, operator histories or provider calls. */
export default function ObservationsPage() {
  const preview = buildObservationReplayPreview();
  return (
    <>
      <FixtureBanner note="Synthetic observation replay computed in memory from an invented manifest: not field evidence, not retained, not admitted. The operator CLI replays retained manifests; see docs/RECORDED_OBSERVATION_REPLAY.md." />
      <div className="p-3 sm:p-4 max-w-[1400px] mx-auto w-full"><ObservationReplay {...preview} /></div>
    </>
  );
}
