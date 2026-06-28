export type Team = {
  code: string;
  name: string;
  flag: string;
};

export type TournamentGroup = {
  id: string;
  teams: Team[];
};

export type Match = {
  id: number;
  stage?: "group" | "round_of_32" | "round_of_16" | "quarter_final" | "semi_final" | "third_place" | "final";
  group?: string | null;
  round?: 1 | 2 | 3 | null;
  home: Team;
  away: Team;
  kickoff: string;
  venue: string;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string;
};

export const TOURNAMENT_PREDICTION_LOCK_TIME = "2026-06-12T22:00:00Z";

const team = (code: string, name: string, flag: string): Team => ({
  code,
  name,
  flag,
});

export const groups: TournamentGroup[] = [
  { id: "A", teams: [team("MEX", "Мексико", "🇲🇽"), team("RSA", "Јужна Африка", "🇿🇦"), team("KOR", "Јужна Кореја", "🇰🇷"), team("CZE", "Чешка", "🇨🇿")] },
  { id: "B", teams: [team("CAN", "Канада", "🇨🇦"), team("BIH", "Босна и Херцеговина", "🇧🇦"), team("QAT", "Катар", "🇶🇦"), team("SUI", "Швајцарија", "🇨🇭")] },
  { id: "C", teams: [team("BRA", "Бразил", "🇧🇷"), team("MAR", "Мароко", "🇲🇦"), team("HAI", "Хаити", "🇭🇹"), team("SCO", "Шкотска", "🏴")] },
  { id: "D", teams: [team("USA", "Соединети Американски Држави", "🇺🇸"), team("PAR", "Парагвај", "🇵🇾"), team("AUS", "Австралија", "🇦🇺"), team("TUR", "Турција", "🇹🇷")] },
  { id: "E", teams: [team("GER", "Германија", "🇩🇪"), team("CUW", "Курасао", "🇨🇼"), team("CIV", "Брегот на Слоновата Коска", "🇨🇮"), team("ECU", "Еквадор", "🇪🇨")] },
  { id: "F", teams: [team("NED", "Холандија", "🇳🇱"), team("JPN", "Јапонија", "🇯🇵"), team("SWE", "Шведска", "🇸🇪"), team("TUN", "Тунис", "🇹🇳")] },
  { id: "G", teams: [team("BEL", "Белгија", "🇧🇪"), team("EGY", "Египет", "🇪🇬"), team("IRN", "Иран", "🇮🇷"), team("NZL", "Нов Зеланд", "🇳🇿")] },
  { id: "H", teams: [team("ESP", "Шпанија", "🇪🇸"), team("CPV", "Зелен ’Рт", "🇨🇻"), team("KSA", "Саудиска Арабија", "🇸🇦"), team("URU", "Уругвај", "🇺🇾")] },
  { id: "I", teams: [team("FRA", "Франција", "🇫🇷"), team("SEN", "Сенегал", "🇸🇳"), team("IRQ", "Ирак", "🇮🇶"), team("NOR", "Норвешка", "🇳🇴")] },
  { id: "J", teams: [team("ARG", "Аргентина", "🇦🇷"), team("ALG", "Алжир", "🇩🇿"), team("AUT", "Австрија", "🇦🇹"), team("JOR", "Јордан", "🇯🇴")] },
  { id: "K", teams: [team("POR", "Португалија", "🇵🇹"), team("COD", "ДР Конго", "🇨🇩"), team("UZB", "Узбекистан", "🇺🇿"), team("COL", "Колумбија", "🇨🇴")] },
  { id: "L", teams: [team("ENG", "Англија", "🏴"), team("CRO", "Хрватска", "🇭🇷"), team("GHA", "Гана", "🇬🇭"), team("PAN", "Панама", "🇵🇦")] },
];

export const officialGroupRankingOverrides: Record<string, string[]> = {
  A: ["MEX", "RSA", "KOR", "CZE"],
  F: ["NED", "JPN", "SWE", "TUN"],
  G: ["BEL", "EGY", "IRN", "NZL"],
};

export const byCode = new Map(groups.flatMap((group) => group.teams).map((item) => [item.code, item]));
const getTeam = (code: string) => byCode.get(code)!;

export const upcomingMatches: Match[] = [
  { id: 1, group: "A", round: 1, home: getTeam("MEX"), away: getTeam("RSA"), kickoff: "2026-06-11T19:00:00Z", venue: "Mexico City" },
  { id: 2, group: "A", round: 1, home: getTeam("KOR"), away: getTeam("CZE"), kickoff: "2026-06-12T02:00:00Z", venue: "Guadalajara" },
  { id: 3, group: "B", round: 1, home: getTeam("CAN"), away: getTeam("BIH"), kickoff: "2026-06-12T19:00:00Z", venue: "Toronto" },
  { id: 4, group: "D", round: 1, home: getTeam("USA"), away: getTeam("PAR"), kickoff: "2026-06-13T01:00:00Z", venue: "Los Angeles" },
  { id: 5, group: "C", round: 1, home: getTeam("HAI"), away: getTeam("SCO"), kickoff: "2026-06-13T19:00:00Z", venue: "Boston" },
  { id: 6, group: "D", round: 1, home: getTeam("AUS"), away: getTeam("TUR"), kickoff: "2026-06-13T22:00:00Z", venue: "Vancouver" },
];
