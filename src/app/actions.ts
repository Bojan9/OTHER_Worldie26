"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import {
  awardPredictions,
  fantasyTeams,
  matchPredictions,
  matches,
  players,
  tournamentPredictions,
  users,
} from "@/db/schema";
import {
  FANTASY_BUDGET,
  MAX_PLAYERS_PER_TEAM,
  fantasyFormations,
  fantasyPositionCounts,
  countFantasyTransfers,
  getFantasyPrice,
  isFantasyPosition,
  type FantasyFormation,
  type FantasyPosition,
} from "@/lib/fantasy";
import {
  assertFantasyTeamsEligible,
  getFantasyContext,
} from "@/lib/fantasy-context";
import { canSubmitMatchPrediction } from "@/lib/scoring";
import { groups } from "@/lib/tournament";

const scoreSchema = z.object({
  matchId: z.coerce.number().int().positive(),
  homeScore: z.coerce.number().int().min(0).max(30),
  awayScore: z.coerce.number().int().min(0).max(30),
});

const awardSchema = z.object({
  goldenBootPlayerId: z.string().min(1),
  goldenGlovePlayerId: z.string().min(1),
  goldenBallPlayerId: z.string().min(1),
  youngPlayerId: z.string().min(1),
});

const fantasyTeamSchema = z.object({
  name: z.string().trim().min(2).max(40),
  formation: z.enum(["4-4-2", "4-3-3", "3-5-2", "5-3-2", "3-4-3", "5-4-1"]),
  playerIds: z.array(z.string().min(1)).length(16),
  starterIds: z.array(z.string().min(1)).length(11),
  captainId: z.string().min(1),
});

const teamCodes = new Set(groups.flatMap((group) => group.teams.map((team) => team.code)));
const tournamentSchema = z.object({
  groupRankings: z.record(z.string(), z.array(z.string())),
  thirdPlaceGroups: z.array(z.string()),
  bracket: z.record(z.string(), z.string()),
}).superRefine((prediction, context) => {
  const groupIds = groups.map((group) => group.id);
  if (
    Object.keys(prediction.groupRankings).length !== groupIds.length ||
    groupIds.some((groupId) => {
      const ranking = prediction.groupRankings[groupId];
      return (
        ranking?.length !== 4 ||
        new Set(ranking).size !== 4 ||
        ranking.some((code) => !teamCodes.has(code))
      );
    })
  ) {
    context.addIssue({
      code: "custom",
      message: "Секоја група мора да содржи четири различно рангирани репрезентации.",
    });
  }
  if (
    prediction.thirdPlaceGroups.length !== 8 ||
    new Set(prediction.thirdPlaceGroups).size !== 8 ||
    prediction.thirdPlaceGroups.some((groupId) => !groupIds.includes(groupId))
  ) {
    context.addIssue({
      code: "custom",
      message: "Мора да изберете точно осум различни групи со третопласирани репрезентации.",
    });
  }
  if (
    Object.keys(prediction.bracket).length !== 32 ||
    Object.values(prediction.bracket).some((code) => !teamCodes.has(code))
  ) {
    context.addIssue({
      code: "custom",
      message: "Мора да бидат избрани сите 32 победници во нокаут-фазата.",
    });
  }
});

async function ensureCurrentUser(db: ReturnType<typeof getDb>) {
  const { userId } = await auth();
  if (!userId) throw new Error("Мора да се најавите за да испратите предвидување.");
  const profile = await currentUser();
  const displayName =
    profile?.fullName ??
    profile?.username ??
    profile?.primaryEmailAddress?.emailAddress.split("@")[0] ??
    "Worldie играч";
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
  return userId;
}

async function getTournamentLockTime(db: ReturnType<typeof getDb>) {
  const [firstMatch] = await db
    .select({ kickoff: matches.kickoff })
    .from(matches)
    .orderBy(asc(matches.kickoff))
    .limit(1);

  if (!firstMatch) {
    throw new Error("Не може да се утврди почетокот на турнирот.");
  }

  return firstMatch.kickoff;
}

function assertTournamentOpen(lockTime: Date) {
  if (Date.now() >= lockTime.getTime()) {
    throw new Error("Турнирските предвидувања се затворени по почетокот на првиот натпревар.");
  }
}

