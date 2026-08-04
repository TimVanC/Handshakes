/**
 * The daily schedule: ROSTER[day - 1] is that day's answer.
 *
 * Days 1–9 map to the puzzles already authored in puzzles.ts. Every later
 * name is QUEUED — it goes live automatically the moment a puzzle with that
 * exact answer lands in puzzles.ts; until then the day falls back to cycling
 * the verified pool (see puzzleForDay in App). Names must match the puzzle's
 * `answer` (matching is case- and accent-insensitive).
 *
 * Curation: the user's hand-picked stars-with-mileage list, interleaved with
 * the certified deep-cut journeymen (8–13 franchises, per APBR/BR leaders) so
 * every week mixes household names with true "who WAS that guy" pulls.
 * Ish Smith — the all-time record holder, 13 franchises — lands on day 13.
 */
export const ROSTER: string[] = [
  // ---- days 1-9: puzzles already built (1-2 already played) ----
  "Shareef Abdur-Rahim",
  "Zach Randolph",
  "Lou Williams",
  "Marcus Camby",
  "Antawn Jamison",
  "Vince Carter",
  "Manu Ginóbili",
  "Robert Horry", // day 8 — seven rings, never an All-Star
  "Baron Davis", // day 9 — 6 franchises, the "We Believe" Warrior
  "Matt Barnes", // day 10 — 9 franchises, a ring at the very end
  "Chauncey Billups",
  "Jamal Crawford",
  "Ish Smith", // 13 franchises on day 13
  "Moses Malone",
  "Joe Johnson",
  "Chucky Brown",
  "Tracy McGrady",
  "Shawn Marion",
  "Kobe Bryant", // day 19 — swapped down from day 9 (a two-team star, not a journeyman)
  "Allen Iverson",
  "Rasheed Wallace",
  "Garrett Temple", // day 22 — 12 franchises; owner swap 2026-08-03
  "Earl Boykins", // day 23 — 10 franchises at 5'5"; owner swap 2026-08-03 (Payton → day 41)
  "Jim Jackson", // 12 franchises (moved from day 9 to make room for Baron Davis)
  "Joe Smith",
  "Kevin Ollie", // day 26 — 11+ franchises; owner swap 2026-08-03
  "Stephon Marbury",
  "Ray Allen",
  "Glen Rice",
  "D.J. Augustin",
  "Jason Kidd",
  "Rod Strickland",
  "Jeff Green",
  "Dennis Rodman",
  "Mark Jackson",
  "Mike James",
  "Bob McAdoo",
  "Tim Hardaway",
  "Chris Webber",
  "Rajon Rondo",
  "Gary Payton", // day 41 — swapped down from day 23
  "Adrian Dantley",
  "Sam Cassell",
  "Drew Gooden",
  "Grant Hill",
  "Jerry Stackhouse",
  "Damon Jones",
  "Kevin Willis",
  "Aaron Williams",
  "Dikembe Mutombo",
  "Kenny Anderson",
  "Mark Bryant",
  "Juwan Howard",
  "Benoit Benjamin",
  "Larry Hughes",
  "Tyrone Corbin",
  "Stephen Jackson",
  "Eddie House",
  "Russell Westbrook",
  "Tony Massenburg", // 15 franchises (moved from day 10 to make room for Matt Barnes)
  "Brevin Knight",
  "Chris Paul",
  "Shaun Livingston",
  "Kurt Thomas",
  "Kyrie Irving",
  "Donyell Marshall",
  "Theo Ratliff",
  "Paul George",
  "Nazr Mohammed",
  "Mikki Moore",
  "Jimmy Butler",
  "Trevor Ariza",
  "Dennis Johnson",
  "Dwight Howard",
  "Marcus Morris",
  "Carmelo Anthony",
  "JaVale McGee",
  "Mitch Richmond",
  "Amar'e Stoudemire",
  "Gerald Green",
  "Latrell Sprewell",
  "Deron Williams",
  "Jared Dudley",
  "Terry Porter",
  "Metta World Peace",
  "Corey Brewer",
  "Dale Ellis",
  "Dave Bing",
  "Nate Archibald",
  "Earl Monroe",
  "Connie Hawkins",
  "Robert Parish",
  "Rick Barry", // displaced from day 8 by Horry
  // ---- days 94-103: duplicate-screened and randomized 2026-08-03 ----
  "Mike Muscala",
  "Reggie Evans",
  "Wayne Ellington",
  "Robin Lopez",
  "Omri Casspi",
  "Austin Rivers",
  "Anthony Tolliver",
  "Delon Wright",
  "Channing Frye",
  "James Johnson",
  // ---- duplicate-screened, randomized and authored 2026-08-03 ----
  "Rasual Butler",
  "Tony Delk",
  "Jodie Meeks",
  "Keyon Dooling",
  "Quincy Acy",
  "Chris Duhon",
  "Jarvis Hayes",
  "Steve Blake",
  "Reggie Bullock",
  "Michael Doleac",
  "Brandon Rush",
  "Carlos Arroyo",
  "Ronnie Brewer",
  "Jason Smith",
  "Anthony Parker",
  "Walter McCarty",
  "Alan Anderson",
  "Jason Kapono",
  "Luther Head",
  "Willie Green",
  "Francisco García",
  "Dahntay Jones",
  "Marquis Daniels",
  "Ronnie Price",
];

/** case/accent-insensitive comparison key */
export function rosterKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
