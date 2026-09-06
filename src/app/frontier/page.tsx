import type { Metadata } from 'next';
import { FrontierWedgesWorkbench } from '@/components/frontier/FrontierWedgesWorkbench';
import {
  FIXTURE_DISCLOSURE_PACKS,
  FIXTURE_INSURABILITY_EVENTS,
  FIXTURE_CAPEX_PROGRESS,
} from '@/fixtures/frontier/anchors';

export const metadata: Metadata = {
  title: 'Frontier Wedges — Payload OS',
  description: 'Evidence substrate for mandatory disclosure assurance, insurability dynamics, and capex progress verification.',
};

export default function FrontierPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <FrontierWedgesWorkbench
        disclosurePacks={FIXTURE_DISCLOSURE_PACKS}
        insurabilityEvents={FIXTURE_INSURABILITY_EVENTS}
        capexVerifications={FIXTURE_CAPEX_PROGRESS}
      />
    </div>
  );
}
