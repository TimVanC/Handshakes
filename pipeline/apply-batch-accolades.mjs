#!/usr/bin/env node
/** Attach verified covered accolades to the exact 2026-08 batch stint. */
import fs from "node:fs";

const rules = {
  nfl: {
    "Jerick McKinnon": [["KC",2022,"champion"],["KC",2023,"champion"]],
    "C.J. Anderson": [["DEN",2014,"pro_bowl"],["DEN",2015,"champion"]],
    "Emmanuel Sanders": [["DEN",2014,"pro_bowl"],["DEN",2015,"champion"],["DEN",2016,"pro_bowl"]],
    "Delanie Walker": [["TEN",2015,"pro_bowl"],["TEN",2016,"pro_bowl"],["TEN",2017,"pro_bowl"]],
    "LeGarrette Blount": [["NE",2014,"champion"],["NE",2016,"champion"],["PHI",2017,"champion"]],
    "Latavius Murray": [["LV",2015,"pro_bowl"]],
    "Benjamin Watson": [["NE",2004,"champion"]],
    "Golden Tate": [["SEA",2013,"champion"],["DET",2014,"pro_bowl"]],
    "Martellus Bennett": [["CHI",2014,"pro_bowl"],["NE",2016,"champion"]],
    "Cordarrelle Patterson": [["MIN",2013,"pro_bowl"],["MIN",2013,"all_pro"],["MIN",2016,"pro_bowl"],["MIN",2016,"all_pro"],["NE",2018,"champion"],["CHI",2019,"pro_bowl"],["CHI",2019,"all_pro"],["CHI",2020,"pro_bowl"],["CHI",2020,"all_pro"]],
    "Jared Cook": [["LV",2018,"pro_bowl"],["NO",2019,"pro_bowl"]],
    "Kyle Rudolph": [["MIN",2012,"pro_bowl"],["MIN",2017,"pro_bowl"]],
    "Danny Amendola": [["NE",2014,"champion"],["NE",2016,"champion"]],
    "Chris Ivory": [["NYJ",2015,"pro_bowl"]],
  },
  mlb: {
    "Steve Pearce": [["BOS",2018,"champion"],["BOS",2018,"ws_mvp"]],
    "Coco Crisp": [["BOS",2007,"champion"]],
    "Fernando Rodney": [["TB",2012,"all_star"],["TB",2012,"reliever_award"],["SEA",2014,"all_star"],["SD",2016,"all_star"],["WSH",2019,"champion"]],
    "Arthur Rhodes": [["CIN",2010,"all_star"],["STL",2011,"champion"]],
    "Matt Stairs": [["PHI",2008,"champion"]],
    "Bartolo Colón": [["CLE",1998,"all_star"],["LAA",2005,"all_star"],["LAA",2005,"cy_young"],["OAK",2013,"all_star"],["NYM",2016,"all_star"]],
    "José Iglesias": [["DET",2015,"all_star"]],
    "Juan Pierre": [["MIA",2003,"champion"]],
    "Bronson Arroyo": [["BOS",2004,"champion"],["CIN",2006,"all_star"],["CIN",2010,"gold_glove"]],
    "Tyler Clippard": [["WSH",2011,"all_star"],["WSH",2014,"all_star"]],
    "Marlon Byrd": [["CHC",2010,"all_star"]],
    "Jesse Chavez": [["ATL",2021,"champion"]],
    "Jonny Gomes": [["BOS",2013,"champion"]],
    "Jeff Francoeur": [["ATL",2007,"gold_glove"]],
    "Cameron Maybin": [["HOU",2017,"champion"]],
    "Eduardo Escobar": [["ARI",2021,"all_star"]],
    "Pat Neshek": [["STL",2014,"all_star"],["PHI",2017,"all_star"]],
    "Sergio Romo": [["SF",2010,"champion"],["SF",2012,"champion"],["SF",2013,"all_star"],["SF",2014,"champion"]],
  },
};

const labels = {
  champion: "champion", pro_bowl: "Pro Bowl", all_pro: "First-Team All-Pro",
  all_star: "All-Star", ws_mvp: "World Series MVP", cy_young: "Cy Young",
  gold_glove: "Gold Glove", reliever_award: "Reliever of the Year",
};

for (const [sport, byPlayer] of Object.entries(rules)) {
  const file = sport === "nfl" ? "src/data/nfl/puzzles.ts" : "src/data/mlb/puzzles.ts";
  let source = fs.readFileSync(file, "utf8");
  for (const [answer, awards] of Object.entries(byPlayer)) {
    const answerToken = source.indexOf(`answer: "${answer}"`);
    if (answerToken < 0) throw new Error(`${sport}: missing ${answer}`);
    const answerAt = source.lastIndexOf("\n", answerToken) + 1;
    const nextToken = source.indexOf("answer: ", answerToken + 8);
    const nextAnswer = nextToken < 0 ? -1 : source.lastIndexOf("\n", nextToken) + 1;
    const objectEnd = nextAnswer < 0 ? source.length : nextAnswer;
    let player = source.slice(answerAt, objectEnd)
      .replace(/^        accolades: \[.*\],\r?\n/gm, "")
      .replace(/^    accolades: \[.*\],\r?\n/gm, "");
    const stints = [...player.matchAll(/^      \{\r?\n        franchise: "([^"]+)",[\s\S]*?^      \},/gm)];
    const grouped = new Map();
    for (const [franchise, year, type] of awards) {
      const stint = stints.find((match) => {
        if (match[1] !== franchise) return false;
        const start = +(match[0].match(/startYear: (\d+)/)?.[1] ?? NaN);
        const end = +(match[0].match(/endYear: (\d+)/)?.[1] ?? NaN);
        return year >= start && year <= end;
      });
      if (!stint) throw new Error(`${answer}: no ${franchise} stint containing ${year}`);
      const key = stint.index;
      if (!grouped.has(key)) grouped.set(key, { match: stint, counts: new Map() });
      const counts = grouped.get(key).counts;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    for (const { match, counts } of [...grouped.values()].sort((a,b)=>b.match.index-a.match.index)) {
      let stint = match[0];
      const value = `[${[...counts].map(([type,count]) => `{ type: "${type}", count: ${count} }`).join(", ")}]`;
      if (/^        accolades:/m.test(stint)) stint = stint.replace(/^        accolades:.*$/m, `        accolades: ${value},`);
      else stint = stint.replace(/^(        jerseyNumber:.*)$/m, `$1\n        accolades: ${value},`);
      player = player.slice(0, match.index) + stint + player.slice(match.index + match[0].length);
    }
    const totals = new Map();
    for (const [, , type] of awards) totals.set(type, (totals.get(type) ?? 0) + 1);
    const summary = [...totals].map(([type,count]) => {
      const label = type === "champion" ? (sport === "nfl" ? "Super Bowl champion" : "World Series champion") : labels[type];
      return `"${count}× ${label}"`;
    }).join(", ");
    if (!/^    accolades:/m.test(player)) player = player.replace(/^(    answer:.*)$/m, `$1\n    accolades: [${summary}],`);
    source = source.slice(0, answerAt) + player + source.slice(objectEnd);
  }
  fs.writeFileSync(file, source);
  console.log(`${sport}: verified batch accolades applied`);
}
