"use client";

import { useMemo, useState, useTransition, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronUp, ChevronDown, GripVertical, Medal, RotateCcw, Trophy } from "lucide-react";
import { resetTournamentPrediction, saveTournamentPrediction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PublicTournamentPredictions } from "@/components/public-tournament-predictions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamFlag } from "@/components/team-flag";
import type { ActualGroupRankingsData, LeaderboardEntry, TournamentPredictionData } from "@/lib/app-data";
import {
  assignThirdPlaceGroups,
  bracketMatchOrder,
  getDescendantMatchIds,
  knockoutMatches,
  knockoutStages,
  previousKnockoutStage,
  thirdPlaceSlots,
  type KnockoutStage,
} from "@/lib/knockout";
import { groups, type Team } from "@/lib/tournament";
import { cn } from "@/lib/utils";

type Rankings = Record<string, Team[]>;
type Winners = Record<number, string>;

const stageLabels: Record<KnockoutStage, string> = {
  "Round of 32": "Шеснаесетфинале",
  "Round of 16": "Осминафинале",
  "Quarter-finals": "Четвртфинале",
  "Semi-finals": "Полуфинале",
  "Medal matches": "Мечеви за медали",
};

const initialRankings = Object.fromEntries(groups.map((group) => [group.id, group.teams]));
const teamsByCode = new Map(groups.flatMap((group) => group.teams).map((team) => [team.code, team]));

function savedRankings(prediction: TournamentPredictionData | null): Rankings {
  if (!prediction) return initialRankings;
  return Object.fromEntries(
    groups.map((group) => [
      group.id,
      prediction.groupRankings[group.id]
        ?.map((code) => teamsByCode.get(code))
        .filter((team): team is Team => Boolean(team)) ?? group.teams,
    ]),
  );
}

function savedWinners(prediction: TournamentPredictionData | null): Winners {
  if (!prediction) return {};
  return Object.fromEntries(
    Object.entries(prediction.bracket).map(([matchId, code]) => [Number(matchId), code]),
  );
}

