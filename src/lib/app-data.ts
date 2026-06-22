import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  awardPredictions,
  fantasyTeams,
  matchPredictions,
  matches,
  players,
  teams,
  tournamentPredictions,
  users,
} from "@/db/schema";
import { ADMIN_EMAIL } from "@/lib/admin-auth";
import { syncWorldCupPlayers } from "@/lib/squad-data";
import { getUpcomingMatches } from "@/lib/sports-data";
import { scoreMatchPrediction } from "@/lib/scoring";
import {
  groups,
  TOURNAMENT_PREDICTION_LOCK_TIME,
  type Match,
} from "@/lib/tournament";
import {
  countFantasyTransfers,
  type FantasyPeriod,
} from "@/lib/fantasy";
import { getFantasyContext } from "@/lib/fantasy-context";

export type PredictionSummary = {
  home: number;
  draw: number;
  away: number;
  total: number;
};

export type PlayerPrediction = {
  name: string;
  initials: string;
  avatarUrl: string | null;
  home: number;
  away: number;
};

export type MatchPredictionData = {
  current: { home: number; away: number } | null;
  summary: PredictionSummary;
  players: PlayerPrediction[];
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  tournament: number;
  awards: number;
  matches: number;
  total: number;
  current: boolean;
  tournamentPrediction: TournamentPredictionData | null;
};

export type CurrentPlayerStats = {
  rank: number | null;
  totalPlayers: number;
  totalPoints: number;
  tournamentPoints: number;
  awardPoints: number;
  matchPoints: number;
  exactScores: number;
  predictions: number;
  tournamentSubmitted: boolean;
  awardsSubmitted: boolean;
};

export type TournamentPredictionData = {
  groupRankings: Record<string, string[]>;
  thirdPlaceGroups: string[];
  bracket: Record<string, string>;
  submittedAt: string;
};

export type AwardPlayerData = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  position: string;
  dateOfBirth: string | null;
  jerseyNumber: number | null;
  imageUrl: string | null;
};

export type AwardPredictionData = {
  goldenBootPlayerId: string;
  goldenGlovePlayerId: string;
  goldenBallPlayerId: string;
  youngPlayerId: string;
  submittedAt: string;
  updatedAt: string;
};

export type FantasyTeamData = {
  name: string;
  formation: string;
  playerIds: string[];
  starterIds: string[];
  captainId: string | null;
  period: string;
  baselinePlayerIds: string[];
  updatedAt: string;
};

export type FantasyContextData = {
  period: FantasyPeriod;
  label: string;
  eligibleTeamIds: string[];
  maxTransfers: number | null;
  transfersUsed: number;
  freshSquad: boolean;
};

export type PublicFantasyTeamData = FantasyTeamData & {
  userId: string;
  ownerName: string;
  ownerInitials: string;
  ownerAvatarUrl: string | null;
  current: boolean;
};

export type AppData = {
  matches: Match[];
  nextMatches: Match[];
  currentTime: string;
  matchPredictions: Record<number, MatchPredictionData>;
  leaderboard: LeaderboardEntry[];
  currentPlayer: CurrentPlayerStats | null;
  tournamentPrediction: TournamentPredictionData | null;
  tournamentLockTime: string | null;
  tournamentLocked: boolean;
  awardPlayers: AwardPlayerData[];
  awardPrediction: AwardPredictionData | null;
  fantasyTeam: FantasyTeamData | null;
  fantasyContext: FantasyContextData;
  publicFantasyTeams: PublicFantasyTeamData[];
  signedIn: boolean;
  isAdmin: boolean;
  configured: boolean;
};

export function isAppConfigured() {
  return Boolean(
    process.env.DATABASE_URL &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "WP";
}

export async function syncCurrentUser() {
  if (!isAppConfigured()) return null;
  const { userId } = await auth();
  if (!userId) return null;

  const profile = await currentUser();
  const displayName =
    profile?.fullName ??
    profile?.username ??
    profile?.primaryEmailAddress?.emailAddress.split("@")[0] ??
    "Worldie играч";
  const db = getDb();

  await db
    .insert(users)
    .values({
      id: userId,
      displayName,
      email: profile?.primaryEmailAddress?.emailAddress,
      avatarUrl: profile?.imageUrl,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        displayName,
        email: profile?.primaryEmailAddress?.emailAddress,
        avatarUrl: profile?.imageUrl,
      },
    });

  return {
    userId,
    email: profile?.primaryEmailAddress?.emailAddress.toLowerCase() ?? null,
  };
}

