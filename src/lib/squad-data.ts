import "server-only";

import { asc, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { players } from "@/db/schema";
import { groups } from "@/lib/tournament";

const ESPN_TEAMS_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams";

const teamSchema = z.object({
  team: z.object({
    id: z.string(),
    abbreviation: z.string(),
  }),
});

const teamsResponseSchema = z.object({
  sports: z.array(z.object({
    leagues: z.array(z.object({
      teams: z.array(teamSchema),
    })),
  })),
});

const athleteSchema = z.object({
  id: z.string(),
  fullName: z.string().optional(),
  displayName: z.string().optional(),
  shortName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().nullable().optional(),
  jersey: z.string().nullable().optional(),
  headshot: z.object({ href: z.string() }).nullable().optional(),
  position: z.object({
    displayName: z.string(),
  }),
});

const rosterSchema = z.object({
  athletes: z.array(athleteSchema),
});

const sportsDbPlayerSchema = z.object({
  strPlayer: z.string(),
  strSport: z.string().nullable().optional(),
  strThumb: z.string().nullable().optional(),
  strCutout: z.string().nullable().optional(),
});

const sportsDbSearchSchema = z.object({
  player: z.array(sportsDbPlayerSchema).nullable(),
});

const wikipediaSummarySchema = z.object({
  description: z.string().optional(),
  thumbnail: z.object({ source: z.string() }).optional(),
  originalimage: z.object({ source: z.string() }).optional(),
});

function normalizedName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

async function getWikipediaFootballerImage(name: string) {
  for (const title of [name, `${name} (footballer)`]) {
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
      {
        headers: { "User-Agent": "Worldie26/1.0" },
        next: { revalidate: 2_592_000 },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) continue;
    const summary = wikipediaSummarySchema.parse(await response.json());
    if (!/footballer|soccer player/i.test(summary.description ?? "")) continue;
    const imageUrl =
      summary.thumbnail?.source ??
      summary.originalimage?.source ??
      null;
    if (imageUrl) return imageUrl;
  }
  return null;
}

async function enrichMissingPlayerImages() {
  const db = getDb();
  const missingPlayers = await db
    .select({
      id: players.id,
      name: players.name,
    })
    .from(players)
    .where(isNull(players.imageUrl))
    .orderBy(asc(players.updatedAt), asc(players.id))
    .limit(40);

  await Promise.all(
    missingPlayers.map(async (player) => {
      let imageUrl: string | null = null;
      try {
        const response = await fetch(
          `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(player.name)}`,
          {
            next: { revalidate: 604_800 },
            signal: AbortSignal.timeout(8_000),
          },
        );
        if (response.ok) {
          const result = sportsDbSearchSchema.parse(await response.json());
          const exactMatch = result.player?.find(
            (candidate) =>
              candidate.strSport === "Soccer" &&
              normalizedName(candidate.strPlayer) === normalizedName(player.name),
          );
          imageUrl = exactMatch?.strCutout ?? exactMatch?.strThumb ?? null;
        }
        if (!imageUrl) {
          imageUrl = await getWikipediaFootballerImage(player.name);
        }
      } catch {
        // The next batch can retry this player after other missing rows are checked.
      }

      await db
        .update(players)
        .set({
          ...(imageUrl ? { imageUrl } : {}),
          updatedAt: new Date(),
        })
        .where(eq(players.id, player.id));
    }),
  );
}

export async function syncWorldCupPlayers() {
  if (!process.env.DATABASE_URL) return;

  const db = getDb();
  const [stored] = await db.select({ value: count() }).from(players);
  if ((stored?.value ?? 0) >= 1_200) {
    await enrichMissingPlayerImages();
    return;
  }

  const teamsResponse = await fetch(ESPN_TEAMS_URL, {
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!teamsResponse.ok) return;

  const parsedTeams = teamsResponseSchema.parse(await teamsResponse.json());
  const localCodes = new Set(
    groups.flatMap((group) => group.teams.map((team) => team.code)),
  );
  const espnTeams = parsedTeams.sports[0]?.leagues[0]?.teams
    .filter(({ team }) => localCodes.has(team.abbreviation)) ?? [];

  const rosters = await Promise.all(
    espnTeams.map(async ({ team }) => {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/${team.id}/roster`,
        {
          next: { revalidate: 86_400 },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) return [];
      const roster = rosterSchema.parse(await response.json());
      return roster.athletes.flatMap((athlete) => {
        const name =
          athlete.fullName ??
          athlete.displayName ??
          athlete.shortName ??
          [athlete.firstName, athlete.lastName].filter(Boolean).join(" ");
        if (!name) return [];
        return [{
          id: athlete.id,
          teamId: team.abbreviation,
          name,
          position: athlete.position.displayName,
          dateOfBirth: athlete.dateOfBirth ? new Date(athlete.dateOfBirth) : null,
          jerseyNumber: athlete.jersey ? Number(athlete.jersey) : null,
          imageUrl: athlete.headshot?.href ?? null,
          updatedAt: new Date(),
        }];
      });
    }),
  );

  const rows = rosters.flat();
  if (rows.length === 0) return;

  await db
    .insert(players)
    .values(rows)
    .onConflictDoUpdate({
      target: players.id,
      set: {
        teamId: sql`excluded.team_id`,
        name: sql`excluded.name`,
        position: sql`excluded.position`,
        dateOfBirth: sql`excluded.date_of_birth`,
        jerseyNumber: sql`excluded.jersey_number`,
        imageUrl: sql`excluded.image_url`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  await enrichMissingPlayerImages();
}
