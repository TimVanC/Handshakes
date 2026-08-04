/**
 * Production NBA schedule. Days 1–20 are frozen aired history; every later
 * entry is an authored puzzle in uninterrupted release order.
 */
export const ROSTER: string[] = [
  "Shareef Abdur-Rahim",
  "Zach Randolph",
  "Lou Williams",
  "Marcus Camby",
  "Antawn Jamison",
  "Vince Carter",
  "Manu Ginóbili",
  "Robert Horry",
  "Baron Davis",
  "Matt Barnes",
  "Chauncey Billups",
  "Jamal Crawford",
  "Ish Smith",
  "Moses Malone",
  "Joe Johnson",
  "Chucky Brown",
  "Tracy McGrady",
  "Shawn Marion",
  "Kobe Bryant",
  "Allen Iverson", // last frozen aired day (2026-08-03)
  "Gary Payton",
  "Rick Barry",
  "Joe Smith",
  "Stephon Marbury",
  "Garrett Temple",
  "Earl Boykins",
  "Kevin Ollie",
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
  "Rasual Butler",
  "Jeff Green",
  "Tony Delk",
  "Jodie Meeks",
  "Keyon Dooling",
  "Trevor Ariza",
  "Quincy Acy",
  "Chris Duhon",
  "Corey Brewer",
  "Jarvis Hayes",
  "Steve Blake",
  "Reggie Bullock",
  "Michael Doleac",
  "Gerald Green",
  "Brandon Rush",
  "Carlos Arroyo",
  "Jared Dudley",
  "Ronnie Brewer",
  "Eddie House",
  "Jason Smith",
  "D.J. Augustin",
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
