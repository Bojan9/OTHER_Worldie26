"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import {
  awardPredictions,
  matchPredictions,
  matches,
  officialAwards,
  officialGroupStandings,
  players,
  tournamentPredictions,
} from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import {
  actualRoundOf32Participants,
  assignThirdPlaceGroups,
  getDescendantMatchIds,
  knockoutMatches,
} from "@/lib/knockout";
import {
  scoreAwardPrediction,
  scoreMatchPrediction,
  scoreTournamentPrediction,
} from "@/lib/scoring";
import { groups, officialGroupRankingOverrides } from "@/lib/tournament";

const matchResultSchema = z.object({
  matchId: z.coerce.number().int().positive(),
  homeTeamId: z.string().nullable(),
  awayTeamId: z.string().nullable(),
  homeScore: z.coerce.number().int().min(0).max(30),
  awayScore: z.coerce.number().int().min(0).max(30),
  winnerTeamId: z.string().nullable(),
});

const standingsSchema = z.object({
  group: z.string().length(1),
  rankings: z.array(z.string()).length(4),
});

const awardsSchema = z.object({
  goldenBootPlayerId: z.string().min(1),
  goldenGlovePlayerId: z.string().min(1),
  goldenBallPlayerId: z.string().min(1),
  youngPlayerId: z.string().min(1),
});

async function recalculateMatchPoints(matchId: number) {
  const db = getDb();
  const [match] = await db
    .select({
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      complete: matches.complete,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) return;

  const predictions = await db
    .select()
    .from(matchPredictions)
    .where(eq(matchPredictions.matchId, matchId));
  await Promise.all(
    predictions.map((prediction) =>
      db
        .update(matchPredictions)
        .set({
          points:
            match.complete && match.homeScore != null && match.awayScore != null
              ? scoreMatchPrediction(
                  { home: prediction.homeScore, away: prediction.awayScore },
                  { home: match.homeScore, away: match.awayScore },
                )
              : 0,
        })
        .where(
          and(
            eq(matchPredictions.userId, prediction.userId),
            eq(matchPredictions.matchId, matchId),
          ),
        ),
    ),
  );
}

async function recalculateTournamentPoints() {
  const db = getDb();
  const [standingRows, completedGroupMatches, [finalMatch], predictions] = await Promise.all([
    db.select().from(officialGroupStandings),
    db
      .select({ group: matches.group })
      .from(matches)
      .where(and(eq(matches.stage, "group"), eq(matches.complete, true))),
    db
      .select({ winnerTeamId: matches.winnerTeamId })
      .from(matches)
      .where(eq(matches.id, 104))
      .limit(1),
    db.select().from(tournamentPredictions),
  ]);
  const completedByGroup = new Map<string, number>();
  for (const match of completedGroupMatches) {
    if (match.group) completedByGroup.set(match.group, (completedByGroup.get(match.group) ?? 0) + 1);
  }
  const actualGroups = Object.fromEntries(
    standingRows
      .filter((standing) => (completedByGroup.get(standing.group) ?? 0) >= 6)
      .map((standing) => [standing.group, standing.rankings]),
  );

  await Promise.all(
    predictions.map((prediction) =>
      db
        .update(tournamentPredictions)
        .set({
          points: scoreTournamentPrediction(
            prediction.groupRankings,
            actualGroups,
            prediction.bracket["104"],
            finalMatch?.winnerTeamId ?? undefined,
          ).total,
        })
        .where(eq(tournamentPredictions.userId, prediction.userId)),
    ),
  );
}

async function recalculateAwardPoints() {
  const db = getDb();
  const [[result], predictions] = await Promise.all([
    db.select().from(officialAwards).where(eq(officialAwards.id, 1)).limit(1),
    db.select().from(awardPredictions),
  ]);

  await Promise.all(
    predictions.map((prediction) =>
      db
        .update(awardPredictions)
        .set({
          points: result
            ? scoreAwardPrediction(prediction, result).total
            : 0,
        })
        .where(eq(awardPredictions.userId, prediction.userId)),
    ),
  );
}

async function calculateGroupTable(groupId: string) {
  const db = getDb();
  const group = groups.find((item) => item.id === groupId);
  if (!group) return null;

  const groupMatches = await db
    .select()
    .from(matches)
    .where(and(eq(matches.stage, "group"), eq(matches.group, groupId)));
  const stats = new Map(
    group.teams.map((team) => [
      team.code,
      { teamId: team.code, points: 0, goalDifference: 0, goalsFor: 0, wins: 0 },
    ]),
  );

  for (const match of groupMatches) {
    if (
      !match.complete ||
      !match.homeTeamId ||
      !match.awayTeamId ||
      match.homeScore == null ||
      match.awayScore == null
    ) {
      continue;
    }
    const home = stats.get(match.homeTeamId);
    const away = stats.get(match.awayTeamId);
    if (!home || !away) continue;

    home.goalsFor += match.homeScore;
    away.goalsFor += match.awayScore;
    home.goalDifference += match.homeScore - match.awayScore;
    away.goalDifference += match.awayScore - match.homeScore;
    if (match.homeScore > match.awayScore) {
      home.points += 3;
      home.wins += 1;
    } else if (match.awayScore > match.homeScore) {
      away.points += 3;
      away.wins += 1;
    } else {
      home.points += 1;
      away.points += 1;
    }
  }

  const sorted = [...stats.values()].sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        b.wins - a.wins ||
        a.teamId.localeCompare(b.teamId),
    );

  return {
    groupId,
    completeMatches: groupMatches.filter((match) => match.complete).length,
    rankings: sorted.map((team) => team.teamId),
    stats: sorted,
  };
}

