# Catalog belt — three-row bento marquee under the hero (2026-07-20)

Approved via interactive mockups; this doc records the decisions and the two
non-obvious constraints so the implementation has a fixed reference.

## What it is

A horizontally drifting, three-row bento that sits directly under the hero and
above "What's in the plugin". It replaces nothing — the hero ships unchanged and
the full skill table stays where it is. The belt is the catalog's shop window;
the table remains the catalog.

## Direction, and what was rejected

Explored across two mockup rounds: a card marquee (A–C), two belts at different
speeds (D, G), and a polygon "enclosure" binding each category to its skills
(E–I). All the enclosure variants died on one geometric fact, recorded here so
it is not rediscovered:

- **Containment and differing constant speeds are mutually exclusive.** If a
  category outruns its skills by a fixed amount, the gap grows without bound.
- **Gap equals travel.** With an enclosure, the space between two categories and
  the distance a plateau can travel are the same pixels — both are
  `cluster width − category width`. Categories can be adjacent, or the plateau
  can move. Not both.

The bento sidesteps both: grouping is a tile, not an implied relationship, so
nothing has to stay aligned with anything else while it moves.

## Layout

Three rows, fixed `--belt-row: 104px`, columns `--belt-col: 244px`.

- **Big tiles are categories, small tiles are skills** — the approved hierarchy.
- A column is one of three shapes: a full-height category marker; a stack of
  three one-row skill tiles; or a two-row skill tile over a one-row strip of
  that skill's tools. A group of exactly three skills has no remainder, so its
  tools column stands in rather than leaving a hole.
- Column order: stat → for each group (category, three skills, remainder) →
  agent → integrations.
- **Every column's row spans must total exactly 3.** Otherwise the rows drift
  apart further along the belt — invisible at the head, obvious halfway. This is
  asserted at build time in `src/lib/belt.ts` and fails the build.

## Motion

Plain CSS keyframes, one belt, one direction, 260s per loop. Track is rendered
twice, second copy `aria-hidden`, translated `-50% - 6px` so the wrap lands on a
column edge. Pauses on hover. Under `prefers-reduced-motion` the animation is
off and the belt becomes a horizontally scrollable strip.

No `requestAnimationFrame`, no position-driven maths — an earlier variant needed
a per-frame loop and was dropped for this reason.

## Content — all generated, none hand-maintained

`src/lib/catalog.ts` is the single source for grouping, ordering and text, and
is now used by both the belt and the skill table so they cannot disagree.

- Skills, counts and descriptions from `skills.json` (generated from the plugin
  repo at build time); groups from `pillars.json`; tags from `skill-tags.json`;
  integrations from `integrations.json`.
- Skills in no pillar fall into a derived "Catalog upkeep" group, so a new skill
  never silently vanishes. That group alone has no entry-point mark, because it
  has no entry point — the cobalt chip outline has to mean something.
- One-row tiles show `compact()` — a shorter **verbatim** slice of the real
  description. Two-row tiles show the same `teaser()` the table uses. A smaller
  tile shows less of the real sentence; it never paraphrases.
- Reference-app tiles were in the mockup but are **not** implemented: their
  claims live as prose in `Apps.astro`, and duplicating them in the belt would
  drift. Adding them means extracting apps to a data file first.

## Known trade-offs (accepted)

- The belt is ~430px tall including its heading, which pushes the plugin section
  down the page. That is the cost of three rows.
- You can no longer see the whole catalog at once — the table below still can.
- Fixed row heights mean copy that grows will clip rather than reflow. Tile
  content is budgeted per size; changing a description length is a visual change.
- 86 tiles in the DOM (43 per half, duplicated for the seamless loop).

## Done bar

`make smoke` — extended with: the belt section exists, its link to the table
carries the real skill count, and the belt renders `2 × skills.json.length`
skill tiles (once per half). A skill dropping out of the belt, or the duplicate
half falling out of sync, fails the build.

## Not verified

Narrow-viewport rendering was not confirmed in a browser — the automated tab's
render viewport would not follow a window resize. The belt is structurally
guarded against page-level horizontal scroll (`overflow: hidden` on both the
section and the belt) and has a `max-width: 800px` rule shrinking the row and
column, but it should be eyeballed on a real phone before shipping.
