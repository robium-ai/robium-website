// Column layout for the catalog belt.
//
// The belt is three rows tall and scrolls horizontally. Each column is one of a
// few shapes whose row spans total exactly 3 — a full-height category marker, a
// stack of three small skill tiles, or a taller skill tile over a strip of its
// tools. That mix is what makes it read as a bento rather than a row of equal
// cards, and the totalling-3 rule is what keeps the rows aligned along the belt.

import integrations from '../data/integrations.json';
import { byName, compact, groups, pillarCount, teaser, allSkills } from './catalog';
import { brandedTags, type Pill } from './brands';

export type Tile =
  | { kind: 'stat'; span: 1 | 2 | 3; value: string; caption: string; sub: string }
  | { kind: 'cat'; span: 3; title: string; blurb: string; count: number;
      skills: { name: string; entry: boolean }[] }
  | { kind: 'skill'; span: 1 | 2; name: string; desc: string }
  | { kind: 'chips'; span: 1 | 2 | 3; label: string; chips: Pill[] }
  | { kind: 'agent'; span: 2; title: string; blurb: string };

export type Column = { tiles: Tile[] };

const skillTile = (name: string, span: 1 | 2): Tile => {
  const s = byName.get(name)!;
  return {
    kind: 'skill',
    span,
    name,
    // A one-row tile cannot hold a teaser, so it shows a shorter slice of the
    // same real sentence — never a rewritten one.
    desc: span === 1 ? compact(s.description) : teaser(s.description),
  };
};

const tagTile = (name: string): Tile => ({
  kind: 'chips',
  span: 1,
  label: `${name} · tools`,
  chips: brandedTags(name),
});

export function buildColumns(): Column[] {
  const columns: Column[] = [];

  columns.push({
    tiles: [
      { kind: 'stat', span: 2, value: String(allSkills.length),
        caption: 'hand-crafted, versioned skills',
        sub: `${pillarCount} categories · MIT` },
      { kind: 'chips', span: 1, label: 'Works with', chips: [{ text: 'Claude Code', logo: null }] },
    ],
  });

  for (const g of groups) {
    columns.push({
      tiles: [
        { kind: 'cat', span: 3, title: g.title, blurb: g.blurb, count: g.names.length,
          skills: g.names.map((name, i) => ({ name, entry: i === 0 && g.hasEntry })) },
      ],
    });

    // Three small skill tiles, then the remainder as a taller tile over its
    // tools. A group of exactly three has no remainder, so its column of tools
    // stands in — never a padded column with a hole in it.
    const [head, rest] = [g.names.slice(0, 3), g.names.slice(3)];
    columns.push({ tiles: head.map((n) => skillTile(n, 1)) });

    if (rest.length > 0) {
      for (const name of rest) {
        columns.push({ tiles: [skillTile(name, 2), tagTile(name)] });
      }
    } else {
      columns.push({ tiles: head.map(tagTile) });
    }
  }

  columns.push({
    tiles: [
      { kind: 'agent', span: 2, title: 'robium-architect',
        blurb: 'Turns a plain-language ask into a real stack decision — which sim, which viewer, which data source — before any skill fires.' },
      { kind: 'chips', span: 1, label: 'Ships as', chips: [{ text: '1 subagent', logo: null }] },
    ],
  });

  columns.push({
    tiles: [
      { kind: 'chips', span: 3, label: `Integrations · ${integrations.length}`,
        chips: integrations.map((i) => ({ text: i.name, logo: i.file })) },
    ],
  });

  // The rows only stay aligned while every column totals three. Getting this
  // wrong is invisible at the head of the belt and obvious halfway along it, so
  // it fails the build instead.
  const bad = columns
    .map((c, i) => ({ i, sum: c.tiles.reduce((n, t) => n + t.span, 0) }))
    .filter((c) => c.sum !== 3);
  if (bad.length > 0) {
    throw new Error(
      `Catalog belt: column(s) ${bad.map((b) => `${b.i} (spans total ${b.sum})`).join(', ')} ` +
        `do not total 3 rows — the belt would misalign.`
    );
  }

  return columns;
}