async function updateRoundOf32Participants() {
  const db = getDb();
  const [calculatedTables, officialRows] = await Promise.all([
    Promise.all(groups.map((group) => calculateGroupTable(group.id))),
    db.select().from(officialGroupStandings),
  ]);
  const tables = calculatedTables.filter(
    (table): table is NonNullable<typeof table> => Boolean(table),
  );
  const officialByGroup = new Map(
    officialRows.map((standing) => [standing.group, standing.rankings]),
  );
  const completedGroups = new Map(
    tables
      .filter((table) => table.completeMatches >= 6)
      .map((table) => [
        table.groupId,
        {
          ...table,
          rankings: officialByGroup.get(table.groupId) ?? table.rankings,
        },
      ]),
  );

  const thirdPlaceAssignments =
    completedGroups.size === 12
      ? assignThirdPlaceGroups(
          [...completedGroups.entries()]
            .sort(
              ([groupA, a], [groupB, b]) =>
                (b.stats.find((team) => team.teamId === b.rankings[2])?.points ?? 0) -
                  (a.stats.find((team) => team.teamId === a.rankings[2])?.points ?? 0) ||
                (b.stats.find((team) => team.teamId === b.rankings[2])?.goalDifference ?? 0) -
                  (a.stats.find((team) => team.teamId === a.rankings[2])?.goalDifference ?? 0) ||
                (b.stats.find((team) => team.teamId === b.rankings[2])?.goalsFor ?? 0) -
                  (a.stats.find((team) => team.teamId === a.rankings[2])?.goalsFor ?? 0) ||
                (b.stats.find((team) => team.teamId === b.rankings[2])?.wins ?? 0) -
                  (a.stats.find((team) => team.teamId === a.rankings[2])?.wins ?? 0) ||
                groupA.localeCompare(groupB),
            )
            .slice(0, 8)
            .map(([group]) => group),
        )
      : {};

  for (const definition of knockoutMatches.filter((match) => match.stage === "Round of 32")) {
    const actual = actualRoundOf32Participants[definition.id];
    if (actual) {
      const [stored] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, definition.id))
        .limit(1);
      const participantChanged =
        stored?.homeTeamId !== actual.home ||
        stored?.awayTeamId !== actual.away;
      if (participantChanged) await clearDependentKnockoutResults(definition.id);
      await db
        .update(matches)
        .set({
          homeTeamId: actual.home,
          awayTeamId: actual.away,
          ...(participantChanged
            ? { homeScore: null, awayScore: null, winnerTeamId: null, complete: false }
            : {}),
        })
        .where(eq(matches.id, definition.id));
      continue;
    }

    const resolve = (reference: string) => {
      const direct = reference.match(/^([12])([A-L])$/);
      if (direct) {
        const table = completedGroups.get(direct[2]);
        return table?.rankings[Number(direct[1]) - 1];
      }
      if (reference.startsWith("3:")) {
        const groupId = thirdPlaceAssignments[definition.id];
        return groupId ? completedGroups.get(groupId)?.rankings[2] : undefined;
      }
      return undefined;
    };
    const homeTeamId = resolve(definition.home);
    const awayTeamId = resolve(definition.away);
    if (!homeTeamId && !awayTeamId) continue;

    const [stored] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, definition.id))
      .limit(1);
    const participantChanged =
      (homeTeamId && stored?.homeTeamId !== homeTeamId) ||
      (awayTeamId && stored?.awayTeamId !== awayTeamId);
    if (participantChanged) await clearDependentKnockoutResults(definition.id);
    await db
      .update(matches)
      .set({
        ...(homeTeamId ? { homeTeamId } : {}),
        ...(awayTeamId ? { awayTeamId } : {}),
        ...(participantChanged
          ? { homeScore: null, awayScore: null, winnerTeamId: null, complete: false }
          : {}),
      })
      .where(eq(matches.id, definition.id));
  }
}

