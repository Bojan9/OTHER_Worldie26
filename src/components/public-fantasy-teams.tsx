"use client";

import { useMemo, useState } from "react";
import { Crown, Eye, Users, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TeamFlag } from "@/components/team-flag";
import {
  fantasyFormations,
  isFantasyPosition,
  type FantasyFormation,
  type FantasyPosition,
} from "@/lib/fantasy";
import type {
  AwardPlayerData,
  PublicFantasyTeamData,
} from "@/lib/app-data";
import { groups } from "@/lib/tournament";

const positionOrder: FantasyPosition[] = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
];

const teamsByCode = new Map(
  groups.flatMap((group) => group.teams.map((team) => [team.code, team])),
);

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function PublicFantasyTeams({
  teams,
  players,
}: {
  teams: PublicFantasyTeamData[];
  players: AwardPlayerData[];
}) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );
  const otherTeams = teams.filter((team) => !team.current);
  const selectedTeam = teams.find((team) => team.userId === selectedUserId);
  const formation =
    selectedTeam?.formation && selectedTeam.formation in fantasyFormations
      ? selectedTeam.formation as FantasyFormation
      : "4-4-2";
  const starters = selectedTeam?.starterIds.flatMap((id) => {
    const player = playerById.get(id);
    return player && isFantasyPosition(player.position) ? [player] : [];
  }) ?? [];
  const starterSet = new Set(selectedTeam?.starterIds ?? []);
  const bench = selectedTeam?.playerIds.flatMap((id) => {
    const player = playerById.get(id);
    return player && !starterSet.has(id) ? [player] : [];
  }) ?? [];

  return (
    <>
      <Card className="border-white/10 bg-white/4.5 p-5 text-white shadow-none">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Users className="size-5 text-cyan-300" />
              <h2 className="text-xl font-black">Тимови од други играчи</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Прегледај ги зачуваните состави, формации и капитени.
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-white/10 text-slate-400">
            {otherTeams.length} тимови
          </Badge>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {otherTeams.map((team) => (
            <button
              type="button"
              key={team.userId}
              onClick={() => setSelectedUserId(team.userId)}
              className="flex items-center gap-3 bg-black/20 p-3 text-left transition hover:bg-white/[0.07]"
            >
              <Avatar className="size-10">
                {team.ownerAvatarUrl ? <AvatarImage src={team.ownerAvatarUrl} alt="" /> : null}
                <AvatarFallback className="bg-white/10 text-xs text-white">
                  {team.ownerInitials}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">{team.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {team.ownerName} · {team.formation}
                </span>
              </span>
              <Eye className="size-4 text-cyan-300" />
            </button>
          ))}
          {otherTeams.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              Сè уште нема други зачувани фантази тимови.
            </p>
          ) : null}
        </div>
      </Card>

      {selectedTeam ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Фантази тим на ${selectedTeam.ownerName}`}
          className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm sm:p-8"
        >
          <Card className="relative w-full max-w-5xl border-white/10 bg-[#07131f] p-5 text-white shadow-2xl sm:p-7">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSelectedUserId(null)}
              className="absolute right-3 top-3 text-slate-400 hover:text-white"
            >
              <X />
              <span className="sr-only">Затвори</span>
            </Button>
            <div className="flex items-center gap-3 pr-12">
              <Avatar className="size-12">
                {selectedTeam.ownerAvatarUrl ? <AvatarImage src={selectedTeam.ownerAvatarUrl} alt="" /> : null}
                <AvatarFallback className="bg-white/10 text-white">
                  {selectedTeam.ownerInitials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-2xl font-black">{selectedTeam.name}</h2>
                <p className="text-sm text-slate-400">
                  {selectedTeam.ownerName} · {selectedTeam.formation}
                </p>
              </div>
            </div>

            <div className="relative mt-6 min-h-150 overflow-hidden bg-[#0a513d] px-3 py-7 sm:px-8">
              <div className="pointer-events-none absolute inset-4 border-2 border-white/20" />
              <div className="relative flex min-h-136 flex-col justify-between">
                {positionOrder.map((position) => {
                  const row = starters.filter((player) => player.position === position);
                  return (
                    <div key={position} className="flex min-h-26 items-center justify-center gap-2 sm:gap-5">
                      {row.map((player) => {
                        const team = teamsByCode.get(player.teamId);
                        const captain = selectedTeam.captainId === player.id;
                        return (
                          <div key={player.id} className="flex w-24 flex-col items-center text-center sm:w-28">
                            <Avatar className="size-12 bg-white/10 sm:size-14">
                              {player.imageUrl ? (
                                <AvatarImage src={player.imageUrl} alt="" className="object-cover object-top" />
                              ) : null}
                              <AvatarFallback className="bg-white/10 text-xs text-white">
                                {initials(player.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="-mt-1 w-full bg-[#07131f]/95 px-2 py-1.5">
                              <div className="flex items-center justify-center gap-1">
                                {team ? <TeamFlag team={team} size={14} /> : null}
                                <p className="truncate text-[10px] font-black">{player.name}</p>
                              </div>
                              {captain ? (
                                <p className="mt-1 flex items-center justify-center gap-1 text-[9px] font-black uppercase text-amber-300">
                                  <Crown className="size-3" /> Капитен
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                      {Array.from({
                        length: Math.max(0, fantasyFormations[formation][position] - row.length),
                      }).map((_, index) => (
                        <div
                          key={index}
                          className="size-20 rounded-full border border-dashed border-white/25 sm:size-24"
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              {bench.map((player) => {
                const team = teamsByCode.get(player.teamId);
                return (
                  <div key={player.id} className="flex items-center gap-2 bg-white/5 p-2">
                    <Avatar className="size-8">
                      {player.imageUrl ? <AvatarImage src={player.imageUrl} alt="" /> : null}
                      <AvatarFallback className="bg-white/10 text-[10px] text-white">
                        {initials(player.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1">
                        {team ? <TeamFlag team={team} size={13} /> : null}
                        <span className="truncate text-[11px] font-bold">{player.name}</span>
                      </span>
                      <span className="block text-[9px] text-slate-500">{player.position}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
