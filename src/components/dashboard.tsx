"use client";

import { useMemo, useState, useTransition, type FocusEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SignInButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";
import {
  ArrowRight,
  Award,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  LockKeyhole,
  LogIn,
  Medal,
  Menu,
  ShieldCheck,
  Trophy,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import { mk } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TournamentGame } from "@/components/tournament-game";
import { PublicTournamentPredictions } from "@/components/public-tournament-predictions";
import { AwardsGame } from "@/components/awards-game";
import { FantasyTeamGame } from "@/components/fantasy-team-game";
import { TeamFlag } from "@/components/team-flag";
import { saveMatchPrediction } from "@/app/actions";
import type {
  AppData,
  CurrentPlayerStats,
  LeaderboardEntry,
  MatchPredictionData,
} from "@/lib/app-data";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/tournament";

const nav = [
  { id: "Dashboard", label: "Почетна" },
  { id: "Tournament", label: "Турнир" },
  { id: "Fantasy", label: "Фантази" },
  { id: "Matches", label: "Натпревари" },
  { id: "Leaderboard", label: "Табела" },
];

const matchStageLabels: Record<NonNullable<Match["stage"]>, string> = {
  group: "Group",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_final: "Quarter-final",
  semi_final: "Semi-final",
  third_place: "Third place",
  final: "Final",
};

const knockoutStageOptions = [
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "third_place",
  "final",
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-xl bg-lime-300 text-slate-950 shadow-[0_0_24px_rgba(190,242,100,.25)]">
        <Trophy className="size-5" strokeWidth={2.5} />
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-lime-300">Фантази Светско првенство</div>
        <div className="text-xl font-black tracking-tight text-white">WORLDIE<span className="text-lime-300">26</span></div>
      </div>
    </div>
  );
}