export async function syncTournamentData(schedule: Match[]) {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();

  await db
    .insert(teams)
    .values(
      groups.flatMap((group) =>
        group.teams.map((team) => ({
          id: team.code,
          name: team.name,
          group: group.id,
          flag: team.flag,
        })),
      ),
    )
    .onConflictDoUpdate({
      target: teams.id,
      set: {
        name: sql`excluded.name`,
        group: sql`excluded.group_name`,
        flag: sql`excluded.flag`,
      },
    });

  if (schedule.length === 0) return;
  await db
    .insert(matches)
    .values(
      schedule.map((match) => ({
        id: match.id,
        stage: "group" as const,
        group: match.group,
        homeTeamId: match.home.code,
        awayTeamId: match.away.code,
        kickoff: new Date(match.kickoff),
        venue: match.venue,
        homeScore: match.homeScore ?? null,
        awayScore: match.awayScore ?? null,
        complete:
          match.homeScore != null &&
          match.awayScore != null &&
          /finished|full time|ft/i.test(match.status ?? ""),
      })),
    )
    .onConflictDoUpdate({
      target: matches.id,
      set: {
        group: sql`excluded.group_name`,
        homeTeamId: sql`excluded.home_team_id`,
        awayTeamId: sql`excluded.away_team_id`,
        kickoff: sql`excluded.kickoff`,
        venue: sql`excluded.venue`,
        homeScore: sql`case when excluded.complete then excluded.home_score else ${matches.homeScore} end`,
        awayScore: sql`case when excluded.complete then excluded.away_score else ${matches.awayScore} end`,
        complete: sql`${matches.complete} or excluded.complete`,
      },
    });

  const completedMatches = schedule.filter(
    (match) =>
      match.homeScore != null &&
      match.awayScore != null &&
      /finished|full time|ft/i.test(match.status ?? ""),
  );
  if (completedMatches.length === 0) return;

  const predictions = await db
    .select({
      userId: matchPredictions.userId,
      matchId: matchPredictions.matchId,
      homeScore: matchPredictions.homeScore,
      awayScore: matchPredictions.awayScore,
    })
    .from(matchPredictions)
    .where(inArray(matchPredictions.matchId, completedMatches.map((match) => match.id)));
  const results = new Map(completedMatches.map((match) => [match.id, match]));

  await Promise.all(
    predictions.map((prediction) => {
      const result = results.get(prediction.matchId);
      if (result?.homeScore == null || result.awayScore == null) return Promise.resolve();
      return db
        .update(matchPredictions)
        .set({
          points: scoreMatchPrediction(
            { home: prediction.homeScore, away: prediction.awayScore },
            { home: result.homeScore, away: result.awayScore },
          ),
        })
        .where(
          and(
            eq(matchPredictions.userId, prediction.userId),
            eq(matchPredictions.matchId, prediction.matchId),
          ),
        );
    }),
  );
}