export async function saveMatchPrediction(input: z.input<typeof scoreSchema>) {
  const prediction = scoreSchema.parse(input);
  const db = getDb();
  const userId = await ensureCurrentUser(db);
  const [match] = await db
    .select({ kickoff: matches.kickoff })
    .from(matches)
    .where(eq(matches.id, prediction.matchId))
    .limit(1);

  if (!match || !canSubmitMatchPrediction(match.kickoff)) {
    throw new Error("Предвидувањата се затвораат 10 минути пред почетокот.");
  }

  await db
    .insert(matchPredictions)
    .values({ userId, ...prediction })
    .onConflictDoUpdate({
      target: [matchPredictions.userId, matchPredictions.matchId],
      set: {
        homeScore: prediction.homeScore,
        awayScore: prediction.awayScore,
        submittedAt: new Date(),
      },
    });
  revalidatePath("/");
  return {
    matchId: prediction.matchId,
    homeScore: prediction.homeScore,
    awayScore: prediction.awayScore,
  };
}

export async function saveTournamentPrediction(
  input: z.input<typeof tournamentSchema>,
) {
  const prediction = tournamentSchema.parse(input);
  const db = getDb();
  const userId = await ensureCurrentUser(db);
  assertTournamentOpen(await getTournamentLockTime(db));
  const inserted = await db
    .insert(tournamentPredictions)
    .values({
      userId,
      groupRankings: prediction.groupRankings,
      thirdPlaceGroups: prediction.thirdPlaceGroups,
      bracket: prediction.bracket,
    })
    .onConflictDoNothing()
    .returning({ userId: tournamentPredictions.userId });

  if (inserted.length === 0) {
    throw new Error("Вашето турнирско предвидување веќе е испратено.");
  }

  revalidatePath("/");
  return { submitted: true };
}

export async function resetTournamentPrediction() {
  const db = getDb();
  const userId = await ensureCurrentUser(db);
  assertTournamentOpen(await getTournamentLockTime(db));

  await db
    .delete(tournamentPredictions)
    .where(eq(tournamentPredictions.userId, userId));

  revalidatePath("/");
  return { reset: true };
}

