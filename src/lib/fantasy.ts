export const FANTASY_BUDGET = 1_600;
export const MAX_PLAYERS_PER_TEAM = 3;

export const fantasyPositionCounts = {
  Goalkeeper: 2,
  Defender: 5,
  Midfielder: 5,
  Forward: 4,
} as const;

export type FantasyPosition = keyof typeof fantasyPositionCounts;

export const fantasyFormations = {
  "4-4-2": { Goalkeeper: 1, Defender: 4, Midfielder: 4, Forward: 2 },
  "4-3-3": { Goalkeeper: 1, Defender: 4, Midfielder: 3, Forward: 3 },
  "3-5-2": { Goalkeeper: 1, Defender: 3, Midfielder: 5, Forward: 2 },
  "5-3-2": { Goalkeeper: 1, Defender: 5, Midfielder: 3, Forward: 2 },
  "3-4-3": { Goalkeeper: 1, Defender: 3, Midfielder: 4, Forward: 3 },
  "5-4-1": { Goalkeeper: 1, Defender: 5, Midfielder: 4, Forward: 1 },
} as const;

export type FantasyFormation = keyof typeof fantasyFormations;

export const fantasyPeriods = [
  "group_1",
  "group_2",
  "group_3",
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "final",
] as const;

export type FantasyPeriod = (typeof fantasyPeriods)[number];

export const fantasyPeriodLabels: Record<FantasyPeriod, string> = {
  group_1: "Групна фаза · Коло 1",
  group_2: "Групна фаза · Коло 2",
  group_3: "Групна фаза · Коло 3",
  round_of_32: "Нокаут · Шеснаесетфинале",
  round_of_16: "Нокаут · Осминафинале",
  quarter_final: "Нокаут · Четвртфинале",
  semi_final: "Нокаут · Полуфинале",
  final: "Нокаут · Финале",
};

export function isKnockoutFantasyPeriod(period: FantasyPeriod) {
  return !period.startsWith("group_");
}

export function countFantasyTransfers(
  baselinePlayerIds: string[],
  nextPlayerIds: string[],
) {
  const next = new Set(nextPlayerIds);
  return baselinePlayerIds.filter((id) => !next.has(id)).length;
}

const contenderTeams = new Set([
  "ARG",
  "BRA",
  "ENG",
  "ESP",
  "FRA",
  "GER",
  "NED",
  "POR",
]);

const strongTeams = new Set([
  "BEL",
  "COL",
  "CRO",
  "ECU",
  "JPN",
  "MAR",
  "NOR",
  "SEN",
  "SUI",
  "URU",
  "USA",
]);

const positionBasePrice: Record<FantasyPosition, number> = {
  Goalkeeper: 45,
  Defender: 50,
  Midfielder: 60,
  Forward: 65,
};

export function isFantasyPosition(position: string): position is FantasyPosition {
  return position in fantasyPositionCounts;
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getFantasyPrice(player: {
  id: string;
  teamId: string;
  position: FantasyPosition;
  jerseyNumber: number | null;
}) {
  const teamPremium = contenderTeams.has(player.teamId)
    ? 25
    : strongTeams.has(player.teamId)
      ? 15
      : 5;
  const squadRolePremium =
    player.jerseyNumber != null && player.jerseyNumber <= 11 ? 10 : 0;
  const variation = (stableHash(player.id) % 5) * 5;
  const price =
    positionBasePrice[player.position] +
    teamPremium +
    squadRolePremium +
    variation;

  return Math.max(50, Math.min(120, Math.round(price / 5) * 5));
}

export function formatFantasyPrice(price: number) {
  return `${(price / 10).toFixed(1)}m`;
}