async function getMatchPredictionData(matchIds: number[], userId: string | null) {
  const empty: Record<number, MatchPredictionData> = Object.fromEntries(
    matchIds.map((matchId) => [
      matchId,
      {
        current: null,
        summary: { home: 0, draw: 0, away: 0, total: 0 },
        players: [],
      } satisfies MatchPredictionData,
    ]),
  );
  if (!process.env.DATABASE_URL || matchIds.length === 0) return empty;

  const db = getDb();
  const rows = await db
    .select({
      matchId: matchPredictions.matchId,
      userId: matchPredictions.userId,
      homeScore: matchPredictions.homeScore,
      awayScore: matchPredictions.awayScore,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(matchPredictions)
    .innerJoin(users, eq(users.id, matchPredictions.userId))
    .where(inArray(matchPredictions.matchId, matchIds))
    .orderBy(desc(matchPredictions.submittedAt));

  for (const matchId of matchIds) {
    const predictions = rows.filter((row) => row.matchId === matchId);
    const home = predictions.filter((row) => row.homeScore > row.awayScore).length;
    const draw = predictions.filter((row) => row.homeScore === row.awayScore).length;
    const away = predictions.length - home - draw;
    const percentage = (count: number) =>
      predictions.length === 0 ? 0 : Math.round((count / predictions.length) * 100);

    empty[matchId] = {
      current: userId
        ? predictions
            .filter((row) => row.userId === userId)
            .map((row) => ({ home: row.homeScore, away: row.awayScore }))[0] ?? null
        : null,
      summary: {
        home: percentage(home),
        draw: percentage(draw),
        away: percentage(away),
        total: predictions.length,
      },
      players: predictions
        .filter((row) => row.userId !== userId)
        .slice(0, 12)
        .map((row) => ({
          name: row.displayName,
          initials: initials(row.displayName),
          avatarUrl: row.avatarUrl,
          home: row.homeScore,
          away: row.awayScore,
        })),
    };
  }

  return empty;
}

async function getLeaderboard(userId: string | null) {
  if (!process.env.DATABASE_URL) return [];
  const db = getDb();
  const tournamentTotals = db
    .select({
      userId: tournamentPredictions.userId,
      tournamentPoints: tournamentPredictions.points,
    })
    .from(tournamentPredictions)
    .as("tournament_totals");
  const matchTotals = db
    .select({
      userId: matchPredictions.userId,
      matchPoints: sql<number>`coalesce(sum(${matchPredictions.points}), 0)`.mapWith(Number).as("match_points"),
    })
    .from(matchPredictions)
    .groupBy(matchPredictions.userId)
    .as("match_totals");
  const awardTotals = db
    .select({
      userId: awardPredictions.userId,
      awardPoints: awardPredictions.points,
    })
    .from(awardPredictions)
    .as("award_totals");

  const rows = await db
    .select({
      userId: users.id,
      name: users.displayName,
      avatarUrl: users.avatarUrl,
      tournament: sql<number>`coalesce(${tournamentTotals.tournamentPoints}, 0)`.mapWith(Number),
      awardPoints: sql<number>`coalesce(${awardTotals.awardPoints}, 0)`.mapWith(Number),
      matchPoints: sql<number>`coalesce(${matchTotals.matchPoints}, 0)`.mapWith(Number),
      total: sql<number>`coalesce(${tournamentTotals.tournamentPoints}, 0) + coalesce(${awardTotals.awardPoints}, 0) + coalesce(${matchTotals.matchPoints}, 0)`.mapWith(Number),
      tournamentGroupRankings: tournamentPredictions.groupRankings,
      tournamentThirdPlaceGroups: tournamentPredictions.thirdPlaceGroups,
      tournamentBracket: tournamentPredictions.bracket,
      tournamentSubmittedAt: tournamentPredictions.submittedAt,
    })
    .from(users)
    .leftJoin(tournamentPredictions, eq(tournamentPredictions.userId, users.id))
    .leftJoin(tournamentTotals, eq(tournamentTotals.userId, users.id))
    .leftJoin(awardTotals, eq(awardTotals.userId, users.id))
    .leftJoin(matchTotals, eq(matchTotals.userId, users.id))
    .orderBy(desc(sql`coalesce(${tournamentTotals.tournamentPoints}, 0) + coalesce(${awardTotals.awardPoints}, 0) + coalesce(${matchTotals.matchPoints}, 0)`), asc(users.createdAt));

  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    name: row.name,
    initials: initials(row.name),
    avatarUrl: row.avatarUrl,
    tournament: row.tournament,
    awards: row.awardPoints,
    matches: row.matchPoints,
    total: row.total,
    current: row.userId === userId,
    tournamentPrediction:
      row.tournamentGroupRankings &&
      row.tournamentThirdPlaceGroups &&
      row.tournamentBracket &&
      row.tournamentSubmittedAt
        ? {
            groupRankings: row.tournamentGroupRankings,
            thirdPlaceGroups: row.tournamentThirdPlaceGroups,
            bracket: row.tournamentBracket,
            submittedAt: row.tournamentSubmittedAt.toISOString(),
          }
        : null,
  }));
}

async function getCurrentPlayerStats(
  userId: string | null,
  leaderboard: LeaderboardEntry[],
) {
  if (!userId || !process.env.DATABASE_URL) return null;
  const db = getDb();
  const [predictionStats] = await db
    .select({
      predictions: sql<number>`count(*)`.mapWith(Number),
      exactScores: sql<number>`count(*) filter (where ${matchPredictions.points} = 5)`.mapWith(Number),
    })
    .from(matchPredictions)
    .where(eq(matchPredictions.userId, userId));
  const [tournament] = await db
    .select({ points: tournamentPredictions.points })
    .from(tournamentPredictions)
    .where(eq(tournamentPredictions.userId, userId))
    .limit(1);
  const [awards] = await db
    .select({ points: awardPredictions.points })
    .from(awardPredictions)
    .where(eq(awardPredictions.userId, userId))
    .limit(1);
  const entry = leaderboard.find((player) => player.userId === userId);

  return {
    rank: entry?.rank ?? null,
    totalPlayers: leaderboard.length,
    totalPoints: entry?.total ?? 0,
    tournamentPoints: tournament?.points ?? 0,
    awardPoints: awards?.points ?? 0,
    matchPoints: entry?.matches ?? 0,
    exactScores: predictionStats?.exactScores ?? 0,
    predictions: predictionStats?.predictions ?? 0,
    tournamentSubmitted: Boolean(tournament),
    awardsSubmitted: Boolean(awards),
  };
}

