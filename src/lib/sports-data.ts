import { z } from "zod";
import {
  groups,
  upcomingMatches as fallbackMatches,
  type Match,
  type Team,
} from "@/lib/tournament";

const sportsDbKey = process.env.SPORTSDB_API_KEY ?? "123";
const SPORTS_DB_URL =
  `https://www.thesportsdb.com/api/v1/json/${sportsDbKey}/eventsseason.php?id=4429&s=2026`;
const SPORTS_DB_ROUND_URLS = [1, 2, 3].map(
  (round) =>
    `https://www.thesportsdb.com/api/v1/json/${sportsDbKey}/eventsround.php?id=4429&r=${round}&s=2026`,
);
const OPEN_FOOTBALL_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

const eventSchema = z.object({
  idEvent: z.string(),
  strHomeTeam: z.string().nullable(),
  strAwayTeam: z.string().nullable(),
  strTimestamp: z.string().nullable().optional(),
  dateEvent: z.string().nullable(),
  strTime: z.string().nullable(),
  strVenue: z.string().nullable(),
  strStatus: z.string().nullable(),
  intHomeScore: z.union([z.number(), z.string()]).nullable(),
  intAwayScore: z.union([z.number(), z.string()]).nullable(),
});

const responseSchema = z.object({
  events: z.array(eventSchema).nullable(),
});

const openFootballSchema = z.object({
  matches: z.array(z.object({
    date: z.string(),
    time: z.string(),
    team1: z.string(),
    team2: z.string(),
    group: z.string().optional(),
    ground: z.string(),
  })),
});

const aliases: Record<string, string> = {
  "Algeria": "ALG",
  "Argentina": "ARG",
  "Australia": "AUS",
  "Austria": "AUT",
  "Belgium": "BEL",
  "Bosnia & Herz.": "BIH",
  "Bosnia-Herzegovina": "BIH",
  "Bosnia & Herzegovina": "BIH",
  "Brazil": "BRA",
  "Cabo Verde": "CPV",
  "Canada": "CAN",
  "Cape Verde": "CPV",
  "Colombia": "COL",
  "Congo DR": "COD",
  "Croatia": "CRO",
  "Curaçao": "CUW",
  "Curacao": "CUW",
  "Czechia": "CZE",
  "Czech Republic": "CZE",
  "DR Congo": "COD",
  "Ecuador": "ECU",
  "Egypt": "EGY",
  "England": "ENG",
  "France": "FRA",
  "Germany": "GER",
  "Ghana": "GHA",
  "Haiti": "HAI",
  "Iran": "IRN",
  "IR Iran": "IRN",
  "Iraq": "IRQ",
  "Ivory Coast": "CIV",
  "Japan": "JPN",
  "Jordan": "JOR",
  "Korea Republic": "KOR",
  "Mexico": "MEX",
  "Morocco": "MAR",
  "Netherlands": "NED",
  "New Zealand": "NZL",
  "Norway": "NOR",
  "Panama": "PAN",
  "Paraguay": "PAR",
  "Portugal": "POR",
  "Qatar": "QAT",
  "Saudi Arabia": "KSA",
  "Scotland": "SCO",
  "Senegal": "SEN",
  "South Africa": "RSA",
  "South Korea": "KOR",
  "Spain": "ESP",
  "Sweden": "SWE",
  "Switzerland": "SUI",
  "Tunisia": "TUN",
  "Turkey": "TUR",
  "Türkiye": "TUR",
  "United States": "USA",
  "Uruguay": "URU",
  "USA": "USA",
  "Uzbekistan": "UZB",
};

const teams = groups.flatMap((group) =>
  group.teams.map((team) => ({ team, group: group.id })),
);

function findTeam(name: string | null): { team: Team; group: string } | null {
  if (!name) return null;
  const code = aliases[name];
  if (code) return teams.find((item) => item.team.code === code) ?? null;

  const normalized = name.toLocaleLowerCase("en");
  return (
    teams.find((item) => item.team.name.toLocaleLowerCase("en") === normalized) ??
    null
  );
}

function score(value: string | number | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function kickoff(event: z.infer<typeof eventSchema>) {
  if (event.strTimestamp) {
    const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(event.strTimestamp)
      ? event.strTimestamp
      : `${event.strTimestamp}Z`;
    return new Date(timestamp).toISOString();
  }
  if (!event.dateEvent) throw new Error("Event has no date");
  return new Date(`${event.dateEvent}T${event.strTime ?? "00:00:00"}Z`).toISOString();
}

function openFootballKickoff(date: string, time: string) {
  const match = time.match(/^(\d{2}:\d{2}) UTC([+-]\d{1,2})$/);
  if (!match) return new Date(`${date}T00:00:00Z`).toISOString();
  const offset = Number(match[2]);
  const sign = offset >= 0 ? "+" : "-";
  return new Date(`${date}T${match[1]}:00${sign}${String(Math.abs(offset)).padStart(2, "0")}:00`).toISOString();
}

function matchKey(home: Team, away: Team) {
  return `${home.code}:${away.code}`;
}

async function fetchSportsDbEvents(url: string) {
  const response = await fetch(url, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return [];
  return responseSchema.parse(await response.json()).events ?? [];
}

export async function getUpcomingMatches(): Promise<Match[]> {
  try {
    const [scheduleResponse, liveResponse] = await Promise.all([
      fetch(OPEN_FOOTBALL_URL, {
        next: { revalidate: 86_400 },
        signal: AbortSignal.timeout(5_000),
      }),
      Promise.all(
        [SPORTS_DB_URL, ...SPORTS_DB_ROUND_URLS].map((url) =>
          fetchSportsDbEvents(url).catch(() => []),
        ),
      ),
    ]);
    if (!scheduleResponse.ok) throw new Error(`OpenFootball returned ${scheduleResponse.status}`);

    const schedule = openFootballSchema.parse(await scheduleResponse.json());
    const matches: Match[] = [];
    for (const [index, fixture] of schedule.matches.filter((match) => match.group).entries()) {
      const home = findTeam(fixture.team1);
      const away = findTeam(fixture.team2);
      if (!home || !away || home.group !== away.group) continue;
      matches.push({
        id: index + 1,
        group: home.group,
        round: 1,
        home: home.team,
        away: away.team,
        kickoff: openFootballKickoff(fixture.date, fixture.time),
        venue: fixture.ground,
      });
    }

    const liveEvents = liveResponse.flat();
    const liveByMatch = new Map<string, z.infer<typeof eventSchema>>();
    for (const event of liveEvents) {
      const home = findTeam(event.strHomeTeam);
      const away = findTeam(event.strAwayTeam);
      if (!home || !away || home.group !== away.group) continue;
      liveByMatch.set(matchKey(home.team, away.team), event);
    }

    for (const match of matches) {
      const live = liveByMatch.get(matchKey(match.home, match.away));
      if (!live) continue;
      match.kickoff = kickoff(live);
      match.venue = live.strVenue ?? match.venue;
      match.homeScore = score(live.intHomeScore);
      match.awayScore = score(live.intAwayScore);
      match.status = live.strStatus ?? undefined;
    }

    const byGroup = new Map<string, Match[]>();
    for (const match of matches) {
      const groupMatches = byGroup.get(match.group) ?? [];
      groupMatches.push(match);
      byGroup.set(match.group, groupMatches);
    }

    for (const groupMatches of byGroup.values()) {
      groupMatches.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
      groupMatches.forEach((match, index) => {
        match.round = (Math.floor(index / 2) + 1) as 1 | 2 | 3;
      });
    }

    return matches.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  } catch {
    return fallbackMatches;
  }
}