function ClerkAuthControls({ compact = false }: { compact?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="size-10 animate-pulse rounded-full bg-white/10" />;
  if (isSignedIn) return <UserButton />;

  return (
    <SignInButton mode="modal">
      <Button
        variant="ghost"
        className={cn(
          "h-9 font-bold text-slate-300 hover:bg-white/[0.07] hover:text-white",
          compact ? "w-full justify-between px-3 text-sm" : "px-4",
        )}
      >
        Најави се <ArrowRight className="size-3.5 text-lime-300" />
      </Button>
    </SignInButton>
  );
}

function Header({ section, setSection, configured, isAdmin }: { section: string; setSection: (value: string) => void; configured: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07131f]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-360 items-center justify-between px-5 lg:px-10">
        <Brand />
        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition",
                section === item.id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="hidden items-center gap-3 sm:flex">
          {isAdmin ? (
            <Button asChild className="bg-cyan-300 font-black text-slate-950 hover:bg-cyan-200">
              <Link href="/admin"><ShieldCheck /> Админ</Link>
            </Button>
          ) : null}
          <div className="text-right">
            <p className="text-xs text-slate-500">Турнирот започнува</p>
            <p className="font-mono text-sm font-bold text-lime-300">11 ЈУНИ · 2026</p>
          </div>
          {configured ? (
            <ClerkAuthControls />
          ) : (
            <Badge className="bg-amber-300/10 text-amber-200">Потребна е конфигурација</Badge>
          )}
        </div>
        <div className="flex items-center lg:hidden">
          <Button variant="ghost" size="icon" className="text-white" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
            <span className="sr-only">Отвори или затвори навигација</span>
          </Button>
        </div>
      </div>
      {open ? (
        <nav className="grid gap-1 border-t border-white/10 px-5 py-4 lg:hidden">
          {nav.map((item) => (
            <button key={item.id} onClick={() => { setSection(item.id); setOpen(false); }} className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-200 hover:bg-white/10">
              {item.label}
            </button>
          ))}
          {isAdmin ? (
            <Link href="/admin" className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-cyan-300">
              <ShieldCheck className="size-4" /> Админ
            </Link>
          ) : null}
          <div className="mt-2 border-t border-white/10 pt-3 sm:hidden">
            {configured ? (
              <ClerkAuthControls compact />
            ) : (
              <Badge className="bg-amber-300/10 text-amber-200">Потребна е конфигурација</Badge>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

function StatCard({ icon, label, value, note, accent }: { icon: React.ReactNode; label: string; value: string; note: string; accent: string }) {
  return (
    <Card className="border-white/10 bg-white/4.5 p-5 text-white shadow-none">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
          <p className="mt-1 text-sm text-slate-400">{note}</p>
        </div>
        <div className={cn("stat-icon-tile grid size-10 place-items-center rounded-xl", accent)}>{icon}</div>
      </div>
    </Card>
  );
}

function SignInRequired({
  section,
  configured,
}: {
  section: "Турнир" | "Натпревари" | "Фантази";
  configured: boolean;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Card className="w-full max-w-xl border-white/10 bg-white/4.5 p-8 text-center text-white shadow-none sm:p-10">
        <div className="mx-auto grid size-14 place-items-center bg-lime-300/10 text-lime-300">
          <LockKeyhole className="size-7" />
        </div>
        <h1 className="mt-6 text-3xl font-black">Најави се за пристап</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
          За да пристапиш до секцијата „{section}“ и да зачувуваш предвидувања,
          потребно е да се најавиш или да креираш бесплатна сметка.
        </p>
        {configured ? (
          <SignInButton mode="modal">
            <Button className="mx-auto mt-7 h-11 bg-lime-300 px-6 font-black text-slate-950 hover:bg-lime-200">
              <LogIn className="size-4" /> Најави се или регистрирај се
            </Button>
          </SignInButton>
        ) : (
          <Badge className="mx-auto mt-7 bg-amber-300/10 text-amber-200">
            Потребна е конфигурација на Clerk
          </Badge>
        )}
      </Card>
    </div>
  );
}

function Overview({
  setSection,
  nextMatches,
  stats,
  leaderboard,
  configured,
}: {
  setSection: (value: string) => void;
  nextMatches: Match[];
  stats: CurrentPlayerStats | null;
  leaderboard: LeaderboardEntry[];
  configured: boolean;
}) {
  const exactRate = stats?.predictions
    ? Math.round((stats.exactScores / stats.predictions) * 100)
    : 0;
  const currentEntry = leaderboard.find((player) => player.current);
  return (
    <div className="space-y-8">
      {!configured ? (
        <Card className="bg-amber-300/10 p-5 text-amber-100">
          <p className="font-black">Базата на податоци и автентикацијата не се конфигурирани.</p>
          <p className="mt-1 text-sm text-amber-100/70">
            Додајте ги Neon и Clerk променливите за да овозможите сметки и предвидувања.
          </p>
        </Card>
      ) : null}
      <section className="world-cup-hero relative isolate overflow-hidden px-6 py-8 sm:px-10 lg:min-h-110 lg:px-14 lg:py-12">
        <div className="relative z-10 grid h-full gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,.95fr)] lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-px w-10 bg-lime-300" />
              <p className="text-[11px] font-black uppercase tracking-[.22em] text-lime-300">САД · Канада · Мексико</p>
            </div>
            <h1 className="text-5xl font-black leading-[0.86] tracking-[-0.065em] text-white sm:text-7xl">
              ПОГОДИ ЈА ИДНИНАТА<br />
              <span className="hero-outline-text">СОСТАВИ ГО КОСТУРОТ.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-slate-300">
              Четириесет и осум репрезентации. Еден шампион. Предвиди ја секоја група, пополни ја нокаут-фазата и погоди го секој резултат пред почетокот.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="h-12 bg-lime-300 px-6 font-black text-slate-950 hover:bg-lime-200" onClick={() => setSection("Tournament")}>
                Состави го мојот костур <ArrowRight />
              </Button>
              <Button size="lg" variant="outline" className="h-12 bg-white/7 px-6 font-bold text-white hover:bg-white/12" onClick={() => setSection("Matches")}>
                Предвиди натпревари
              </Button>
            </div>
            <div className="mt-8 flex gap-7 text-xs">
              <div><b className="block text-xl font-black text-white">48</b><span className="uppercase tracking-widest text-slate-500">Репрезентации</span></div>
              <div><b className="block text-xl font-black text-white">104</b><span className="uppercase tracking-widest text-slate-500">Натпревари</span></div>
              <div><b className="block text-xl font-black text-lime-300">1</b><span className="uppercase tracking-widest text-slate-500">Шампион</span></div>
            </div>
          </div>

          <div className="relative hidden min-h-82.5 lg:block">
            <div className="absolute inset-x-0 top-1/2 h-px bg-linear-to-r from-transparent via-cyan-300/35 to-transparent" />
            <div className="absolute left-[8%] top-[18%] h-[64%] w-px bg-cyan-300/20" />
            <div className="absolute right-[8%] top-[18%] h-[64%] w-px bg-lime-300/20" />

            <div className="blue-hero-node absolute left-0 top-5 w-36 bg-[#0d1d2b]/95 p-3">
              <p className="text-[9px] font-black uppercase tracking-[.16em] text-slate-500">Групна фаза</p>
              <p className="mt-1 text-sm font-black text-white">12 групи</p>
              <p className="mt-1 text-[10px] text-cyan-300">11 јуни → 27 јуни</p>
            </div>
            <div className="blue-hero-node absolute bottom-5 left-0 w-36 bg-[#0d1d2b]/95 p-3">
              <p className="text-[9px] font-black uppercase tracking-[.16em] text-slate-500">Нокаут-фаза</p>
              <p className="mt-1 text-sm font-black text-white">32 репрезентации</p>
              <p className="mt-1 text-[10px] text-cyan-300">Секој избор е важен</p>
            </div>
            <div className="blue-hero-node absolute right-0 top-5 w-36 bg-[#0d1d2b]/95 p-3 text-right">
              <p className="text-[9px] font-black uppercase tracking-[.16em] text-slate-500">Полуфиналиња</p>
              <p className="mt-1 text-sm font-black text-white">Далас · Атланта</p>
              <p className="mt-1 text-[10px] text-lime-300">Четири најдобри</p>
            </div>
            <div id="blue-hero-final" className="blue-hero-final absolute bottom-5 right-0 w-36 bg-lime-300 p-3 text-right text-slate-950">
              <p className="text-[9px] font-black uppercase tracking-[.16em]">Финале</p>
              <p className="mt-1 text-sm font-black">Њујорк / Њу Џерси</p>
              <p className="mt-1 text-[10px] font-bold">19 јули · 2026</p>
            </div>

            <div className="blue-hero-core absolute left-1/2 top-1/2 grid size-44 -translate-x-1/2 -translate-y-1/2 place-items-center bg-[#07131f] shadow-[0_0_80px_rgba(190,242,100,.12)]">
              <div className="absolute inset-3 border border-white/8" />
              <div className="text-center">
                <Trophy className="mx-auto size-12 text-lime-300" strokeWidth={1.4} />
                <p className="mt-3 text-[10px] font-black uppercase tracking-[.28em] text-cyan-300">Worldie</p>
                <p className="text-4xl font-black tracking-[-.08em] text-white">20<span className="text-lime-300">26</span></p>
              </div>
            </div>

            <span className="absolute left-[28%] top-1/2 size-2 -translate-y-1/2 bg-cyan-300" />
            <span className="absolute right-[28%] top-1/2 size-2 -translate-y-1/2 bg-lime-300" />
            <p className="absolute bottom-[43%] left-1/2 -translate-x-1/2 translate-y-24 text-[9px] font-bold uppercase tracking-[.25em] text-slate-600">Твојот пат до славата</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={<Trophy className="size-5 text-lime-300" />} label="Вкупно поени" value={`${stats?.totalPoints ?? 0} поени`} note={stats?.rank ? `${stats.rank}${stats.totalPlayers ? ` од ${stats.totalPlayers}` : ""}` : "Најави се за да учествуваш"} accent="bg-lime-300/10" />
        <StatCard icon={<ShieldCheck className="size-5 text-violet-300" />} label="Турнирски костур" value={`${stats?.tournamentPoints ?? 0} поени`} note={stats?.tournamentSubmitted ? "Предвидувањето е испратено" : "Не е испратено"} accent="bg-violet-300/10" />
        <StatCard icon={<Award className="size-5 text-amber-300" />} label="Награди" value={`${stats?.awardPoints ?? 0} поени`} note={stats?.awardsSubmitted ? "Изборите се зачувани" : "Нема зачувани избори"} accent="bg-amber-300/10" />
        <StatCard icon={<Medal className="size-5 text-cyan-300" />} label="Поени од натпревари" value={`${stats?.matchPoints ?? 0} поени`} note={`${stats?.predictions ?? 0} предвидувања`} accent="bg-cyan-300/10" />
        <StatCard icon={<Zap className="size-5 text-amber-300" />} label="Точни резултати" value={String(stats?.exactScores ?? 0)} note={`${exactRate}% успешност`} accent="bg-amber-300/10" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <Card className="border-white/10 bg-white/4.5 p-6 text-white shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="mt-1 text-2xl font-black">Следни натпревари</h2>
            </div>
            <Button variant="ghost" className="text-slate-300" onClick={() => setSection("Matches")}>Види ги сите <ArrowRight /></Button>
          </div>
          <div className="mt-5 grid gap-3">
            {nextMatches.map((match) => (
              <div key={match.id} className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-black/15 p-4 sm:flex-row sm:items-center">
                <div className="w-24 shrink-0">
                  <p className="text-xs font-bold text-slate-400">{format(new Date(match.kickoff), "d MMM", { locale: mk })}</p>
                  <p className="text-sm text-slate-500">{format(new Date(match.kickoff), "HH:mm 'UTC'")}</p>
                </div>
                <div className="flex flex-1 items-center gap-3">
                  <TeamFlag team={match.home} size={30} />
                  <span className="font-bold">{match.home.name}</span>
                  <span className="text-xs font-black text-slate-600">ПРОТИВ</span>
                  <span className="font-bold">{match.away.name}</span>
                  <TeamFlag team={match.away} size={30} />
                </div>
                <Badge variant="outline" className="w-fit border-white/10 text-slate-400">
                  <Clock3 className="size-3" /> Се затвора {format(new Date(new Date(match.kickoff).getTime() - 10 * 60 * 1000), "d MMM, HH:mm 'UTC'", { locale: mk })}
                </Badge>
              </div>
            ))}
            {nextMatches.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Нема претстојни натпревари.</p> : null}
          </div>
        </Card>

        <Card className="border-white/10 bg-white/4.5 p-6 text-white shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-300">Твојата позиција</p>
              <h2 className="mt-1 text-2xl font-black">Табела</h2>
            </div>
            <span className="text-4xl font-black text-white/10">#{stats?.rank ?? "–"}</span>
          </div>
          <div className="mt-5 space-y-2">
            {leaderboard.slice(0, 4).map((player) => (
              <div key={player.rank} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5">
                <span className="w-5 text-sm font-black text-slate-500">{player.rank}</span>
                <Avatar className="size-8">
                  {player.avatarUrl ? <AvatarImage src={player.avatarUrl} alt="" /> : null}
                  <AvatarFallback className="bg-white/10 text-xs text-white">{player.initials}</AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm font-semibold">{player.name}</span>
                <span className="font-mono text-sm font-bold text-lime-300">{player.total}</span>
              </div>
            ))}
            {leaderboard.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Сè уште нема играчи со освоени поени.</p> : null}
          </div>
          {currentEntry ? <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4"><p className="text-sm font-bold text-cyan-200">Твојата моментална позиција е #{currentEntry.rank}.</p></div> : null}
        </Card>
      </section>
    </div>
  );
}

function MatchRow({
  match,
  data,
  signedIn,
  configured,
  currentTime,
}: {
  match: Match;
  data: MatchPredictionData;
  signedIn: boolean;
  configured: boolean;
  currentTime: string;
}) {
  const router = useRouter();
  const [home, setHome] = useState(data.current ? String(data.current.home) : "");
  const [away, setAway] = useState(data.current ? String(data.current.away) : "");
  const [saved, setSaved] = useState(Boolean(data.current));
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const finished =
    match.homeScore != null &&
    match.awayScore != null &&
    /finished|full time|after penalties|ft/i.test(match.status ?? "");
  const predictionClosed = new Date(currentTime).getTime() > new Date(match.kickoff).getTime() - 10 * 60 * 1000;
  const canSave = configured && signedIn && !predictionClosed && home !== "" && away !== "";
  const matchContext =
    match.stage === "group" || !match.stage
      ? `Group ${match.group ?? ""}`
      : matchStageLabels[match.stage];
  const save = () => {
    if (!canSave || pending || saved) return;
    setError("");
    startTransition(async () => {
      try {
        await saveMatchPrediction({
          matchId: match.id,
          homeScore: Number(home),
          awayScore: Number(away),
        });
        setSaved(true);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Предвидувањето не можеше да се зачува.");
      }
    });
  };

  const saveWhenLeavingMatch = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocusedElement = event.relatedTarget;
    if (
      nextFocusedElement instanceof Node &&
      event.currentTarget.contains(nextFocusedElement)
    ) {
      return;
    }
    save();
  };

  return (
    <Card
      onBlur={saveWhenLeavingMatch}
      className="gap-0 overflow-hidden border-white/10 bg-white/4.5 py-0 text-white shadow-none"
    >
      <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center">
        <div className="flex w-36 shrink-0 items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-white/5 text-slate-400"><CalendarDays className="size-5" /></div>
          <div>
            <p className="text-sm font-bold">{format(new Date(match.kickoff), "d MMM", { locale: mk })}</p>
            <p className="text-xs text-slate-500">{format(new Date(match.kickoff), "HH:mm 'UTC'")}</p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex items-center justify-end gap-2 text-right">
            <span className="font-bold">{match.home.name}</span><TeamFlag team={match.home} size={30} />
          </div>
          <div>
            {finished ? (
              <div className="flex items-center justify-center gap-2 font-mono text-xl font-black">
                <span className="grid size-11 place-items-center bg-lime-300/10 text-lime-200">{match.homeScore}</span>
                <span className="text-xs text-slate-600">:</span>
                <span className="grid size-11 place-items-center bg-lime-300/10 text-lime-200">{match.awayScore}</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Input aria-label={`Резултат за ${match.home.name}`} inputMode="numeric" maxLength={2} value={home} onChange={(event) => { setHome(event.target.value.replace(/\D/g, "")); setSaved(false); }} className="size-11 border-white/15 bg-black/20 p-0 text-center text-lg font-black" placeholder="–" />
                <span className="text-xs font-black text-slate-600">:</span>
                <Input aria-label={`Резултат за ${match.away.name}`} inputMode="numeric" maxLength={2} value={away} onChange={(event) => { setAway(event.target.value.replace(/\D/g, "")); setSaved(false); }} className="size-11 border-white/15 bg-black/20 p-0 text-center text-lg font-black" placeholder="–" />
              </div>
            )}
            <div className="mt-1.5 grid grid-cols-3 gap-1 text-center font-mono text-[9px] font-black text-slate-500">
              <span className="bg-white/5 px-1 py-0.5">{data.summary.home}%</span>
              <span className="bg-white/5 px-1 py-0.5">{data.summary.draw}%</span>
              <span className="bg-white/5 px-1 py-0.5">{data.summary.away}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TeamFlag team={match.away} size={30} /><span className="font-bold">{match.away.name}</span>
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center justify-between gap-3 md:w-56 md:justify-end">
          <div className="text-right">
            <p className={cn("text-xs font-bold", finished ? "text-lime-300" : "text-slate-400")}>
              {finished ? "Завршен" : predictionClosed ? "Предвидувањето е затворено" : `Се затвора ${format(new Date(new Date(match.kickoff).getTime() - 10 * 60 * 1000), "d MMM, HH:mm", { locale: mk })}`}
            </p>
            <p className="text-[11px] text-slate-600">{matchContext} · {match.venue}</p>
          </div>
          <div className="flex items-center gap-1">
            {!finished ? <Button
              aria-label={saved ? "Предвидувањето е зачувано" : "Зачувај предвидување"}
              title={!configured ? "Прво конфигурирајте ги Neon и Clerk" : !signedIn ? "Најави се за да зачуваш" : predictionClosed ? "Предвидувањата се затворени" : home === "" || away === "" ? "Внеси ги двата резултати" : saved ? "Предвидувањето е зачувано" : "Зачувај предвидување"}
              size="icon"
              disabled={!canSave || pending}
              onClick={save}
              className={cn(
                "bg-white/10 text-white disabled:bg-white/5 disabled:text-slate-700",
                saved && "!bg-cyan-300 !text-slate-950 hover:!bg-cyan-200",
              )}
            >
              <Check />
            </Button> : null}
            <Button aria-label={`Отвори ${match.home.name} против ${match.away.name}`} size="icon" onClick={() => setExpanded((value) => !value)} className={cn(expanded ? "bg-cyan-300 text-slate-950" : "bg-white/10 text-white hover:bg-cyan-300 hover:text-slate-950")}>
              {expanded ? <ChevronDown /> : <ChevronRight />}
            </Button>
          </div>
        </div>
      </div>
      {error ? <p className="px-5 pb-3 text-right text-xs font-bold text-red-300">{error}</p> : null}
      {expanded ? (
        <div className="border-t border-white/10 bg-black/15 px-5 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Предвидувања од играчите</p>
              <p className="mt-1 text-xs text-slate-600">Последни предвидувања на точен резултат од други Worldie26 играчи.</p>
            </div>
            <Badge variant="outline" className="border-white/10 text-slate-400">{data.summary.total} вкупно</Badge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {finished && data.current ? (
              <div className="flex items-center gap-3 border border-cyan-300/30 bg-cyan-300/[0.06] p-3">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-cyan-300/15 text-[10px] font-black text-cyan-200">
                    ЈАС
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-cyan-200">
                  Моето предвидување
                </span>
                <div className="flex items-center gap-1 font-mono font-black">
                  <span className="grid size-7 place-items-center bg-black/20">{data.current.home}</span>
                  <span className="text-slate-600">:</span>
                  <span className="grid size-7 place-items-center bg-black/20">{data.current.away}</span>
                </div>
              </div>
            ) : null}
            {data.players.map((prediction, predictionIndex) => (
              <div key={`${prediction.name}-${predictionIndex}`} className="flex items-center gap-3 border border-white/10 bg-white/[0.035] p-3">
                <Avatar className="size-8">
                  {prediction.avatarUrl ? <AvatarImage src={prediction.avatarUrl} alt="" /> : null}
                  <AvatarFallback className="bg-white/10 text-[10px] text-white">{prediction.initials}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-300">{prediction.name}</span>
                <div className="flex items-center gap-1 font-mono font-black">
                  <span className="grid size-7 place-items-center bg-black/20">{prediction.home}</span>
                  <span className="text-slate-600">:</span>
                  <span className="grid size-7 place-items-center bg-black/20">{prediction.away}</span>
                </div>
              </div>
            ))}
            {data.players.length === 0 && !(finished && data.current) ? <p className="col-span-full py-4 text-center text-sm text-slate-500">Сè уште нема други предвидувања.</p> : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function MatchGame({
  matches,
  predictions,
  signedIn,
  configured,
  currentTime,
}: {
  matches: Match[];
  predictions: Record<number, MatchPredictionData>;
  signedIn: boolean;
  configured: boolean;
  currentTime: string;
}) {
  const [mode, setMode] = useState<"group" | "round" | "knockout">("knockout");
  const [group, setGroup] = useState("A");
  const [round, setRound] = useState<1 | 2 | 3>(1);
  const [stage, setStage] = useState<(typeof knockoutStageOptions)[number]>("round_of_32");
  const visible = useMemo(
    () => mode === "group"
      ? matches.filter((match) => match.group === group)
      : mode === "round"
        ? matches.filter((match) => match.round === round)
        : matches.filter((match) => match.stage === stage),
    [group, matches, mode, round, stage],
  );
  return (
    <div>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Предвиди го секој натпревар</h1>
          <p className="mt-2 text-slate-400">2 поени за точен исход. 5 поени за точен резултат.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setMode("knockout")} className={mode === "knockout" ? "bg-lime-300 text-slate-950 hover:bg-lime-200" : "bg-white/10 text-slate-400"}>Knockout</Button>
          <Button size="sm" onClick={() => setMode("group")} className={mode === "group" ? "bg-lime-300 text-slate-950 hover:bg-lime-200" : "bg-white/10 text-slate-400"}>По група</Button>
          <Button size="sm" onClick={() => setMode("round")} className={mode === "round" ? "bg-lime-300 text-slate-950 hover:bg-lime-200" : "bg-white/10 text-slate-400"}>По коло</Button>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2 border-y border-white/8 py-4">
        {mode === "group"
          ? "ABCDEFGHIJKL".split("").map((item) => (
            <Button key={item} size="sm" variant="outline" onClick={() => setGroup(item)} className={group === item ? "border-lime-300 bg-lime-300/10 text-lime-300" : "border-white/10 bg-white/3 text-slate-500"}>Група {item}</Button>
          ))
          : mode === "round" ? ([1, 2, 3] as const).map((item) => (
            <Button key={item} size="sm" variant="outline" onClick={() => setRound(item)} className={round === item ? "border-lime-300 bg-lime-300/10 text-lime-300" : "border-white/10 bg-white/3 text-slate-500"}>Коло {item}</Button>
          ))
          : knockoutStageOptions.map((item) => (
            <Button key={item} size="sm" variant="outline" onClick={() => setStage(item)} className={stage === item ? "border-lime-300 bg-lime-300/10 text-lime-300" : "border-white/10 bg-white/3 text-slate-500"}>{matchStageLabels[item]}</Button>
          ))}
        <span className="ml-auto text-xs font-bold text-slate-500">{visible.length} натпревари</span>
      </div>
      <div className="mt-8 space-y-3">
        {visible.map((match) => <MatchRow key={match.id} match={match} data={predictions[match.id]} signedIn={signedIn} configured={configured} currentTime={currentTime} />)}
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/8 bg-white/3 p-4 text-sm text-slate-400">
        <CircleHelp className="mt-0.5 size-4 shrink-0 text-cyan-300" />
        Предвидувањата може да се менуваат до 10 минути пред почетокот. Сите времиња се прикажани во UTC.
      </div>
    </div>
  );
}

function Leaderboard({ players }: { players: LeaderboardEntry[] }) {
  return (
    <div>
      <Badge className="border-lime-300/30 bg-lime-300/10 text-lime-300"><Medal className="size-3" /> Табела во живо</Badge>
      <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Вкупна табела</h1>
      <p className="mt-2 text-slate-400">Заеднички поени од турнирот и предвидувањата на натпреварите. Избери играч за да го видиш целото турнирско предвидување.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="gap-0 overflow-hidden border-white/10 bg-white/4.5 py-0 text-white shadow-none">
          <div className="overflow-x-auto">
          <div className="grid min-w-175 grid-cols-[48px_1fr_90px_90px_100px_80px] border-b border-white/10 px-5 py-3 text-[10px] font-black uppercase tracking-[.14em] text-slate-500">
            <span>Место</span><span>Играч</span><span className="text-right">Турнир</span><span className="text-right">Награди</span><span className="text-right">Натпревари</span><span className="text-right">Вкупно</span>
          </div>
          {players.map((player) => (
            <div
              key={player.rank}
              className={cn("grid w-full min-w-175 grid-cols-[48px_1fr_90px_90px_100px_80px] items-center border-b border-white/5 px-5 py-4 text-left last:border-0", player.current && "bg-cyan-300/10")}
            >
              <span className={cn("font-black", player.rank <= 3 ? "text-lime-300" : "text-slate-500")}>#{player.rank}</span>
              <div className="flex items-center gap-3"><Avatar className="size-9">{player.avatarUrl ? <AvatarImage src={player.avatarUrl} alt="" /> : null}<AvatarFallback className={cn("text-xs font-bold", player.current ? "bg-cyan-300 text-slate-950" : "bg-white/10 text-white")}>{player.initials}</AvatarFallback></Avatar><span className="font-bold">{player.name}</span></div>
              <span className="text-right font-mono text-sm text-slate-400">{player.tournament}</span>
              <span className="text-right font-mono text-sm text-slate-400">{player.awards}</span>
              <span className="text-right font-mono text-sm text-slate-400">{player.matches}</span>
              <span className="text-right font-mono font-black text-white">{player.total}</span>
            </div>
          ))}
          {players.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">Сè уште нема резултати на табелата.</p> : null}
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="blue-points-card border-lime-300/20 bg-lime-300/10 p-6 text-white shadow-none">
            <Trophy className="size-7 text-lime-300" />
            <h3 className="mt-4 text-xl font-black">Систем на поени</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between text-slate-300"><span>Точен резултат</span><b className="text-lime-300">+5</b></div>
              <div className="flex justify-between text-slate-300"><span>Точен исход</span><b className="text-white">+2</b></div>
              <div className="flex justify-between text-slate-300"><span>Точна позиција на тим</span><b className="text-white">+2</b></div>
              <div className="flex justify-between text-slate-300"><span>Бонус за совршена група</span><b className="text-white">+2</b></div>
              <div className="flex justify-between text-slate-300"><span>Точен шампион</span><b className="text-lime-300">+20</b></div>
              <div className="flex justify-between text-slate-300"><span>Точна индивидуална награда</span><b className="text-amber-300">+10</b></div>
            </div>
          </Card>
          <Card className="border-white/10 bg-white/4.5 p-6 text-white shadow-none">
            <UserRound className="size-6 text-cyan-300" />
            <p className="mt-3 text-sm font-bold">{players.length} активни играчи</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Табелата се ажурира по завршувањето на секој натпревар.</p>
          </Card>
        </div>
      </div>
      <PublicTournamentPredictions players={players} className="mt-8" />
    </div>
  );
}

function FantasyHub({ data }: { data: AppData }) {
  const [tab, setTab] = useState<"team" | "awards">("team");
  return (
    <div>
      <div className="mb-7 flex border-b border-white/10">
        <button
          type="button"
          onClick={() => setTab("team")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-black transition",
            tab === "team"
              ? "border-lime-300 text-lime-300"
              : "border-transparent text-slate-500 hover:text-white",
          )}
        >
          <UserRound className="size-4" /> Фантази тим
        </button>
        <button
          type="button"
          onClick={() => setTab("awards")}
          className={cn(
            "flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-black transition",
            tab === "awards"
              ? "border-amber-300 text-amber-300"
              : "border-transparent text-slate-500 hover:text-white",
          )}
        >
          <Award className="size-4" /> Награди
          {data.awardPrediction ? <Check className="size-3.5" /> : null}
        </button>
      </div>
      {tab === "team" ? (
        <FantasyTeamGame
          players={data.awardPlayers}
          savedTeam={data.fantasyTeam}
          context={data.fantasyContext}
          publicTeams={data.publicFantasyTeams}
        />
      ) : (
        <AwardsGame
          players={data.awardPlayers}
          savedPrediction={data.awardPrediction}
          currentTime={data.currentTime}
        />
      )}
    </div>
  );
}

export function Dashboard({ data }: { data: AppData }) {
  const [section, setSection] = useState("Dashboard");
  return (
    <div className="theme-shell min-h-screen bg-[#07131f] text-white">
      <Header section={section} setSection={setSection} configured={data.configured} isAdmin={data.isAdmin} />
      <main className="mx-auto max-w-360 px-5 py-8 lg:px-10 lg:py-10">
        {section === "Dashboard" ? <Overview setSection={setSection} nextMatches={data.nextMatches} stats={data.currentPlayer} leaderboard={data.leaderboard} configured={data.configured} /> : null}
        {section === "Tournament"
          ? data.signedIn
            ? <TournamentGame signedIn configured={data.configured} savedPrediction={data.tournamentPrediction} tournamentLockTime={data.tournamentLockTime} tournamentLocked={data.tournamentLocked} otherPlayers={data.leaderboard.filter((player) => !player.current)} />
            : <SignInRequired section="Турнир" configured={data.configured} />
          : null}
        {section === "Fantasy"
          ? data.signedIn
            ? <FantasyHub data={data} />
            : <SignInRequired section="Фантази" configured={data.configured} />
          : null}
        {section === "Matches"
          ? data.signedIn
            ? <MatchGame matches={data.matches} predictions={data.matchPredictions} signedIn configured={data.configured} currentTime={data.currentTime} />
            : <SignInRequired section="Натпревари" configured={data.configured} />
          : null}
        {section === "Leaderboard" ? <Leaderboard players={data.leaderboard} /> : null}
      </main>
      <footer className="mx-auto flex max-w-360 flex-col justify-between gap-4 border-t border-white/10 px-5 py-8 text-xs text-slate-600 sm:flex-row lg:px-10">
        <span>WORLDIE26 · 9spasovski@gmail.com</span>
        <span>САД · Канада · Мексико · 11 јуни — 19 јули 2026</span>
      </footer>
    </div>
  );
}
