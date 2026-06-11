"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleDollarSign,
  Crown,
  Save,
  Search,
  Shield,
  Shirt,
  Users,
  X,
} from "lucide-react";
import { saveFantasyTeam } from "@/app/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { TeamFlag } from "@/components/team-flag";
import { PublicFantasyTeams } from "@/components/public-fantasy-teams";
import {
  FANTASY_BUDGET,
  MAX_PLAYERS_PER_TEAM,
  fantasyFormations,
  fantasyPositionCounts,
  countFantasyTransfers,
  formatFantasyPrice,
  getFantasyPrice,
  isFantasyPosition,
  type FantasyFormation,
  type FantasyPosition,
} from "@/lib/fantasy";
import type {
  AwardPlayerData,
  FantasyContextData,
  PublicFantasyTeamData,
  FantasyTeamData,
} from "@/lib/app-data";
import { groups } from "@/lib/tournament";
import { cn } from "@/lib/utils";

type FantasyPlayer = AwardPlayerData & {
  position: FantasyPosition;
  price: number;
};

const positionLabels: Record<FantasyPosition, string> = {
  Goalkeeper: "Голмани",
  Defender: "Дефанзивци",
  Midfielder: "Среден ред",
  Forward: "Напаѓачи",
};

const positionShortLabels: Record<FantasyPosition, string> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Forward: "FWD",
};

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

function normalizeStarters(
  squad: FantasyPlayer[],
  currentStarterIds: string[],
  formation: FantasyFormation,
) {
  const currentSet = new Set(currentStarterIds);
  return positionOrder.flatMap((position) => {
    const needed = fantasyFormations[formation][position];
    const players = squad.filter((player) => player.position === position);
    const current = players.filter((player) => currentSet.has(player.id));
    const replacements = players.filter((player) => !currentSet.has(player.id));
    return [...current, ...replacements].slice(0, needed).map((player) => player.id);
  });
}