async function updateGroupTable(groupId: string) {
  const db = getDb();
  const table = await calculateGroupTable(groupId);
  if (!table) return;
  const rankings = officialGroupRankingOverrides[groupId] ?? table.rankings;
  await db
    .insert(officialGroupStandings)
    .values({ group: groupId, rankings })
    .onConflictDoUpdate({
      target: officialGroupStandings.group,
      set: { rankings, updatedAt: new Date() },
    });
  await updateRoundOf32Participants();
}

async function clearDependentKnockoutResults(matchId: number) {
  const descendantIds = [...getDescendantMatchIds(matchId)];
  if (descendantIds.length === 0) return;
  const db = getDb();
  await db
    .update(matches)
    .set({
      homeScore: null,
      awayScore: null,
      winnerTeamId: null,
      complete: false,
    })
    .where(inArray(matches.id, descendantIds));
  await db
    .update(matchPredictions)
    .set({ points: 0 })
    .where(inArray(matchPredictions.matchId, descendantIds));
}

async function propagateKnockoutResult(
  matchId: number,
  winnerTeamId: string,
  loserTeamId: string,
) {
  const db = getDb();
  const dependentMatches = knockoutMatches.filter((match) =>
    [match.home, match.away].some(
      (reference) => reference === `W${matchId}` || reference === `L${matchId}`,
    ),
  );

  for (const dependent of dependentMatches) {
    const homeTeamId =
      dependent.home === `W${matchId}`
        ? winnerTeamId
        : dependent.home === `L${matchId}`
          ? loserTeamId
          : undefined;
    const awayTeamId =
      dependent.away === `W${matchId}`
        ? winnerTeamId
        : dependent.away === `L${matchId}`
          ? loserTeamId
          : undefined;
    const [stored] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, dependent.id))
      .limit(1);
    const participantChanged =
      (homeTeamId && stored?.homeTeamId !== homeTeamId) ||
      (awayTeamId && stored?.awayTeamId !== awayTeamId);

    if (participantChanged) {
      await clearDependentKnockoutResults(dependent.id);
    }
    await db
      .update(matches)
      .set({
        ...(homeTeamId ? { homeTeamId } : {}),
        ...(awayTeamId ? { awayTeamId } : {}),
        ...(participantChanged
          ? { homeScore: null, awayScore: null, winnerTeamId: null, complete: false }
          : {}),
      })
      .where(eq(matches.id, dependent.id));
  }
}

