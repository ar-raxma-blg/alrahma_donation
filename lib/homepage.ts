export function campaignProgress(raised: number, goal: number) {
  const safeRaised = Number.isFinite(raised) ? Math.max(0, raised) : 0;
  const safeGoal = Number.isFinite(goal) ? Math.max(0, goal) : 0;
  const percent = safeGoal > 0 ? safeRaised / safeGoal * 100 : 0;
  // Never announce the target reached just because 99.99% rounds up.
  const displayed = percent > 0 && percent < 0.1 ? null : percent < 100 ? Math.floor(percent * 10) / 10 : Math.round(percent * 10) / 10;
  return { raised: safeRaised, goal: safeGoal, percent, barPercent: Math.min(100, percent), displayed };
}

export function publicRaised(totals: { raised_sek?: number; opening_raised_sek?: number } | null) {
  return Number(totals?.raised_sek ?? 0) + Number(totals?.opening_raised_sek ?? 0);
}