async function getTournamentPrediction(userId: string | null) {
  if (!userId || !process.env.DATABASE_URL) return null;
  const db = getDb();
  const [prediction] = await db
    .select({
      groupRankings: tournamentPredictions.groupRankings,
      thirdPlaceGroups: tournamentPredictions.thirdPlaceGroups,
      bracket: tournamentPredictions.bracket,
      submittedAt: tournamentPredictions.submittedAt,
    })
    .from(tournamentPredictions)
    .where(eq(tournamentPredictions.userId, userId))
    .limit(1);

  return prediction
    ? {
        ...prediction,
        submittedAt: prediction.submittedAt.toISOString(),
      }
    : null;
}

async function getAwardData(userId: string | null) {
  if (!process.env.DATABASE_URL || !userId) {
    return { awardPlayers: [], awardPrediction: null };
  }
  const db = getDb();
  const [playerRows, predictionRows] = await Promise.all([
    db
      .select({
        id: players.id,
        name: players.name,
        teamId: players.teamId,
        teamName: teams.name,
        position: players.position,
        dateOfBirth: players.dateOfBirth,
        jerseyNumber: players.jerseyNumber,
        imageUrl: players.imageUrl,
      })
      .from(players)
      .innerJoin(teams, eq(teams.id, players.teamId))
      .orderBy(asc(teams.name), asc(players.name)),
    db
      .select()
      .from(awardPredictions)
      .where(eq(awardPredictions.userId, userId))
      .limit(1),
  ]);
  const prediction = predictionRows[0];

  return {
    awardPlayers: playerRows.map((player) => ({
      ...player,
      dateOfBirth: player.dateOfBirth?.toISOString() ?? null,
    })),
    awardPrediction: prediction
      ? {
          goldenBootPlayerId: prediction.goldenBootPlayerId,
          goldenGlovePlayerId: prediction.goldenGlovePlayerId,
          goldenBallPlayerId: prediction.goldenBallPlayerId,
          youngPlayerId: prediction.youngPlayerId,
          submittedAt: prediction.submittedAt.toISOString(),
          updatedAt: prediction.updatedAt.toISOString(),
        }
      : null,
  };
}

async function getFantasyTeam(userId: string | null) {
  if (!process.env.DATABASE_URL || !userId) return null;
  const db = getDb();
  const [fantasyTeam] = await db
    .select({
      name: fantasyTeams.name,
      formation: fantasyTeams.formation,
      playerIds: fantasyTeams.playerIds,
      starterIds: fantasyTeams.starterIds,
      captainId: fantasyTeams.captainId,
      period: fantasyTeams.period,
      baselinePlayerIds: fantasyTeams.baselinePlayerIds,
      updatedAt: fantasyTeams.updatedAt,
    })
    .from(fantasyTeams)
    .where(eq(fantasyTeams.userId, userId))
    .limit(1);

  return fantasyTeam
    ? { ...fantasyTeam, updatedAt: fantasyTeam.updatedAt.toISOString() }
    : null;
}

async function getPublicFantasyTeams(userId: string | null) {
  if (!process.env.DATABASE_URL) return [];
  const db = getDb();
  const rows = await db
    .select({
      userId: fantasyTeams.userId,
      ownerName: users.displayName,
      ownerAvatarUrl: users.avatarUrl,
      name: fantasyTeams.name,
      formation: fantasyTeams.formation,
      playerIds: fantasyTeams.playerIds,
      starterIds: fantasyTeams.starterIds,
      captainId: fantasyTeams.captainId,
      period: fantasyTeams.period,
      baselinePlayerIds: fantasyTeams.baselinePlayerIds,
      updatedAt: fantasyTeams.updatedAt,
    })
    .from(fantasyTeams)
    .innerJoin(users, eq(users.id, fantasyTeams.userId))
    .orderBy(desc(fantasyTeams.updatedAt));

  return rows.map((team) => ({
    ...team,
    ownerInitials: initials(team.ownerName),
    current: team.userId === userId,
    updatedAt: team.updatedAt.toISOString(),
  }));
}

