// Shared catalog derivation for every component that renders skills.
//
// skills.json is generated from the robium-plugin repo at build time;
// pillars.json and skill-tags.json are hand-maintained. Both the skill table
// and the catalog belt read the catalog through here so they can never disagree
// about grouping, ordering, or how a description is shortened.

import skills from '../data/skills.json';
import pillars from '../data/pillars.json';
import tagsJson from '../data/skill-tags.json';

export type Skill = { name: string; description: string; version: string };
export type Group = {
  title: string;
  names: string[];
  blurb: string;
  /** Pillars lead with an entry-point skill; the derived upkeep group has none. */
  hasEntry: boolean;
};

export const allSkills = skills as Skill[];
export const byName = new Map(allSkills.map((s) => [s.name, s]));

// A pillar naming a missing skill is always a bug (renamed or removed
// upstream) — fail the build rather than silently dropping it from the page.
const missing = pillars.flatMap((p) => p.skills.filter((n) => !byName.has(n)));
if (missing.length > 0) {
  throw new Error(
    `Skill mismatch: ${missing.join(', ')} named in src/data/pillars.json ` +
      `but missing from src/data/skills.json (generated from robium repo).`
  );
}

// Pillar order first; any skill in no pillar lands in a derived "Catalog
// upkeep" group so a newly added skill never silently vanishes from the page.
// That group's blurb is authored here because pillars.json has no entry for it.
const pillared = new Set(pillars.flatMap((p) => p.skills));
const leftovers = allSkills.filter((s) => !pillared.has(s.name)).map((s) => s.name);

export const groups: Group[] = [
  ...pillars.map((p) => ({ title: p.title, names: p.skills, blurb: p.blurb, hasEntry: true })),
  ...(leftovers.length
    ? [
        {
          title: 'Catalog upkeep',
          names: leftovers,
          blurb: 'Skills that maintain the catalog itself.',
          hasEntry: false,
        },
      ]
    : []),
];

/** Number of real pillars, excluding the derived upkeep group. */
export const pillarCount = pillars.length;

export const tagsFor = (name: string): string[] =>
  (tagsJson as Record<string, string[]>)[name] ?? [];

// The table shows a terse teaser — the description's own lead-in clause before
// the first colon (most descriptions are "lead-in: details"). A lead-in that is
// just the tool's name ("NVIDIA Isaac Sim") carries the start of the detail
// clause instead. Always the skill's real text, only truncated; the full
// description lives on GitHub.
export const teaser = (text: string): string => {
  const idx = text.indexOf(':');
  if (idx === -1) return text.split(/(?<=\.)\s/)[0];
  const head = text.slice(0, idx).trim();
  if (head.length >= 40) return head;
  const rest = text.slice(idx + 1).trim().split(/(?<=\.)\s/)[0];
  const cut = rest.length > 90 ? rest.slice(0, 90).replace(/\s+\S*$/, '') + '…' : rest;
  return `${head}: ${cut}`;
};

/**
 * A verbatim opening slice for tiles too small to hold a teaser. Cuts on a word
 * boundary and never rewrites — a short tile shows less of the real sentence,
 * it does not paraphrase it.
 */
export const compact = (text: string, max = 62): string =>
  text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, '').replace(/[,;:.—-]+$/, '') + '…';
