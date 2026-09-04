import type { Metadata } from 'next';
import { getCaseSource } from '@/adapter/caseSource';
import { NewCaseIntake } from '@/components/intake/NewCaseIntake';

export const metadata: Metadata = { title: 'New case' };

export default async function NewCasePage() {
  const profiles = await getCaseSource().listProfiles();
  return <NewCaseIntake profiles={profiles} />;
}
