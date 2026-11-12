'use client';

import ProgressCard from '@/components/ProgressCard';

// Uses the same renderer, calculation and public refresh endpoint as the homepage.
export default function OverviewFundraising({ raised, goal }: { raised: number; goal: number }) {
  return <div className="rounded-3xl bg-mosque-deep text-mosque-cream"><ProgressCard lang="sv" raised={raised} goal={goal} refresh /></div>;
}
