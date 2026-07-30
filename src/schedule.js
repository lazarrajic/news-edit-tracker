const WINDOW_HOURS = 168;

const TIERS = [
  { untilHours: 6, everyHours: 1 },
  { untilHours: 24, everyHours: 3 },
  { untilHours: WINDOW_HOURS, everyHours: 48 },
];

export function nextCheckAt(publishedAt, from = new Date()) {
  const published = new Date(publishedAt);
  const ageHours = (from - published) / 3_600_000;
  const tier = TIERS.find((t) => ageHours < t.untilHours);
  if (!tier) return null;

  // Clamped for 7 day after publication.
  const next = Math.min(
    from.getTime() + tier.everyHours * 3_600_000,
    published.getTime() + WINDOW_HOURS * 3_600_000
  );
  return new Date(next).toISOString();
}