export async function updateMatchResult(formData: FormData) {
  await requireAdmin();
  const nullable = (value: FormDataEntryValue | null) => {
    const text = String(value ?? "").trim();
    return text || null;
  };
  const result = matchResultSchema.parse({
    matchId: formData.get("matchId"),
    homeTeamId: nullable(formData.get("homeTeamId")),
    awayTeamId: nullable(formData.get("awayTeamId")),
    homeScore: formData.get("homeScore"),
    awayScore: formData.get("awayScore"),
    winnerTeamId: nullable(formData.get("winnerTeamId")),
  });

  const db = getDb();
  const [storedMatch] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, result.matchId))
    .limit(1);
  if (!storedMatch) throw new Error("Натпреварот не е пронајден.");
  if (new Date() < storedMatch.kickoff) {
    throw new Error("Резултатите не може да се внесат пред почетокот.");
  }

  const winnerTeamId =
    result.winnerTeamId ??
    (result.homeScore > result.awayScore
      ? result.homeTeamId
      : result.awayScore > result.homeScore
        ? result.awayTeamId
        : null);
  if (
    storedMatch.stage !== "group" &&
    result.homeScore === result.awayScore &&
    !winnerTeamId
  ) {
    throw new Error("Изберете ја репрезентацијата што продолжила по нерешен резултат во нокаут-фазата.");
  }
  if (
    winnerTeamId &&
    winnerTeamId !== result.homeTeamId &&
    winnerTeamId !== result.awayTeamId
  ) {
    throw new Error("Победникот мора да биде една од репрезентациите во натпреварот.");
  }

  await db
    .update(matches)
    .set({
      homeTeamId: result.homeTeamId,
      awayTeamId: result.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      winnerTeamId,
      complete: true,
    })
    .where(eq(matches.id, result.matchId));

  await recalculateMatchPoints(result.matchId);
  if (storedMatch.stage === "group" && storedMatch.group) {
    await updateGroupTable(storedMatch.group);
  } else if (winnerTeamId && result.homeTeamId && result.awayTeamId) {
    await propagateKnockoutResult(
      result.matchId,
      winnerTeamId,
      winnerTeamId === result.homeTeamId ? result.awayTeamId : result.homeTeamId,
    );
  }
  await recalculateTournamentPoints();
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function updateGroupStandings(formData: FormData) {
  await requireAdmin();
  const result = standingsSchema.parse({
    group: formData.get("group"),
    rankings: [1, 2, 3, 4].map((position) => String(formData.get(`position${position}`))),
  });
  const validTeams = new Set(
    groups.find((group) => group.id === result.group)?.teams.map((team) => team.code) ?? [],
  );
  if (
    new Set(result.rankings).size !== 4 ||
    result.rankings.some((team) => !validTeams.has(team))
  ) {
    throw new Error("Табелата мора да ја содржи секоја репрезентација од групата точно еднаш.");
  }

  const db = getDb();
  await db
    .insert(officialGroupStandings)
    .values({ group: result.group, rankings: result.rankings })
    .onConflictDoUpdate({
      target: officialGroupStandings.group,
      set: { rankings: result.rankings, updatedAt: new Date() },
    });
  await updateRoundOf32Participants();
  await recalculateTournamentPoints();
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function updateOfficialAwards(formData: FormData) {
  await requireAdmin();
  const result = awardsSchema.parse({
    goldenBootPlayerId: formData.get("goldenBootPlayerId"),
    goldenGlovePlayerId: formData.get("goldenGlovePlayerId"),
    goldenBallPlayerId: formData.get("goldenBallPlayerId"),
    youngPlayerId: formData.get("youngPlayerId"),
  });
  const db = getDb();
  const selectedIds = [...new Set(Object.values(result))];
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
    throw new Error("Еден или повеќе избрани играчи не постојат.");
  }
  if (playerById.get(result.goldenGlovePlayerId)?.position !== "Goalkeeper") {
    throw new Error("Добитникот на Златна ракавица мора да биде голман.");
  }
  const youngPlayer = playerById.get(result.youngPlayerId);
  if (
    !youngPlayer?.dateOfBirth ||
    youngPlayer.dateOfBirth <= new Date("2005-06-11T00:00:00Z")
  ) {
    throw new Error("Добитникот за млад играч мора да биде под 21 година.");
  }

  await db
    .insert(officialAwards)
    .values({ id: 1, ...result })
    .onConflictDoUpdate({
      target: officialAwards.id,
      set: { ...result, updatedAt: new Date() },
    });
  await recalculateAwardPoints();
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function recalculateAllPoints() {
  await requireAdmin();
  const db = getDb();
  const completed = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.complete, true));
  await Promise.all(completed.map((match) => recalculateMatchPoints(match.id)));
  await recalculateTournamentPoints();
  await recalculateAwardPoints();
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function resetCompetition(formData: FormData) {
  await requireAdmin();
  if (formData.get("confirmation") !== "RESET") {
    throw new Error('Напишете „RESET“ за потврда.');
  }

  const db = getDb();
  await db.delete(matchPredictions);
  await db.delete(awardPredictions);
  await db.delete(tournamentPredictions);
  await db.delete(officialAwards);
  await db.delete(officialGroupStandings);
  await db
    .update(matches)
    .set({
      homeScore: null,
      awayScore: null,
      winnerTeamId: null,
      complete: false,
    });
  await db
    .update(matches)
    .set({ homeTeamId: null, awayTeamId: null })
    .where(inArray(matches.id, knockoutMatches.map((match) => match.id)));

  revalidatePath("/");
  revalidatePath("/admin");
}