function PlayerPortrait({
  player,
  size = "large",
}: {
  player: FantasyPlayer;
  size?: "small" | "large";
}) {
  return (
    <Avatar className={cn(size === "large" ? "size-14" : "size-10", "bg-white/10")}>
      {player.imageUrl ? (
        <AvatarImage
          src={player.imageUrl}
          alt={`Фотографија од ${player.name}`}
          className="object-cover object-top"
        />
      ) : null}
      <AvatarFallback className="bg-white/10 text-xs font-black text-white">
        {initials(player.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function PitchPlayer({
  player,
  captain,
  canAcceptDrop,
  onCaptain,
  onDropBench,
  onRemove,
}: {
  player: FantasyPlayer;
  captain: boolean;
  canAcceptDrop: boolean;
  onCaptain: (playerId: string) => void;
  onDropBench: (playerId: string) => void;
  onRemove: (playerId: string) => void;
}) {
  return (
    <div
      onDragOver={(event) => {
        if (canAcceptDrop) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        if (!canAcceptDrop) return;
        event.preventDefault();
        event.stopPropagation();
        onDropBench(player.id);
      }}
      className={cn(
        "group relative flex w-24 flex-col items-center border border-transparent text-center transition sm:w-28",
        canAcceptDrop && "hover:border-lime-300/70 hover:bg-lime-300/10",
      )}
    >
      <button
        type="button"
        onClick={() => onRemove(player.id)}
        className="absolute -right-1 -top-1 z-10 grid size-6 place-items-center rounded-full bg-slate-950/90 text-slate-300 opacity-0 transition group-hover:opacity-100 focus:opacity-100"
        aria-label={`Отстрани го ${player.name}`}
      >
        <X className="size-3.5" />
      </button>
      <div className="rounded-full border-2 border-white/20 bg-[#0b1a28] p-1 shadow-lg">
        <PlayerPortrait player={player} />
      </div>
      <div className="-mt-1 w-full bg-[#07131f]/95 px-2 py-1.5 shadow-lg">
        <div className="flex items-center justify-center gap-1">
          {teamsByCode.get(player.teamId) ? (
            <TeamFlag team={teamsByCode.get(player.teamId)!} size={15} />
          ) : null}
          <p className="truncate text-[11px] font-black text-white">{player.name}</p>
        </div>
        <button
          type="button"
          onClick={() => onCaptain(player.id)}
          className={cn(
            "mx-auto mt-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-wide",
            captain ? "text-amber-300" : "text-slate-500 hover:text-amber-200",
          )}
        >
          <Crown className="size-3" />
          {captain ? "Капитен" : formatFantasyPrice(player.price)}
        </button>
      </div>
    </div>
  );
}

export function FantasyTeamGame({
  players,
  savedTeam,
  context,
  publicTeams,
}: {
  players: AwardPlayerData[];
  savedTeam: FantasyTeamData | null;
  context: FantasyContextData;
  publicTeams: PublicFantasyTeamData[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fantasyPlayers = useMemo(
    () =>
      players.flatMap((player) => {
        if (!isFantasyPosition(player.position)) return [];
        return [{
          ...player,
          position: player.position,
          price: getFantasyPrice({
            id: player.id,
            teamId: player.teamId,
            position: player.position,
            jerseyNumber: player.jerseyNumber,
          }),
        }];
      }),
    [players],
  );
  const playerById = useMemo(
    () => new Map(fantasyPlayers.map((player) => [player.id, player])),
    [fantasyPlayers],
  );
  const savedFormation =
    savedTeam?.formation && savedTeam.formation in fantasyFormations
      ? savedTeam.formation as FantasyFormation
      : "4-4-2";
  const continuingSquad =
    savedTeam &&
    (savedTeam.period === context.period || !context.freshSquad);
  const initialSquadIds = continuingSquad ? savedTeam.playerIds : [];
  const initialStarterIds = continuingSquad ? savedTeam.starterIds : [];
  const transferBaselineIds =
    savedTeam?.period === context.period
      ? savedTeam.baselinePlayerIds
      : context.freshSquad
        ? []
        : savedTeam?.playerIds ?? [];
  const [name, setName] = useState(savedTeam?.name ?? "Мојот Worldie тим");
  const [formation, setFormation] = useState<FantasyFormation>(savedFormation);
  const [squadIds, setSquadIds] = useState<string[]>(initialSquadIds);
  const [starterIds, setStarterIds] = useState<string[]>(initialStarterIds);
  const [captainId, setCaptainId] = useState(
    continuingSquad && savedTeam.captainId && initialStarterIds.includes(savedTeam.captainId)
      ? savedTeam.captainId
      : "",
  );
  const [positionFilter, setPositionFilter] = useState<FantasyPosition | "ALL">("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [draggedBenchId, setDraggedBenchId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<FantasyPosition | null>(null);

  const squad = squadIds.flatMap((id) => {
    const player = playerById.get(id);
    return player ? [player] : [];
  });
  const starters = starterIds.flatMap((id) => {
    const player = playerById.get(id);
    return player ? [player] : [];
  });
  const starterSet = new Set(starterIds);
  const bench = squad.filter((player) => !starterSet.has(player.id));
  const spent = squad.reduce((total, player) => total + player.price, 0);
  const remaining = FANTASY_BUDGET - spent;
  const squadCounts = Object.fromEntries(
    positionOrder.map((position) => [
      position,
      squad.filter((player) => player.position === position).length,
    ]),
  ) as Record<FantasyPosition, number>;
  const teamCounts = new Map<string, number>();
  squad.forEach((player) => {
    teamCounts.set(player.teamId, (teamCounts.get(player.teamId) ?? 0) + 1);
  });

  const marketPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("mk");
    return fantasyPlayers
      .filter((player) => {
        if (!context.eligibleTeamIds.includes(player.teamId)) return false;
        if (positionFilter !== "ALL" && player.position !== positionFilter) return false;
        if (teamFilter !== "ALL" && player.teamId !== teamFilter) return false;
        return (
          !normalizedQuery ||
          player.name.toLocaleLowerCase("mk").includes(normalizedQuery) ||
          player.teamName.toLocaleLowerCase("mk").includes(normalizedQuery)
        );
      })
      .sort((left, right) => right.price - left.price || left.name.localeCompare(right.name, "mk"))
      .slice(0, 100);
  }, [context.eligibleTeamIds, fantasyPlayers, positionFilter, query, teamFilter]);

  const transfersUsed =
    transferBaselineIds.length > 0
      ? countFantasyTransfers(transferBaselineIds, squadIds)
      : 0;
  const transfersRemaining =
    context.maxTransfers == null
      ? null
      : Math.max(0, context.maxTransfers - transfersUsed);

  const complete =
    squad.length === 16 &&
    starters.length === 11 &&
    remaining >= 0 &&
    starterIds.includes(captainId) &&
    (context.maxTransfers == null || transfersUsed <= context.maxTransfers) &&
    positionOrder.every(
      (position) => squadCounts[position] === fantasyPositionCounts[position],
    );

  const changeFormation = (nextFormation: FantasyFormation) => {
    const nextStarters = normalizeStarters(squad, starterIds, nextFormation);
    setFormation(nextFormation);
    setStarterIds(nextStarters);
    if (!nextStarters.includes(captainId)) setCaptainId("");
    setMessage(null);
  };

  const addPlayer = (player: FantasyPlayer) => {
    if (squadIds.includes(player.id)) return;
    if (squad.length >= 16) {
      setMessage("Тимот веќе има 16 играчи.");
      return;
    }
    if (squadCounts[player.position] >= fantasyPositionCounts[player.position]) {
      setMessage(`Веќе го имате максималниот број за позицијата ${positionLabels[player.position].toLowerCase()}.`);
      return;
    }
    if ((teamCounts.get(player.teamId) ?? 0) >= MAX_PLAYERS_PER_TEAM) {
      setMessage("Може да изберете најмногу 3 играчи од една репрезентација.");
      return;
    }
    if (player.price > remaining) {
      setMessage("Немате доволно преостанат буџет за овој играч.");
      return;
    }

    const nextSquad = [...squad, player];
    setSquadIds((current) => [...current, player.id]);
    setStarterIds((current) => normalizeStarters(nextSquad, current, formation));
    setMessage(null);
  };

  const removePlayer = (playerId: string) => {
    const nextSquad = squad.filter((player) => player.id !== playerId);
    setSquadIds(nextSquad.map((player) => player.id));
    setStarterIds((current) =>
      normalizeStarters(
        nextSquad,
        current.filter((id) => id !== playerId),
        formation,
      ),
    );
    if (captainId === playerId) setCaptainId("");
    setMessage(null);
  };

  const promoteToStarter = (player: FantasyPlayer) => {
    const currentStarter = starters
      .filter((starter) => starter.position === player.position)
      .at(-1);
    if (!currentStarter) return;
    setStarterIds((current) => [
      ...current.filter((id) => id !== currentStarter.id),
      player.id,
    ]);
    if (captainId === currentStarter.id) setCaptainId("");
  };

  const dropBenchPlayer = (
    position: FantasyPosition,
    replacedStarterId?: string,
  ) => {
    const player = draggedBenchId ? playerById.get(draggedBenchId) : null;
    setDraggedBenchId(null);
    setDropPosition(null);
    if (!player || player.position !== position || starterSet.has(player.id)) {
      setMessage("Резервниот играч може да се постави само на неговата позиција.");
      return;
    }
    if (replacedStarterId) {
      setStarterIds((current) => [
        ...current.filter((id) => id !== replacedStarterId),
        player.id,
      ]);
      if (captainId === replacedStarterId) setCaptainId("");
    } else {
      promoteToStarter(player);
    }
    setMessage(null);
  };

  const save = () => {
    if (!complete || pending || name.trim().length < 2) return;
    setMessage(null);
    startTransition(async () => {
      try {
        await saveFantasyTeam({
          name,
          formation,
          playerIds: squadIds,
          starterIds,
          captainId,
        });
        setMessage("Фантази тимот е зачуван.");
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Фантази тимот не можеше да се зачува.",
        );
      }
    });
  };

  if (fantasyPlayers.length === 0) {
    return (
      <Card className="border-white/10 bg-white/4.5 p-10 text-center text-white">
        <Users className="mx-auto size-9 text-cyan-300" />
        <h1 className="mt-4 text-2xl font-black">Составите сè уште не се достапни</h1>
        <p className="mt-2 text-sm text-slate-400">
          Играчите и нивните фотографии автоматски ќе се појават по следната синхронизација.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <Badge className="bg-lime-300/10 text-lime-300">
            <Shirt className="size-3" /> Фантази тим
          </Badge>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white">
            Состави го твојот тим од 16 играчи
          </h1>
          <p className="mt-2 max-w-3xl text-slate-400">
            Избери 2 голмани, 5 дефанзивци, 5 играчи од средниот ред и 4 напаѓачи.
            Постави стартни 11, остани во буџетот од 160.0m и комбинирај најмногу тројца од една репрезентација.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          <div className="bg-cyan-300/10 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Период</p>
            <p className="mt-1 text-xs font-black text-cyan-300">{context.label}</p>
          </div>
          <div className="bg-white/5 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Играчи</p>
            <p className="mt-1 font-mono text-xl font-black text-white">{squad.length}/16</p>
          </div>
          <div className="bg-white/5 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Стартери</p>
            <p className="mt-1 font-mono text-xl font-black text-white">{starters.length}/11</p>
          </div>
          <div className="bg-lime-300/10 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Останато</p>
            <p className={cn("mt-1 font-mono text-xl font-black", remaining < 0 ? "text-red-300" : "text-lime-300")}>
              {formatFantasyPrice(remaining)}
            </p>
          </div>
          <div className="bg-white/5 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Трансфери</p>
            <p className={cn("mt-1 font-mono text-xl font-black", context.maxTransfers != null && transfersUsed > context.maxTransfers ? "text-red-300" : "text-white")}>
              {transfersRemaining == null ? "∞" : transfersRemaining}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.3fr)_minmax(390px,.7fr)]">
        <div className="space-y-5">
          <Card className="gap-0 overflow-hidden border-white/10 bg-white/4.5 py-0 text-white shadow-none">
            <div className="grid gap-4 border-b border-white/10 p-5 md:grid-cols-[1fr_auto] md:items-end">
              <label>
                <span className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">
                  Име на тимот
                </span>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value.slice(0, 40))}
                  className="h-11 border-white/10 bg-black/20 font-bold text-white"
                />
              </label>
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">
                  Формација
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(fantasyFormations) as FantasyFormation[]).map((item) => (
                    <Button
                      key={item}
                      size="sm"
                      onClick={() => changeFormation(item)}
                      className={formation === item ? "bg-lime-300 text-slate-950" : "bg-white/8 text-slate-300"}
                    >
                      {item}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Кликнете на круната под стартер за да го назначите за капитен.
                </p>
              </div>
            </div>

            <div className="relative min-h-180 overflow-hidden bg-[#0a513d] px-3 py-8 sm:px-8">
              <div className="pointer-events-none absolute inset-4 border-2 border-white/20" />
              <div className="pointer-events-none absolute left-1/2 top-4 h-[calc(100%-2rem)] w-px bg-white/20" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
              <div className="pointer-events-none absolute inset-x-[28%] top-4 h-20 border-x-2 border-b-2 border-white/20" />
              <div className="pointer-events-none absolute inset-x-[28%] bottom-4 h-20 border-x-2 border-t-2 border-white/20" />
              <div className="relative flex min-h-164 flex-col justify-between">
                {positionOrder.map((position) => {
                  const row = starters.filter((player) => player.position === position);
                  return (
                    <div
                      key={position}
                      onDragEnter={() => setDropPosition(position)}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setDropPosition(null);
                        }
                      }}
                      onDragOver={(event) => {
                        const dragged = draggedBenchId ? playerById.get(draggedBenchId) : null;
                        if (dragged?.position === position) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        dropBenchPlayer(position);
                      }}
                      className={cn(
                        "flex min-h-30 items-center justify-center gap-1 border border-transparent transition sm:gap-5",
                        dropPosition === position && "border-dashed border-lime-300/70 bg-lime-300/10",
                      )}
                    >
                      {row.map((player) => (
                        <PitchPlayer
                          key={player.id}
                          player={player}
                          captain={captainId === player.id}
                          canAcceptDrop={
                            Boolean(draggedBenchId) &&
                            playerById.get(draggedBenchId!)?.position === player.position
                          }
                          onCaptain={setCaptainId}
                          onDropBench={(replacedStarterId) =>
                            dropBenchPlayer(player.position, replacedStarterId)
                          }
                          onRemove={removePlayer}
                        />
                      ))}
                      {Array.from({
                        length: fantasyFormations[formation][position] - row.length,
                      }).map((_, index) => (
                        <div
                          key={`${position}-${index}`}
                          className="grid size-20 place-items-center rounded-full border border-dashed border-white/30 bg-black/10 text-[10px] font-black text-white/45 sm:size-24"
                        >
                          {positionShortLabels[position]}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card className="border-white/10 bg-white/4.5 p-5 text-white shadow-none">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Клупа</p>
                <h2 className="mt-1 text-xl font-black">5 резервни играчи</h2>
              </div>
              <Badge variant="outline" className="border-white/10 text-slate-400">{bench.length}/5</Badge>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {bench.map((player) => (
                <div
                  key={player.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", player.id);
                    setDraggedBenchId(player.id);
                  }}
                  onDragEnd={() => {
                    setDraggedBenchId(null);
                    setDropPosition(null);
                  }}
                  className={cn(
                    "relative flex cursor-grab items-center gap-3 bg-black/20 p-3 active:cursor-grabbing xl:flex-col xl:text-center",
                    draggedBenchId === player.id && "opacity-45",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => removePlayer(player.id)}
                    className="absolute right-1.5 top-1.5 text-slate-500 hover:text-white"
                    aria-label={`Отстрани го ${player.name}`}
                  >
                    <X className="size-4" />
                  </button>
                  <PlayerPortrait player={player} size="small" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 xl:justify-center">
                      {teamsByCode.get(player.teamId) ? (
                        <TeamFlag team={teamsByCode.get(player.teamId)!} size={16} />
                      ) : null}
                      <p className="truncate text-xs font-black">{player.name}</p>
                    </div>
                    <p className="text-[10px] text-lime-300">{formatFantasyPrice(player.price)}</p>
                    <p className="mt-1 text-[10px] font-bold text-cyan-300">
                      Повлечи на {positionShortLabels[player.position]}
                    </p>
                  </div>
                </div>
              ))}
              {Array.from({ length: Math.max(0, 5 - bench.length) }).map((_, index) => (
                <div key={index} className="grid min-h-24 place-items-center border border-dashed border-white/10 text-xs font-bold text-slate-600">
                  Празно место
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className="border-white/10 bg-white/4.5 p-5 text-white shadow-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="size-5 text-lime-300" />
                <h2 className="font-black">Буџет</h2>
              </div>
              <span className="font-mono font-black">{formatFantasyPrice(spent)} / {formatFantasyPrice(FANTASY_BUDGET)}</span>
            </div>
            <Progress value={Math.min(100, (spent / FANTASY_BUDGET) * 100)} className="mt-4 h-2 bg-white/10" />
            <div className="mt-5 grid grid-cols-2 gap-2">
              {positionOrder.map((position) => (
                <div key={position} className="flex items-center justify-between bg-black/20 px-3 py-2 text-xs">
                  <span className="text-slate-400">{positionShortLabels[position]}</span>
                  <b className={squadCounts[position] === fantasyPositionCounts[position] ? "text-lime-300" : "text-white"}>
                    {squadCounts[position]}/{fantasyPositionCounts[position]}
                  </b>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-black/20 p-3 text-xs leading-5 text-slate-400">
              {context.maxTransfers == null
                ? context.freshSquad
                  ? "Во овој период составувате нов тим без ограничување на трансфери."
                  : "Нема ограничување на трансфери."
                : `Имате ${context.maxTransfers} трансфери за овој период. Искористени: ${transfersUsed}.`}
            </div>
          </Card>

          <Card className="gap-0 border-white/10 bg-white/4.5 p-0 text-white shadow-none">
            <div className="p-5">
              <div className="flex items-center gap-2">
                <Search className="size-5 text-cyan-300" />
                <h2 className="text-xl font-black">Пазар на играчи</h2>
              </div>
              <div className="mt-4 grid gap-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Пребарај играч или репрезентација..."
                  className="h-10 border-white/10 bg-black/20 text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={positionFilter}
                    onChange={(event) => setPositionFilter(event.target.value as FantasyPosition | "ALL")}
                    className="h-10 bg-[#0b1825] px-3 text-sm text-slate-300 outline-none"
                  >
                    <option value="ALL">Сите позиции</option>
                    {positionOrder.map((position) => (
                      <option key={position} value={position}>{positionLabels[position]}</option>
                    ))}
                  </select>
                  <select
                    value={teamFilter}
                    onChange={(event) => setTeamFilter(event.target.value)}
                    className="h-10 bg-[#0b1825] px-3 text-sm text-slate-300 outline-none"
                  >
                    <option value="ALL">Сите репрезентации</option>
                    {[...new Map(fantasyPlayers
                      .filter((player) => context.eligibleTeamIds.includes(player.teamId))
                      .map((player) => [player.teamId, player.teamName])).entries()]
                      .sort((left, right) => left[1].localeCompare(right[1], "mk"))
                      .map(([code, teamName]) => (
                        <option key={code} value={code}>{teamName}</option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="max-h-185 overflow-y-auto border-t border-white/10">
              {marketPlayers.map((player) => {
                const selected = squadIds.includes(player.id);
                const team = teamsByCode.get(player.teamId);
                return (
                  <button
                    type="button"
                    key={player.id}
                    onClick={() => selected ? removePlayer(player.id) : addPlayer(player)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/[0.07]",
                      selected && "bg-lime-300/10",
                    )}
                  >
                    <PlayerPortrait player={player} size="small" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-white">{player.name}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                        {team ? <TeamFlag team={team} size={16} /> : null}
                        {positionShortLabels[player.position]} · {player.teamName}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-sm font-black text-lime-300">
                        {formatFantasyPrice(player.price)}
                      </span>
                      {selected ? <Check className="ml-auto mt-1 size-4 text-lime-300" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {message ? (
            <p className={cn("px-1 text-sm font-bold", message.includes("зачуван") ? "text-lime-300" : "text-amber-300")}>
              {message}
            </p>
          ) : null}
          <Button
            onClick={save}
            disabled={!complete || pending || name.trim().length < 2}
            className="h-12 w-full bg-lime-300 font-black text-slate-950 hover:bg-lime-200"
          >
            {pending ? <Shield className="animate-pulse" /> : <Save />}
            {pending ? "Се зачувува..." : "Зачувај го фантази тимот"}
          </Button>
          {!complete ? (
            <p className="text-center text-xs leading-5 text-slate-500">
              Пополнете ги сите 16 места, изберете валидни стартни 11 и назначете капитен.
            </p>
          ) : null}
        </aside>
      </section>
      <PublicFantasyTeams teams={publicTeams} players={players} />
    </div>
  );
}
