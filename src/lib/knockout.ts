export type KnockoutStage =
  | "Round of 32"
  | "Round of 16"
  | "Quarter-finals"
  | "Semi-finals"
  | "Medal matches";

export type KnockoutMatchDefinition = {
  id: number;
  stage: KnockoutStage;
  date: string;
  kickoff: string;
  venue: string;
  home: string;
  away: string;
};

export const thirdPlaceSlots: Record<number, string[]> = {
  74: ["A", "B", "C", "D", "F"],
  77: ["C", "D", "F", "G", "H"],
  79: ["C", "E", "F", "H", "I"],
  80: ["E", "H", "I", "J", "K"],
  81: ["A", "E", "H", "I", "J"],
  82: ["B", "E", "F", "I", "J"],
  85: ["E", "F", "G", "I", "J"],
  87: ["D", "E", "I", "J", "L"],
};

export function assignThirdPlaceGroups(selectedGroups: string[]) {
  if (selectedGroups.length !== 8) return {} as Record<number, string>;
  const slots = Object.entries(thirdPlaceSlots)
    .map(([matchId, candidates]) => ({
      matchId: Number(matchId),
      candidates: candidates.filter((group) => selectedGroups.includes(group)),
    }))
    .sort((a, b) => a.candidates.length - b.candidates.length);

  const result: Record<number, string> = {};
  const used = new Set<string>();
  const place = (index: number): boolean => {
    if (index === slots.length) return true;
    const slot = slots[index];
    for (const group of slot.candidates) {
      if (used.has(group)) continue;
      used.add(group);
      result[slot.matchId] = group;
      if (place(index + 1)) return true;
      used.delete(group);
      delete result[slot.matchId];
    }
    return false;
  };

  return place(0) ? result : {};
}

export const actualRoundOf32Participants: Record<number, { home: string; away: string }> = {
  73: { home: "RSA", away: "CAN" },
  74: { home: "GER", away: "PAR" },
  75: { home: "NED", away: "MAR" },
  76: { home: "BRA", away: "JPN" },
  77: { home: "FRA", away: "SWE" },
  78: { home: "CIV", away: "NOR" },
  79: { home: "MEX", away: "ECU" },
  80: { home: "ENG", away: "COD" },
  81: { home: "USA", away: "BIH" },
  82: { home: "BEL", away: "SEN" },
  83: { home: "POR", away: "CRO" },
  84: { home: "ESP", away: "AUT" },
  85: { home: "SUI", away: "ALG" },
  86: { home: "ARG", away: "CPV" },
  87: { home: "COL", away: "GHA" },
  88: { home: "AUS", away: "EGY" },
};

