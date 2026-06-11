import "server-only";

import { asc, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { matches } from "@/db/schema";
import {
  fantasyPeriodLabels,
  isKnockoutFantasyPeriod,
  type FantasyPeriod,
} from "@/lib/fantasy";
import { getUpcomingMatches } from "@/lib/sports-data";
import { groups } from "@/lib/tournament";
import { knockoutMatches } from "@/lib/knockout";

const knockoutStages: Array<{
  period: FantasyPeriod;
  stage: typeof matches.stage.enumValues[number];
}> = [
  { period: "round_of_32", stage: "round_of_32" },
  { period: "round_of_16", stage: "round_of_16" },
  { period: "quarter_final", stage: "quarter_final" },
  { period: "semi_final", stage: "semi_final" },
  { period: "final", stage: "final" },
];

export type FantasyContext = {
  period: FantasyPeriod;
  label: string;
  eligibleTeamIds: string[];
  maxTransfers: number | null;
  freshSquad: boolean;
};

export async function getFantasyContext(now = new Date()): Promise<FantasyContext> {
  const db = getDb();
  const knockoutRows = await db
    .select({
      stage: matches.stage,
      kickoff: matches.kickoff,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
    })
    .from(matches)
    .where(ne(matches.stage, "group"))
    .orderBy(asc(matches.kickoff));
  const nowTime = now.getTime();
  const schedule = await getUpcomingMatches();
  const matchBuffer = 3 * 60 * 60 * 1000;
  const groupRoundEnds = ([1, 2, 3] as const).map((round) => ({
    round,
    time:
      Math.max(
        ...schedule
          .filter((match) => match.round === round)
          .map((match) => new Date(match.kickoff).getTime()),
      ) + matchBuffer,
  }));
  const groupRoundStarts = ([1, 2, 3] as const).map((round) => {
    const firstKickoff = Math.min(
      ...schedule
        .filter((match) => match.round === round)
        .map((match) => new Date(match.kickoff).getTime()),
    );
    const matchday = new Date(firstKickoff);
    matchday.setUTCHours(0, 0, 0, 0);
    return { round, time: matchday.getTime() };
  });
  const knockoutStageStarts = knockoutStages.map(({ period, stage }, index) => {
    if (index === 0) {
      return {
        period,
        stage,
        time: groupRoundEnds.find(({ round }) => round === 3)!.time,
      };
    }
    const previousStage = knockoutStages[index - 1]!.stage;
    const previousDefinitions = knockoutMatches.filter((match) => {
      const mappedStage =
        match.stage === "Round of 32" ? "round_of_32"
          : match.stage === "Round of 16" ? "round_of_16"
            : match.stage === "Quarter-finals" ? "quarter_final"
              : match.stage === "Semi-finals" ? "semi_final"
                : match.id === 104 ? "final"
                  : "third_place";
      return mappedStage === previousStage;
    });
    return {
      period,
      stage,
      time:
        Math.max(...previousDefinitions.map((match) => new Date(match.kickoff).getTime())) +
        matchBuffer,
    };
  });
  const startedKnockoutStages = knockoutStageStarts.filter(
    ({ time }) => time <= nowTime,
  );

  if (startedKnockoutStages.length > 0) {
    const current = startedKnockoutStages.at(-1)!;
    const eligibleTeamIds = [
      ...new Set(
        knockoutRows
          .filter((match) =>
            current.period === "final"
              ? match.stage === "final" || match.stage === "third_place"
              : match.stage === current.stage,
          )
          .flatMap((match) => [match.homeTeamId, match.awayTeamId])
          .filter((teamId): teamId is string => Boolean(teamId)),
      ),
    ];
    return {
      period: current.period,
      label: fantasyPeriodLabels[current.period],
      eligibleTeamIds,
      maxTransfers: null,
      freshSquad: true,
    };
  }

  const activeRound =
    groupRoundStarts.filter(({ time }) => time <= nowTime).at(-1)?.round ?? 1;
  const period = `group_${activeRound}` as FantasyPeriod;
  const firstKickoff = groupRoundStarts[0]!.time;

  return {
    period,
    label: fantasyPeriodLabels[period],
    eligibleTeamIds: groups.flatMap((group) => group.teams.map((team) => team.code)),
    maxTransfers: activeRound === 1 ? (nowTime < firstKickoff ? null : 0) : 3,
    freshSquad: activeRound === 1 && nowTime < firstKickoff,
  };
}

export async function assertFantasyTeamsEligible(
  playerTeamIds: string[],
  context: FantasyContext,
) {
  if (
    isKnockoutFantasyPeriod(context.period) &&
    context.eligibleTeamIds.length === 0
  ) {
    throw new Error("Нокаут составот ќе се отвори кога ќе бидат познати учесниците.");
  }
  const eligible = new Set(context.eligibleTeamIds);
  if (playerTeamIds.some((teamId) => !eligible.has(teamId))) {
    throw new Error("Тимот содржи играч од репрезентација што повеќе не е во турнирот.");
  }
}