async function applyPersistedResults(schedule: Match[]) {
  if (!process.env.DATABASE_URL || schedule.length === 0) return schedule;
  const db = getDb();
  const stored = await db
    .select({
      id: matches.id,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      complete: matches.complete,
    })
    .from(matches)
    .where(inArray(matches.id, schedule.map((match) => match.id)));
  const storedById = new Map(stored.map((match) => [match.id, match]));

  return schedule.map((match) => {
    const persisted = storedById.get(match.id);
    if (!persisted?.complete) return match;
    return {
      ...match,
      homeScore: persisted.homeScore,
      awayScore: persisted.awayScore,
      status: "Match Finished",
    };
  });
}

export async function getAppData(): Promise<AppData> {
  let schedule = await getUpcomingMatches();
  const currentTime = new Date().toISOString();
  const nextMatches = () => schedule
    .filter((match) => new Date(match.kickoff).getTime() > now)
    .slice(0, 3);
  const now = new Date(currentTime).getTime();
  const fallbackFantasyContext: FantasyContextData = {
    period: "group_1",
    label: "Групна фаза · Коло 1",
    eligibleTeamIds: groups.flatMap((group) => group.teams.map((team) => team.code)),
    maxTransfers: null,
    transfersUsed: 0,
    freshSquad: true,
  };
  if (!isAppConfigured()) {
    return {
      matches: schedule,
      nextMatches: nextMatches(),
      currentTime,
      matchPredictions: Object.fromEntries(
        schedule.map((match) => [
          match.id,
          {
            current: null,
            summary: { home: 0, draw: 0, away: 0, total: 0 },
            players: [],
          },
        ]),
      ),
      leaderboard: [],
      currentPlayer: null,
      tournamentPrediction: null,
      tournamentLockTime: TOURNAMENT_PREDICTION_LOCK_TIME,
      tournamentLocked:
        new Date(currentTime).getTime() >=
        new Date(TOURNAMENT_PREDICTION_LOCK_TIME).getTime(),
      awardPlayers: [],
      awardPrediction: null,
      fantasyTeam: null,
      fantasyContext: fallbackFantasyContext,
      publicFantasyTeams: [],
      signedIn: false,
      isAdmin: false,
      configured: false,
    };
  }

  await syncTournamentData(schedule);
  try {
    await syncWorldCupPlayers();
  } catch (error) {
    console.error("Player squad sync failed", error);
  }
  schedule = await applyPersistedResults(schedule);
  const currentUserData = await syncCurrentUser();
  const userId = currentUserData?.userId ?? null;
  const tournamentLockTime = TOURNAMENT_PREDICTION_LOCK_TIME;
  const [matchPredictionData, leaderboard, tournamentPrediction, awardData, fantasyTeam, fantasyContext, publicFantasyTeams] = await Promise.all([
    getMatchPredictionData(schedule.map((match) => match.id), userId),
    getLeaderboard(userId),
    getTournamentPrediction(userId),
    getAwardData(userId),
    getFantasyTeam(userId),
    getFantasyContext(new Date(currentTime)),
    getPublicFantasyTeams(userId),
  ]);
  const transferBaseline =
    fantasyTeam?.period === fantasyContext.period
      ? fantasyTeam.baselinePlayerIds
      : fantasyContext.freshSquad
        ? []
        : fantasyTeam?.playerIds ?? [];
  const transfersUsed =
    fantasyTeam && transferBaseline.length > 0
      ? countFantasyTransfers(transferBaseline, fantasyTeam.playerIds)
      : 0;

  return {
    matches: schedule,
    nextMatches: nextMatches(),
    currentTime,
    matchPredictions: matchPredictionData,
    leaderboard,
    currentPlayer: await getCurrentPlayerStats(userId, leaderboard),
    tournamentPrediction,
    tournamentLockTime,
    tournamentLocked: tournamentLockTime
      ? new Date(currentTime).getTime() >= new Date(tournamentLockTime).getTime()
      : true,
    ...awardData,
    fantasyTeam,
    fantasyContext: {
      ...fantasyContext,
      transfersUsed,
    },
    publicFantasyTeams,
    signedIn: Boolean(userId),
    isAdmin: currentUserData?.email === ADMIN_EMAIL,
    configured: true,
  };
}