export async function saveAwardPrediction(input: z.input<typeof awardSchema>) {
  const prediction = awardSchema.parse(input);
  const lockTime = new Date("2026-06-11T18:50:00Z");
  if (Date.now() > lockTime.getTime()) {
    throw new Error("Предвидувањата за наградите се затворени.");
  }

  const db = getDb();
  const userId = await ensureCurrentUser(db);
  const selectedIds = [...new Set(Object.values(prediction))];
  const selectedPlayers = await db
    .select({
      id: players.id,
      position: players.position,
      dateOfBirth: players.dateOfBirth,
    })
    .from(players)
    .where(inArray(players.id, selectedIds));
  const playerById = new Map(selectedPlayers.map((player) => [player.id, player]));

  if (selectedIds.some((id) => !playerById.has(id))) {
    throw new Error("Еден или повеќе од избраните играчи не се валидни.");
  }
  if (playerById.get(prediction.goldenGlovePlayerId)?.position !== "Goalkeeper") {
    throw new Error("За Златна ракавица мора да изберете голман.");
  }

  const youngPlayer = playerById.get(prediction.youngPlayerId);
  const openingDay = new Date("2026-06-11T00:00:00Z");
  const under21Cutoff = new Date(openingDay);
  under21Cutoff.setUTCFullYear(under21Cutoff.getUTCFullYear() - 21);
  if (!youngPlayer?.dateOfBirth || youngPlayer.dateOfBirth <= under21Cutoff) {
    throw new Error("За наградата за млад играч мора да изберете играч под 21 година.");
  }

  await db
    .insert(awardPredictions)
    .values({ userId, ...prediction })
    .onConflictDoUpdate({
      target: awardPredictions.userId,
      set: {
        ...prediction,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/");
  return { saved: true };
}

export async function saveFantasyTeam(
  input: z.input<typeof fantasyTeamSchema>,
) {
  const fantasyTeam = fantasyTeamSchema.parse(input);
  const uniquePlayerIds = [...new Set(fantasyTeam.playerIds)];
  const uniqueStarterIds = [...new Set(fantasyTeam.starterIds)];

  if (
    uniquePlayerIds.length !== 16 ||
    uniqueStarterIds.length !== 11 ||
    uniqueStarterIds.some((id) => !uniquePlayerIds.includes(id))
  ) {
    throw new Error("Изборот мора да содржи 16 различни играчи и 11 стартери.");
  }
  if (!uniqueStarterIds.includes(fantasyTeam.captainId)) {
    throw new Error("Капитенот мора да биде дел од почетните 11.");
  }

  const db = getDb();
  const userId = await ensureCurrentUser(db);
  const [selectedPlayers, existingRows, context] = await Promise.all([
    db
      .select({
        id: players.id,
        teamId: players.teamId,
        position: players.position,
        jerseyNumber: players.jerseyNumber,
      })
      .from(players)
      .where(inArray(players.id, uniquePlayerIds)),
    db
      .select({
        period: fantasyTeams.period,
        playerIds: fantasyTeams.playerIds,
        baselinePlayerIds: fantasyTeams.baselinePlayerIds,
      })
      .from(fantasyTeams)
      .where(eq(fantasyTeams.userId, userId))
      .limit(1),
    getFantasyContext(),
  ]);

  if (
    selectedPlayers.length !== 16 ||
    selectedPlayers.some((player) => !isFantasyPosition(player.position))
  ) {
    throw new Error("Еден или повеќе од избраните играчи не се валидни.");
  }

  const squadCounts = Object.fromEntries(
    Object.keys(fantasyPositionCounts).map((position) => [position, 0]),
  ) as Record<FantasyPosition, number>;
  const starterCounts = { ...squadCounts };
  const teamCounts = new Map<string, number>();
  const starterIdSet = new Set(uniqueStarterIds);
  let totalPrice = 0;

  for (const player of selectedPlayers) {
    const position = player.position as FantasyPosition;
    squadCounts[position] += 1;
    if (starterIdSet.has(player.id)) starterCounts[position] += 1;
    teamCounts.set(player.teamId, (teamCounts.get(player.teamId) ?? 0) + 1);
    totalPrice += getFantasyPrice({
      ...player,
      position,
    });
  }

  const formation =
    fantasyFormations[fantasyTeam.formation as FantasyFormation];
  if (
    Object.entries(fantasyPositionCounts).some(
      ([position, count]) => squadCounts[position as FantasyPosition] !== count,
    )
  ) {
    throw new Error("Тимот мора да има 2 голмани, 5 дефанзивци, 5 играчи од средниот ред и 4 напаѓачи.");
  }
  if (
    Object.entries(formation).some(
      ([position, count]) => starterCounts[position as FantasyPosition] !== count,
    )
  ) {
    throw new Error("Почетните 11 не одговараат на избраната формација.");
  }
  if ([...teamCounts.values()].some((count) => count > MAX_PLAYERS_PER_TEAM)) {
    throw new Error("Може да изберете најмногу 3 играчи од една репрезентација.");
  }
  if (totalPrice > FANTASY_BUDGET) {
    throw new Error("Избраниот тим го надминува буџетот од 160.0m.");
  }
  await assertFantasyTeamsEligible(
    selectedPlayers.map((player) => player.teamId),
    context,
  );

  const existing = existingRows[0];
  const periodChanged = existing?.period !== context.period;
  const baselinePlayerIds = !existing
    ? uniquePlayerIds
    : periodChanged
      ? context.freshSquad
        ? uniquePlayerIds
        : existing.playerIds
      : existing.baselinePlayerIds.length > 0
        ? existing.baselinePlayerIds
        : existing.playerIds;
  const transfersUsed = countFantasyTransfers(
    baselinePlayerIds,
    uniquePlayerIds,
  );
  if (
    context.maxTransfers != null &&
    transfersUsed > context.maxTransfers
  ) {
    throw new Error(
      `Во ${context.label} се дозволени најмногу ${context.maxTransfers} трансфери.`,
    );
  }

  await db
    .insert(fantasyTeams)
    .values({
      userId,
      name: fantasyTeam.name,
      formation: fantasyTeam.formation,
      playerIds: uniquePlayerIds,
      starterIds: uniqueStarterIds,
      captainId: fantasyTeam.captainId,
      period: context.period,
      baselinePlayerIds,
    })
    .onConflictDoUpdate({
      target: fantasyTeams.userId,
      set: {
        name: fantasyTeam.name,
        formation: fantasyTeam.formation,
        playerIds: uniquePlayerIds,
        starterIds: uniqueStarterIds,
        captainId: fantasyTeam.captainId,
        period: context.period,
        baselinePlayerIds,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/");
  return { saved: true };
}
