# Homepage redesign — light "Ledger" theme (2026-07-19)

Approved via interactive mockups (Claude Code session artifacts); this doc records
the decisions so the implementation has a fixed reference.

## Direction

Open-source/dev-tool aesthetic, not startup-sell: bun.sh's install-first layout
discipline in DuckDB's light palette. The homepage reads as "a real catalog you
can install right now", with the everything-is-real content rule unchanged.

## Palette / typography (landing page only)

- Ground: `#FFFFFF`, tint `#FAFAFA`, panel `#F7F7F7`; borders `#E6E6E6`/`#D9D9D9`
- Ink: `#0D0D0D`, secondary `#666666`, muted `#B2B2B2`
- Accent: brand yellow `#FFF100` (nav rule, highlights, row hovers) with olive
  `#998B00` where accent text must stay legible on white; `#CCBD00` mid-tone
- System sans for prose, `ui-monospace` for skill names/terminal/labels
- Scoped as `body.landing` tokens in `theme.css`; the demo workspace pages keep
  the existing dark `:root` tokens untouched.

## Page structure (top to bottom)

1. **Nav** — 3px yellow bottom rule; `robium.ai` mono wordmark; links
   Plugin / Skills / Demos / FAQ / Discord / GitHub.
2. **Hero ("Ledger")** — left: headline "The Physical AI skills AI agents
   need.", sub, black mono `npx robium-ai install` button + ghost "Browse the
   catalog", fine-print line (Claude Code today · Cursor/Gemini coming · MIT ·
   GitHub org). Right: light terminal card with the real transcript
   (`npx robium-ai install` / `claude` / `> build a mobile robot that navigates
   in sim`). No invented CLI output lines.
3. **What's in the plugin** — file-tree anatomy panel (`robium/` → skills /
   agents/robium-architect / integrations / reference apps) beside a 5-row
   explanation list (skills, agents, integrations, reference apps, cli). Counts
   computed at build time from the data files (`data-count` attrs preserved for
   the smoke test); agent count states the one `robium-architect` subagent.
4. **Skill catalog** — pillar filter chips (All + pillar titles + derived
   "Catalog upkeep") over a flat table: skill (mono, linked to the repo) /
   what-it-teaches / tools-and-topics tag chips. No version column. Rows
   generated from `skills.json` + `pillars.json`; tags from a new hand-curated
   `src/data/skill-tags.json`. Filtering is a few lines of vanilla JS in the
   component (framework-free rule holds).
5. **Built with robium** — the three reference apps as boxed full-row
   spotlights (kicker / name / claim / description / stack / CTA), media column
   only where real media exists today (`pusht-eval.mp4` for manip-trial).
6. **FAQ** — six factual Q&As in a two-column open grid (agents supported,
   robot/GPU needed, what a skill is, how skills stay correct, license,
   contributing).
7. **Footer** — single quiet row: wordmark, GitHub, Hugging Face, Sample apps,
   Discord, contact, "Open source · MIT · robium.ai".

Dropped from the homepage: the dark hero + agent tabs, the animated stat
counters section, the integrations marquee (integrations are named in the
plugin section), the glow field.

## Data changes

- `pillars.json`: add `live-demo` to Architecture & proof. Skills in no pillar
  render under a derived "Catalog upkeep" group — nothing is silently dropped;
  a new skill with no pillar entry still appears.
- New `src/data/skill-tags.json`: 2–4 short tool/topic tags per skill,
  hand-curated from the skill descriptions (same maintenance model as
  `pillars.json`).

## Out of scope

- Demo pages (`/demos/*`) keep the current dark styling.
- The radial skill-graph hero trial is parked (artifacts exist if revisited).
- Discord link ships only once a real invite URL exists.

## Done bar

`make smoke` — assertions updated to pin the new load-bearing strings
(headline, `npx robium-ai install` in the hero, plugin section, skill-row count
equal to `skills.json` length, pillar names, FAQ, spotlights, real `data-count`
values, existing demo-page checks unchanged).