export const knockoutMatches: KnockoutMatchDefinition[] = [
  { id: 73, stage: "Round of 32", date: "28 јуни", kickoff: "2026-06-28T19:00:00Z", venue: "SoFi Stadium", home: "2A", away: "2B" },
  { id: 74, stage: "Round of 32", date: "29 јуни", kickoff: "2026-06-29T20:30:00Z", venue: "Gillette Stadium", home: "1E", away: "3:A/B/C/D/F" },
  { id: 75, stage: "Round of 32", date: "29 јуни", kickoff: "2026-06-30T01:00:00Z", venue: "Estadio BBVA", home: "1F", away: "2C" },
  { id: 76, stage: "Round of 32", date: "29 јуни", kickoff: "2026-06-29T17:00:00Z", venue: "NRG Stadium", home: "1C", away: "2F" },
  { id: 77, stage: "Round of 32", date: "30 јуни", kickoff: "2026-06-30T21:00:00Z", venue: "MetLife Stadium", home: "1I", away: "3:C/D/F/G/H" },
  { id: 78, stage: "Round of 32", date: "30 јуни", kickoff: "2026-06-30T17:00:00Z", venue: "AT&T Stadium", home: "2E", away: "2I" },
  { id: 79, stage: "Round of 32", date: "30 јуни", kickoff: "2026-07-01T01:00:00Z", venue: "Estadio Azteca", home: "1A", away: "3:C/E/F/H/I" },
  { id: 80, stage: "Round of 32", date: "1 јули", kickoff: "2026-07-01T16:00:00Z", venue: "Mercedes-Benz Stadium", home: "1L", away: "3:E/H/I/J/K" },
  { id: 81, stage: "Round of 32", date: "1 јули", kickoff: "2026-07-02T00:00:00Z", venue: "Levi's Stadium", home: "1D", away: "3:B/E/F/I/J" },
  { id: 82, stage: "Round of 32", date: "1 јули", kickoff: "2026-07-01T20:00:00Z", venue: "Lumen Field", home: "1G", away: "3:A/E/H/I/J" },
  { id: 83, stage: "Round of 32", date: "2 јули", kickoff: "2026-07-02T23:00:00Z", venue: "BMO Field", home: "2K", away: "2L" },
  { id: 84, stage: "Round of 32", date: "2 јули", kickoff: "2026-07-02T19:00:00Z", venue: "SoFi Stadium", home: "1H", away: "2J" },
  { id: 85, stage: "Round of 32", date: "2 јули", kickoff: "2026-07-03T03:00:00Z", venue: "BC Place", home: "1B", away: "3:E/F/G/I/J" },
  { id: 86, stage: "Round of 32", date: "3 јули", kickoff: "2026-07-03T22:00:00Z", venue: "Hard Rock Stadium", home: "1J", away: "2H" },
  { id: 87, stage: "Round of 32", date: "3 јули", kickoff: "2026-07-04T01:30:00Z", venue: "Arrowhead Stadium", home: "1K", away: "3:D/E/I/J/L" },
  { id: 88, stage: "Round of 32", date: "3 јули", kickoff: "2026-07-03T18:00:00Z", venue: "AT&T Stadium", home: "2D", away: "2G" },
  { id: 89, stage: "Round of 16", date: "4 јули", kickoff: "2026-07-04T12:00:00Z", venue: "Филаделфија", home: "W74", away: "W77" },
  { id: 90, stage: "Round of 16", date: "4 јули", kickoff: "2026-07-04T12:00:00Z", venue: "Хјустон", home: "W73", away: "W75" },
  { id: 91, stage: "Round of 16", date: "5 јули", kickoff: "2026-07-05T12:00:00Z", venue: "Њујорк/Њу Џерси", home: "W76", away: "W78" },
  { id: 92, stage: "Round of 16", date: "5 јули", kickoff: "2026-07-05T12:00:00Z", venue: "Мексико Сити", home: "W79", away: "W80" },
  { id: 93, stage: "Round of 16", date: "6 јули", kickoff: "2026-07-06T12:00:00Z", venue: "Далас", home: "W83", away: "W84" },
  { id: 94, stage: "Round of 16", date: "6 јули", kickoff: "2026-07-06T12:00:00Z", venue: "Сиетл", home: "W81", away: "W82" },
  { id: 95, stage: "Round of 16", date: "7 јули", kickoff: "2026-07-07T12:00:00Z", venue: "Атланта", home: "W86", away: "W88" },
  { id: 96, stage: "Round of 16", date: "7 јули", kickoff: "2026-07-07T12:00:00Z", venue: "Ванкувер", home: "W85", away: "W87" },
  { id: 97, stage: "Quarter-finals", date: "9 јули", kickoff: "2026-07-09T12:00:00Z", venue: "Бостон", home: "W89", away: "W90" },
  { id: 98, stage: "Quarter-finals", date: "10 јули", kickoff: "2026-07-10T12:00:00Z", venue: "Лос Анџелес", home: "W93", away: "W94" },
  { id: 99, stage: "Quarter-finals", date: "11 јули", kickoff: "2026-07-11T12:00:00Z", venue: "Мајами", home: "W91", away: "W92" },
  { id: 100, stage: "Quarter-finals", date: "11 јули", kickoff: "2026-07-11T12:00:00Z", venue: "Канзас Сити", home: "W95", away: "W96" },
  { id: 101, stage: "Semi-finals", date: "14 јули", kickoff: "2026-07-14T12:00:00Z", venue: "Далас", home: "W97", away: "W98" },
  { id: 102, stage: "Semi-finals", date: "15 јули", kickoff: "2026-07-15T12:00:00Z", venue: "Атланта", home: "W99", away: "W100" },
  { id: 103, stage: "Medal matches", date: "18 јули", kickoff: "2026-07-18T12:00:00Z", venue: "Мајами", home: "L101", away: "L102" },
  { id: 104, stage: "Medal matches", date: "19 јули", kickoff: "2026-07-19T12:00:00Z", venue: "Њујорк/Њу Џерси", home: "W101", away: "W102" },
];

export const knockoutStages: KnockoutStage[] = [
  "Round of 32",
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "Medal matches",
];

export const previousKnockoutStage: Partial<Record<KnockoutStage, KnockoutStage>> = {
  "Round of 16": "Round of 32",
  "Quarter-finals": "Round of 16",
  "Semi-finals": "Quarter-finals",
  "Medal matches": "Semi-finals",
};

export const bracketMatchOrder: Record<KnockoutStage, number[]> = {
  "Round of 32": [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  "Round of 16": [89, 90, 93, 94, 91, 92, 95, 96],
  "Quarter-finals": [97, 98, 99, 100],
  "Semi-finals": [101, 102],
  "Medal matches": [104, 103],
};

export function getDescendantMatchIds(matchId: number) {
  const descendants = new Set<number>();
  const pending = [matchId];

  while (pending.length) {
    const sourceId = pending.shift()!;
    for (const match of knockoutMatches) {
      const referencesSource = [match.home, match.away].some(
        (reference) => reference === `W${sourceId}` || reference === `L${sourceId}`,
      );
      if (!referencesSource) continue;
      if (descendants.has(match.id)) continue;
      descendants.add(match.id);
      pending.push(match.id);
    }
  }

  return descendants;
}
