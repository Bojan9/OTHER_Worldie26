import { updateMatchResult } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAdminData } from "@/lib/admin-data";

const stageLabels = {
  group: "Група",
  round_of_32: "Шеснаесетфинале",
  round_of_16: "Осминафинале",
  quarter_final: "Четвртфинале",
  semi_final: "Полуфинале",
  third_place: "Трето место",
  final: "Финале",
} as const;

const skopjeDateTimeFormatter = new Intl.DateTimeFormat("mk-MK", {
  timeZone: "Europe/Skopje",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export default async function AdminMatchesPage() {
  const data = await getAdminData();
  const teamName = new Map(data.teams.map((team) => [team.id, team.name]));
  const now = data.currentTime.getTime();

  return (
    <>
      <h2 className="text-3xl font-black">Резултати од натпревари</h2>
      <p className="mt-1 text-sm text-slate-400">
        Зачувувањето резултат го затвора натпреварот, ги бодува сите предвидувања, ја ажурира групната табела и ги продолжува учесниците во нокаут-фазата.
      </p>
      <div className="mt-6 space-y-3">
        {data.matches.map((match) => {
          const started = match.kickoff.getTime() <= now;
          return (
            <form key={match.id} action={updateMatchResult}>
              <fieldset disabled={!started}>
                <Card className="grid gap-3 bg-white/4.5 p-4 text-white disabled:opacity-50 lg:grid-cols-[100px_150px_1fr_72px_72px_1fr_170px_auto] lg:items-center">
                  <input type="hidden" name="matchId" value={match.id} />
                  <div>
                    <p className="font-black">M{match.id}</p>
                    <p className="text-[10px] uppercase text-slate-500">{stageLabels[match.stage]}</p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {skopjeDateTimeFormatter.format(match.kickoff)} Skopje
                    <br />
                    {started ? (match.complete ? "Резултатот е зачуван" : "Достапно") : "Заклучено до почетокот"}
                  </div>
                  <select name="homeTeamId" defaultValue={match.homeTeamId ?? ""} className="h-9 bg-[#0b1a28] px-3 text-sm font-bold outline-none">
                    <option value="">Домаќин ќе се одреди</option>
                    {data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                  <Input name="homeScore" type="number" min={0} max={30} defaultValue={match.homeScore ?? ""} required className="bg-black/20 text-center font-black" />
                  <Input name="awayScore" type="number" min={0} max={30} defaultValue={match.awayScore ?? ""} required className="bg-black/20 text-center font-black" />
                  <select name="awayTeamId" defaultValue={match.awayTeamId ?? ""} className="h-9 bg-[#0b1a28] px-3 text-sm font-bold outline-none">
                    <option value="">Гостин ќе се одреди</option>
                    {data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                  <select name="winnerTeamId" defaultValue={match.winnerTeamId ?? ""} className="h-9 bg-[#0b1a28] px-3 text-sm outline-none">
                    <option value="">Победник според резултатот</option>
                    {match.homeTeamId ? <option value={match.homeTeamId}>{teamName.get(match.homeTeamId)}</option> : null}
                    {match.awayTeamId ? <option value={match.awayTeamId}>{teamName.get(match.awayTeamId)}</option> : null}
                  </select>
                  <Button className="bg-cyan-300 font-black text-slate-950 hover:bg-cyan-200">Зачувај резултат</Button>
                </Card>
              </fieldset>
            </form>
          );
        })}
      </div>
    </>
  );
}