function GroupCard({
  id,
  teams,
  onReorder,
}: {
  id: string;
  teams: Team[];
  onReorder: (group: string, from: number, to: number) => void;
}) {
  const [dragged, setDragged] = useState<number | null>(null);

  const drop = (event: DragEvent, to: number) => {
    event.preventDefault();
    if (dragged !== null && dragged !== to) onReorder(id, dragged, to);
    setDragged(null);
  };

  return (
    <Card data-group-card={id} className="gap-0 overflow-hidden border-white/10 bg-white/4.5 py-0 text-white shadow-none">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="font-black">ГРУПА {id}</h3>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Повлечи за рангирање</span>
      </div>
      <div className="p-2">
        {teams.map((item, index) => (
          <div
            key={item.code}
            data-team={item.code}
            draggable
            onDragStart={() => setDragged(index)}
            onDragEnd={() => setDragged(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => drop(event, index)}
            className={cn(
              "group flex cursor-grab items-center gap-2 rounded-xl border border-transparent p-2 transition active:cursor-grabbing",
              dragged === index ? "border-cyan-300/40 bg-cyan-300/10 opacity-60" : "hover:bg-white/5",
            )}
          >
            <GripVertical className="size-4 shrink-0 text-slate-600" />
            <span className={cn("grid size-6 place-items-center rounded-md text-xs font-black", index < 2 ? "bg-lime-300 text-slate-950" : index === 2 ? "bg-cyan-300/15 text-cyan-300" : "bg-white/5 text-slate-500")}>{index + 1}</span>
            <TeamFlag team={item} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
            <div className="flex">
              <button aria-label={`Помести ја ${item.name} нагоре`} onClick={() => onReorder(id, index, index - 1)} disabled={index === 0} className="rounded p-1 text-slate-600 hover:bg-white/10 hover:text-white disabled:opacity-20"><ChevronUp className="size-3.5" /></button>
              <button aria-label={`Помести ја ${item.name} надолу`} onClick={() => onReorder(id, index, index + 1)} disabled={index === 3} className="rounded p-1 text-slate-600 hover:bg-white/10 hover:text-white disabled:opacity-20"><ChevronDown className="size-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TeamLabel({ team, muted = false, flagSize = 14 }: { team?: Team; muted?: boolean; flagSize?: number }) {
  if (!team) return <span className="text-slate-600">Ќе биде одредено</span>;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", muted && "text-slate-400")}>
      <TeamFlag team={team} size={flagSize} />
      <span className="truncate">{team.name}</span>
    </span>
  );
}

function stageSpan(stage: KnockoutStage) {
  return {
    "Round of 32": 1,
    "Round of 16": 2,
    "Quarter-finals": 4,
    "Semi-finals": 8,
    "Medal matches": 8,
  }[stage];
}

function ThirdPlaceSelector({
  rankings,
  selected,
  onToggle,
}: {
  rankings: Rankings;
  selected: string[];
  onToggle: (group: string) => void;
}) {
  return (
    <Card className="blue-third-place-panel mt-6 border-cyan-300/20 bg-cyan-300/6 p-5 text-white shadow-none">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-black">Избери ги осумте најдобри третопласирани репрезентации</h3>
          <p className="mt-1 text-sm text-slate-400">Избери точно 8 од 12-те третопласирани репрезентации.</p>
        </div>
        <Badge className={cn("w-fit text-sm", selected.length === 8 ? "bg-lime-300 text-slate-950" : "bg-white/10 text-white")}>{selected.length} / 8 избрани</Badge>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((group) => {
          const team = rankings[group.id][2];
          const active = selected.includes(group.id);
          return (
            <button
              key={group.id}
              data-third-group={group.id}
              onClick={() => onToggle(group.id)}
              disabled={!active && selected.length === 8}
              className={cn(
                "blue-third-place-option",
                "flex items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-35",
                active ? "border-lime-300/50 bg-lime-300/10" : "border-white/10 bg-black/10 hover:border-cyan-300/30",
              )}
            >
              <span className={cn("grid size-6 place-items-center rounded-md text-xs font-black", active ? "bg-lime-300 text-slate-950" : "bg-white/10 text-slate-500")}>{active ? <Check className="size-4" /> : group.id}</span>
              <TeamFlag team={team} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{team.name}</span>
                <span className="text-[11px] text-slate-500">Трето место во група {group.id}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function KnockoutBracket({
  rankings,
  thirdGroups,
  winners,
  setWinners,
}: {
  rankings: Rankings;
  thirdGroups: string[];
  winners: Winners;
  setWinners: Dispatch<SetStateAction<Winners>>;
}) {
  const teamByCode = useMemo(() => new Map(groups.flatMap((group) => group.teams).map((team) => [team.code, team])), []);
  const assignments = useMemo(() => assignThirdPlaceGroups(thirdGroups), [thirdGroups]);
  const thirdComplete = Object.keys(thirdPlaceSlots).every((id) => assignments[Number(id)]);

  const stageComplete = (stage: KnockoutStage) =>
    bracketMatchOrder[stage].every((matchId) => Boolean(winners[matchId]));

  const stageUnlocked = (stage: KnockoutStage) => {
    if (stage === "Round of 32") return thirdComplete;
    const previousStage = previousKnockoutStage[stage];
    return previousStage ? stageComplete(previousStage) : false;
  };

  const resolve = (reference: string): Team | undefined => {
    if (reference.startsWith("W")) return teamByCode.get(winners[Number(reference.slice(1))]);
    if (reference.startsWith("L")) {
      const source = knockoutMatches.find((match) => match.id === Number(reference.slice(1)));
      if (!source) return undefined;
      const home = resolve(source.home);
      const away = resolve(source.away);
      const winner = winners[source.id];
      if (!home || !away || !winner) return undefined;
      return home.code === winner ? away : home;
    }
    if (reference.startsWith("3:")) {
      const match = knockoutMatches.find((item) => item.away === reference);
      const group = match ? assignments[match.id] : undefined;
      return group ? rankings[group][2] : undefined;
    }
    const position = Number(reference[0]) - 1;
    const group = reference[1];
    return rankings[group]?.[position];
  };

  const chooseWinner = (matchId: number, team?: Team) => {
    const match = knockoutMatches.find((item) => item.id === matchId);
    if (!team || !match || !stageUnlocked(match.stage)) return;
    setWinners((current) => {
      if (current[matchId] === team.code) return current;
      const next = { ...current, [matchId]: team.code };
      for (const descendantId of getDescendantMatchIds(matchId)) delete next[descendantId];
      return next;
    });
  };

  return (
    <div className="mt-5">
      <div className="overflow-x-auto pb-3">
        <div className="min-w-295">
          <div className="mb-2 grid grid-cols-5 gap-2">
            {knockoutStages.map((stage) => (
              <div key={stage} className="rounded-lg border border-white/8 bg-[#0a1927] px-2 py-2 text-center">
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{stageLabels[stage]}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 items-stretch gap-2">
          {knockoutStages.map((stage) => stage === "Medal matches" ? (
            <div
              key={stage}
              data-stage={stage}
              data-stage-locked={!stageUnlocked(stage)}
              className="grid grid-rows-16 gap-1"
            >
              <div className="col-start-1 row-start-5 row-span-8 flex items-center">
                <div className="w-full translate-y-6.5 space-y-1">
                  {[104, 103].map((matchId) => {
                    const match = knockoutMatches.find((item) => item.id === matchId)!;
                    const home = resolve(match.home);
                    const away = resolve(match.away);
                    const selectedWinner = winners[match.id];
                    const isFinal = match.id === 104;
                    return (
                      <Card key={match.id} data-match={match.id} data-winner={selectedWinner} className={cn("w-full gap-0 overflow-hidden rounded-none border-white/10 bg-white/4.5 py-0 text-white shadow-none", !stageUnlocked(stage) && "opacity-55", isFinal && "border-lime-300/40 bg-lime-300/8 shadow-[0_0_28px_rgba(190,242,100,.08)]")}>
                        <div className={cn("flex items-center justify-between border-b border-white/8 px-2 py-0.5 text-[8px] leading-none text-slate-500", isFinal && "px-3 py-1.5 text-[10px] text-lime-200")}>
                          <span className="font-black">{isFinal ? "ФИНАЛЕ · M104" : "ТРЕТО МЕСТО · M103"}</span><span className="truncate pl-2">{match.date} · {match.venue}</span>
                        </div>
                        <div className={cn("p-0.5", isFinal && "p-2")}>
                          <button onClick={() => chooseWinner(match.id, home)} disabled={!home || !stageUnlocked(stage)} className={cn("flex h-4 w-full items-center border px-1.5 text-left text-[9px] font-semibold transition disabled:cursor-not-allowed", isFinal && "h-8 px-2 text-xs", selectedWinner && selectedWinner === home?.code ? "border-lime-300/50 bg-lime-300/15 text-lime-200" : "border-transparent hover:bg-white/5 disabled:text-slate-600")}>
                            <TeamLabel team={home} flagSize={isFinal ? 20 : 14} />
                          </button>
                          <button onClick={() => chooseWinner(match.id, away)} disabled={!away || !stageUnlocked(stage)} className={cn("flex h-4 w-full items-center border px-1.5 text-left text-[9px] font-semibold transition disabled:cursor-not-allowed", isFinal && "mt-1 h-8 px-2 text-xs", selectedWinner && selectedWinner === away?.code ? "border-lime-300/50 bg-lime-300/15 text-lime-200" : "border-transparent hover:bg-white/5 disabled:text-slate-600")}>
                            <TeamLabel team={away} flagSize={isFinal ? 20 : 14} />
                          </button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div
              key={stage}
              data-stage={stage}
              data-stage-locked={!stageUnlocked(stage)}
              className="grid grid-rows-16 gap-1"
            >
              {bracketMatchOrder[stage].map((matchId, index) => {
                const match = knockoutMatches.find((item) => item.id === matchId)!;
                const home = resolve(match.home);
                const away = resolve(match.away);
                const selectedWinner = winners[match.id];
                const span = stageSpan(stage);
                const rowStart = index * span + 1;
                return (
                  <div
                    key={match.id}
                    className={cn("flex items-center", stage === "Round of 32" && "py-0.5")}
                    style={{ gridRow: `${rowStart} / span ${span}` }}
                  >
                  <Card data-match={match.id} data-winner={selectedWinner} className={cn("w-full gap-0 overflow-hidden rounded-none border-white/10 bg-white/4.5 py-0 text-white shadow-none", !stageUnlocked(stage) && "opacity-55")}>
                    <div className="flex items-center justify-between border-b border-white/8 px-2 py-0.5 text-[8px] leading-none text-slate-500">
                      <span className="font-black">M{match.id}</span><span className="truncate pl-2">{match.date} · {match.venue}</span>
                    </div>
                    <div className="p-0.5">
                      <button onClick={() => chooseWinner(match.id, home)} disabled={!home || !stageUnlocked(stage)} className={cn("flex h-4 w-full items-center border px-1.5 text-left text-[9px] font-semibold transition disabled:cursor-not-allowed", selectedWinner && selectedWinner === home?.code ? "border-lime-300/50 bg-lime-300/15 text-lime-200" : "border-transparent hover:bg-white/5 disabled:text-slate-600")}>
                        <TeamLabel team={home} />
                      </button>
                      <button onClick={() => chooseWinner(match.id, away)} disabled={!away || !stageUnlocked(stage)} className={cn("flex h-4 w-full items-center border px-1.5 text-left text-[9px] font-semibold transition disabled:cursor-not-allowed", selectedWinner && selectedWinner === away?.code ? "border-lime-300/50 bg-lime-300/15 text-lime-200" : "border-transparent hover:bg-white/5 disabled:text-slate-600")}>
                        <TeamLabel team={away} />
                      </button>
                    </div>
                  </Card>
                  </div>
                );
              })}
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TournamentPreview({
  champion,
  runnerUp,
  bronzeWinner,
  thirdGroups,
  winners,
  submitted,
  submittedAt,
  onConfirm,
  disabled,
}: {
  champion?: Team;
  runnerUp?: Team;
  bronzeWinner?: Team;
  thirdGroups: string[];
  winners: Winners;
  submitted: boolean;
  submittedAt: string | null;
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="blue-preview-main border-lime-300/25 bg-lime-300/[0.07] p-8 text-center text-white shadow-none">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-lime-300 text-slate-950"><Trophy className="size-8" /></div>
        <p className="mt-5 text-xs font-black uppercase tracking-[.18em] text-lime-300">Твојот шампион за 2026</p>
        {champion ? (
          <div className="mt-4 flex items-center justify-center gap-4">
            <TeamFlag team={champion} size={48} />
            <h2 className="text-4xl font-black">{champion.name}</h2>
          </div>
        ) : <p className="mt-4 text-slate-500">Прво пополни го нокаут-костурот.</p>}
        <p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-slate-400">
          {submitted
            ? "Ова е твоето испратено турнирско предвидување. Можеш да го ресетираш и повторно да го пополниш до 00:00 на 13 јуни по варшавско време."
            : "Внимателно провери ги изборите. По потврдувањето можеш да го ресетираш целото предвидување само до 00:00 на 13 јуни по варшавско време."}
        </p>
        {submitted ? (
          <div className="mx-auto mt-7 flex w-fit items-center gap-2 bg-lime-300/10 px-4 py-3 text-sm font-black text-lime-200">
            <Check className="size-4" /> Предвидувањето е потврдено
          </div>
        ) : (
          <Button disabled={disabled} onClick={onConfirm} className="mx-auto mt-7 h-11 bg-lime-300 px-7 font-black text-slate-950 hover:bg-lime-200">
            Потврди го турнирското предвидување <Check />
          </Button>
        )}
        {submittedAt ? <p className="mt-3 text-xs text-slate-500">Испратено на {new Date(submittedAt).toLocaleString("mk-MK")}</p> : null}
      </Card>
      <Card className="blue-preview-side border-white/10 bg-white/4.5 p-6 text-white shadow-none">
        <div className="grid size-10 place-items-center rounded-xl bg-slate-300/10 text-slate-300"><Medal className="size-5" /></div>
        <p className="mt-4 text-xs font-black uppercase tracking-[.15em] text-slate-500">Второ место</p>
        {runnerUp ? (
          <div className="mt-3 flex items-center gap-3">
            <TeamFlag team={runnerUp} size={34} />
            <p className="text-xl font-black">{runnerUp.name}</p>
          </div>
        ) : <p className="mt-3 text-sm text-slate-500">Сè уште не е избрано.</p>}
        <div className="mt-5 border-t border-white/10 pt-5">
          <p className="text-xs font-black uppercase tracking-[.15em] text-slate-500">Освојувач на третото место</p>
          {bronzeWinner ? (
            <div className="mt-3 flex items-center gap-3">
              <TeamFlag team={bronzeWinner} size={34} />
              <p className="text-xl font-black">{bronzeWinner.name}</p>
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">Сè уште не е избрано.</p>}
        </div>
        <div className="mt-6 border-t border-white/10 pt-4 text-sm text-slate-400">
          <p><b className="text-white">12</b> рангирани групи</p>
          <p className="mt-2"><b className="text-white">{thirdGroups.length}</b> третопласирани патници понатаму</p>
          <p className="mt-2"><b className="text-white">{Object.keys(winners).length}</b> победници во нокаут-фазата</p>
        </div>
      </Card>
    </div>
  );
}

function ActualGroupPhase({
  actualGroupRankings,
  prediction,
}: {
  actualGroupRankings: ActualGroupRankingsData;
  prediction: TournamentPredictionData;
}) {
  const completedGroups = groups.filter((group) => actualGroupRankings[group.id]?.length === 4);
  const totalTeamPoints = completedGroups.reduce(
    (total, group) =>
      total +
      actualGroupRankings[group.id].filter(
        (teamCode, index) => prediction.groupRankings[group.id]?.[index] === teamCode,
      ).length * 2,
    0,
  );
  const perfectGroupPoints = completedGroups.reduce((total, group) => {
    const actual = actualGroupRankings[group.id];
    const predicted = prediction.groupRankings[group.id] ?? [];
    return actual.every((teamCode, index) => predicted[index] === teamCode)
      ? total + 2
      : total;
  }, 0);

  if (completedGroups.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-black text-white">Actual group phase</h2>
          <p className="mt-1 text-sm text-slate-400">
            Points from finished group standings: +2 for every team in the exact position, plus +2 for a perfect group.
          </p>
        </div>
        <div className="flex gap-2 text-sm font-black">
          <span className="bg-cyan-300/10 px-3 py-2 text-cyan-200">{totalTeamPoints} position pts</span>
          <span className="bg-lime-300/10 px-3 py-2 text-lime-200">{perfectGroupPoints} bonus pts</span>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {completedGroups.map((group) => {
          const actual = actualGroupRankings[group.id];
          const predicted = prediction.groupRankings[group.id] ?? [];
          const perfect = actual.every((teamCode, index) => predicted[index] === teamCode);

          return (
            <Card key={group.id} className="gap-0 overflow-hidden border-white/10 bg-white/4.5 py-0 text-white shadow-none">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h3 className="font-black">Group {group.id}</h3>
                <span className={cn("text-xs font-black", perfect ? "text-lime-300" : "text-slate-500")}>
                  {perfect ? "+2 perfect group" : "No group bonus"}
                </span>
              </div>
              <div className="p-2">
                {actual.map((teamCode, index) => {
                  const team = teamsByCode.get(teamCode);
                  if (!team) return null;
                  const points = predicted[index] === teamCode ? 2 : 0;

                  return (
                    <div key={teamCode} className="flex items-center gap-3 p-2">
                      <span className={cn("grid size-6 place-items-center rounded-md text-xs font-black", index < 2 ? "bg-lime-300 text-slate-950" : index === 2 ? "bg-cyan-300/15 text-cyan-300" : "bg-white/5 text-slate-500")}>
                        {index + 1}
                      </span>
                      <TeamFlag team={team} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{team.name}</span>
                      <span className={cn("min-w-10 text-right font-mono text-sm font-black", points > 0 ? "text-lime-300" : "text-slate-600")}>
                        +{points}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export function TournamentGame({
  signedIn,
  configured,
  savedPrediction,
  actualGroupRankings,
  tournamentLockTime,
  tournamentLocked,
  otherPlayers,
}: {
  signedIn: boolean;
  configured: boolean;
  savedPrediction: TournamentPredictionData | null;
  actualGroupRankings: ActualGroupRankingsData;
  tournamentLockTime: string | null;
  tournamentLocked: boolean;
  otherPlayers: LeaderboardEntry[];
}) {
  const router = useRouter();
  const [rankings, setRankings] = useState<Rankings>(() => savedRankings(savedPrediction));
  const [thirdGroups, setThirdGroups] = useState<string[]>(savedPrediction?.thirdPlaceGroups ?? []);
  const [winners, setWinners] = useState<Winners>(() => savedWinners(savedPrediction));
  const [step, setStep] = useState(savedPrediction ? "review" : "groups");
  const [submitted, setSubmitted] = useState(Boolean(savedPrediction));
  const [submittedAt, setSubmittedAt] = useState(savedPrediction?.submittedAt ?? null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const champion = winners[104] ? teamsByCode.get(winners[104]) : undefined;
  const bronzeWinner = winners[103] ? teamsByCode.get(winners[103]) : undefined;
  const semifinalWinners = [winners[101], winners[102]]
    .map((code) => code ? teamsByCode.get(code) : undefined)
    .filter((team): team is Team => Boolean(team));
  const runnerUp = champion
    ? semifinalWinners.find((team) => team.code !== champion.code)
    : undefined;
  const bracketComplete = Boolean(champion && bronzeWinner);
  const submitPrediction = () => {
    setError("");
    startTransition(async () => {
      try {
        await saveTournamentPrediction({
          groupRankings: Object.fromEntries(
            Object.entries(rankings).map(([group, teams]) => [
              group,
              teams.map((team) => team.code),
            ]),
          ),
          thirdPlaceGroups: thirdGroups,
          bracket: Object.fromEntries(
            Object.entries(winners).map(([matchId, code]) => [matchId, code]),
          ),
        });
        setConfirmationOpen(false);
        setSubmitted(true);
        setSubmittedAt(new Date().toISOString());
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Предвидувањето не можеше да се испрати.");
      }
    });
  };

  const resetPrediction = () => {
    setError("");
    startTransition(async () => {
      try {
        await resetTournamentPrediction();
        setRankings(initialRankings);
        setThirdGroups([]);
        setWinners({});
        setStep("groups");
        setSubmitted(false);
        setSubmittedAt(null);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Предвидувањето не можеше да се ресетира.");
      }
    });
  };

  const reorder = (group: string, from: number, to: number) => {
    if (to < 0 || to > 3 || from === to) return;
    setRankings((current) => {
      const next = [...current[group]];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...current, [group]: next };
    });
    setWinners({});
  };

  const toggleThird = (group: string) => {
    setThirdGroups((current) => current.includes(group)
      ? current.filter((item) => item !== group)
      : current.length < 8 ? [...current, group] : current);
    setWinners({});
  };

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white">{submitted ? "Твоето турнирско предвидување" : "Состави го твојот турнир"}</h1>
          <p className="mt-2 max-w-2xl text-slate-400">
            {submitted ? "Твоето потврдено предвидување е достапно тука за преглед и може да се ресетира до 00:00 на 13 јуни по варшавско време." : "Рангирај ја секоја група, избери ги осумте третопласирани патници понатаму, а потоа предвиди ги сите 32 нокаут-натпревари."}
          </p>
        </div>
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm">
          <p className="font-bold text-amber-200">
            {tournamentLockTime
              ? `Се заклучува на ${new Date(tournamentLockTime).toLocaleString("mk-MK", { timeZone: "Europe/Skopje" })} по скопско време`
              : "Времето за заклучување не е достапно"}
          </p>
          <p className="text-xs text-slate-400">До тогаш можеш да го ресетираш и повторно да го пополниш предвидувањето.</p>
        </div>
      </div>

      {!submitted ? <PublicTournamentPredictions players={otherPlayers} className="mt-8" /> : null}

      {submitted ? (
        <>
          {savedPrediction ? (
            <ActualGroupPhase
              actualGroupRankings={actualGroupRankings}
              prediction={savedPrediction}
            />
          ) : null}
          <TournamentPreview
            champion={champion}
            runnerUp={runnerUp}
            bronzeWinner={bronzeWinner}
            thirdGroups={thirdGroups}
            winners={winners}
            submitted
            submittedAt={submittedAt}
            onConfirm={() => undefined}
            disabled
          />
          <div className="mt-4 flex flex-col items-center gap-3">
            <Button
              disabled={pending || tournamentLocked}
              onClick={resetPrediction}
              variant="outline"
              className="border-red-300/30 bg-red-300/10 font-black text-red-200 hover:bg-red-300/15"
            >
              <RotateCcw /> {pending ? "Се ресетира..." : "Ресетирај го предвидувањето"}
            </Button>
            {tournamentLocked ? <p className="text-sm font-bold text-amber-200">Ресетирањето е затворено по рокот од 00:00 на 13 јуни по варшавско време.</p> : null}
            {error ? <p className="text-sm font-bold text-red-300">{error}</p> : null}
          </div>
          <PublicTournamentPredictions players={otherPlayers} className="mt-10 border-t border-white/10 pt-8" />
        </>
      ) : (
      <Tabs value={step} onValueChange={setStep} className="mt-8">
        <TabsList className="h-auto flex-wrap bg-white/5">
          <TabsTrigger value="groups">1. Групи</TabsTrigger>
          <TabsTrigger value="bracket">2. Нокаут-фаза</TabsTrigger>
          <TabsTrigger value="review">3. Преглед</TabsTrigger>
        </TabsList>
        <TabsContent value="groups">
          <div className="mb-5 mt-5 flex items-center gap-3">
            <Progress value={thirdGroups.length === 8 ? 50 : 25} className="max-w-xs bg-white/10 **:data-[slot=progress-indicator]:bg-lime-300" />
            <span className="text-xs font-bold text-slate-400">Рангирај ги репрезентациите со влечење или со копчињата со стрелки</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => <GroupCard key={group.id} id={group.id} teams={rankings[group.id]} onReorder={reorder} />)}
          </div>
          <ThirdPlaceSelector rankings={rankings} selected={thirdGroups} onToggle={toggleThird} />
          <div className="mt-4 flex justify-end">
            <Button
              disabled={thirdGroups.length !== 8}
              onClick={() => setStep("bracket")}
              className="h-10 bg-lime-300 px-5 font-bold text-slate-950 hover:bg-lime-200"
            >
              Продолжи кон нокаут-фазата <ArrowRight />
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="bracket">
          <KnockoutBracket rankings={rankings} thirdGroups={thirdGroups} winners={winners} setWinners={setWinners} />
          <div className="mt-4 flex justify-end">
            <Button
              disabled={!bracketComplete}
              onClick={() => setStep("review")}
              className="h-10 bg-lime-300 px-5 font-bold text-slate-950 hover:bg-lime-200"
            >
              Продолжи кон преглед <ArrowRight />
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="review">
          <TournamentPreview
            champion={champion}
            runnerUp={runnerUp}
            bronzeWinner={bronzeWinner}
            thirdGroups={thirdGroups}
            winners={winners}
            submitted={false}
            submittedAt={null}
            onConfirm={() => setConfirmationOpen(true)}
            disabled={!bracketComplete || !configured || !signedIn || pending || tournamentLocked}
          />
          {error ? <p className="mt-3 text-center text-sm font-bold text-red-300">{error}</p> : null}
        </TabsContent>
      </Tabs>
      )}

      {confirmationOpen ? (
        <div className="fixed inset-0 z-100 grid place-items-center bg-[#020811]/80 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-tournament-title">
          <Card className="w-full max-w-lg bg-[#0d1b29] p-7 text-white shadow-2xl">
            <div className="grid size-12 place-items-center bg-amber-300/10 text-amber-200"><Trophy className="size-6" /></div>
            <h2 id="confirm-tournament-title" className="mt-5 text-2xl font-black">Да го потврдите турнирското предвидување?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              По потврдувањето можеш да го ресетираш целото предвидување и да започнеш одново само до 00:00 на 13 јуни по варшавско време.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 bg-black/20 p-4 text-center">
              <div><p className="text-[10px] font-black uppercase text-slate-500">Шампион</p><p className="mt-1 text-sm font-bold text-lime-200">{champion?.name}</p></div>
              <div><p className="text-[10px] font-black uppercase text-slate-500">Второ место</p><p className="mt-1 text-sm font-bold">{runnerUp?.name}</p></div>
              <div><p className="text-[10px] font-black uppercase text-slate-500">Трето место</p><p className="mt-1 text-sm font-bold">{bronzeWinner?.name}</p></div>
            </div>
            {error ? <p className="mt-4 text-sm font-bold text-red-300">{error}</p> : null}
            <div className="mt-7 flex justify-end gap-2">
              <Button disabled={pending} onClick={() => setConfirmationOpen(false)} className="bg-white/10 text-white hover:bg-white/15">Назад</Button>
              <Button disabled={pending} onClick={submitPrediction} className="bg-lime-300 px-5 font-black text-slate-950 hover:bg-lime-200">
                {pending ? "Се испраќа..." : "Потврди предвидување"} <Check />
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
