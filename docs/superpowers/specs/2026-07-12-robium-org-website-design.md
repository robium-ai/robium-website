# robium.org website — design

**Date:** 2026-07-12 · **Status:** approved (brainstorming session)
**Repo:** `jazarium/robium-docs.org` · **Domain:** robium.org (owned) · **Host:** GCP Cloud Run

## Purpose

A lean, context7-style landing page for the robium Claude Code plugin. One job:
catch a visitor, tell them what robium is in 30 seconds, convert them to a
plugin install and a GitHub visit. Secondary audience: investors — the page
must read as a serious infrastructure product. Explicit non-purpose: no
development/UI tooling, no docs hosting, no app-like features. GitHub remains
the developer surface; the site drives traction to it.

## Positioning rule (hard)

**Theme from the provided design system; content from the real product.** The
Dark/Aurora design spec (palette, typography, layout, motion, component style)
is adopted verbatim as the visual system. Its *content* suggestions (the
`robium.yaml` composer hero, "Compose. Generate. Deploy." platform framing)
are NOT — every code block, transcript, metric, and screenshot on the site
must be real. No fake product surfaces, no aspirational interfaces.

## Design system (from the user-provided spec, verbatim tokens)

- Background `#090B11` · secondary `#11131A` · card `#161922` · border
  `rgba(255,255,255,0.08)`
- Accent `#7C5CFF`, gradient `#7C5CFF → #4DA3FF` · success `#4ADE80`
- Text: primary `#F7F8FA`, secondary `#9CA3AF`, muted `#6B7280`
- Inter. Hero 64px/700/1.05; section titles 40px/700; body 18px; labels 14px
  uppercase tracked.
- Content width 1200px; 120–160px section spacing; cards 24px padding / 16px
  radius; buttons 44px height / 10px radius, primary = purple gradient,
  secondary = border-only; hover = translateY(-2px), 150ms, slight glow.
- Background: faint purple/blue radial glows, near-invisible grid, slight
  noise. No particles, no glassmorphism, no heavy gradients.
- Icons: Lucide, thin stroke. Feel: Vercel + Linear + Warp + Raycast.
  Calm, premium, "serious infrastructure."

## Stack

- **Astro 5**, `output: 'static'`. Zero client-side JS (the integrations
  marquee animates with pure CSS). Plain CSS with custom properties for the
  tokens — no Tailwind (the design system is specific; hand CSS is smaller).
- **Skill catalog generation:** a build-time script (`scripts/fetch-skills.mjs`)
  fetches `jazarium/robium-docs`'s `skills/*/SKILL.md` frontmatter via the GitHub
  API → `src/data/skills.json` (committed as fallback; refreshed on build).
  The grid renders from that JSON, so it cannot drift from the catalog.
- Fonts self-hosted (Inter woff2) — no external font CDN.

## Page structure (single page, top → bottom)

1. **Nav** — near-invisible: logo left; How it works · Skills · Apps;
   GitHub icon; "Get Started" button (anchor-scroll to install section).
2. **Hero** — two-column. Left: small badge ("Claude Code plugin"), headline
   with one gradient word (working copy: *"Your AI agent, robotics-ready."*),
   supporting paragraph stating the real product (battle-tested robotics
   engineering skills for Claude Code — stack selection, simulation,
   navigation, learned manipulation — building smoke-tested robot apps),
   CTAs: primary **Get Started →**, secondary **GitHub**. Right: terminal
   card styled per the theme containing a **real condensed transcript** from
   the manip-trial build (kickoff → architect selects the LeRobot stack →
   `make smoke` → `2 passed in 39.5s`).
3. **How it works** — 4-step strip, each step with a small real artifact:
   (1) describe the robot app → (2) skills route the stack (real stack table)
   → (3) build & visualize in sim (Foxglove/PushT frame) → (4) smoke test
   gates done (real pytest output).
4. **Skills** — auto-generated grid of all ~20 skills: name, trimmed
   one-line description, version badge. Section title + one-line explainer.
5. **Apps (proof)** — two cards: nav-trial (Foxglove navigation
   screenshot/clip; pass bar: autonomous nav on a self-built map, smoke
   green) and manip-trial (real PushT eval rollout video from
   `outputs/eval/`; pass bar: train + eval with metrics, smoke green in
   ~40 s). Both link to `jazarium/robium-applications`.
6. **Integrations marquee** — horizontally auto-scrolling logo strip, pure
   CSS, pauses on hover: ROS 2, Nav2, Gazebo, LeRobot, Hugging Face,
   Isaac Sim, Foxglove, Rerun, RViz2, Docker, uv. Official logo assets used
   under each project's brand/nominative-use guidelines; grayscale/dimmed
   treatment to fit the theme, brightening on hover.
7. **Get Started** — terminal block with the real install:
   `/plugin marketplace add jazarium/robium-docs` then
   `/plugin install robium@robium`; link to the README for details.
8. **Footer** — GitHub · robium-applications · MIT · contact email.

## Deployment (dervish pattern)

- Multi-stage `Dockerfile`: `node:22-slim` build stage (`npm ci && npm run
  build`) → `nginx:alpine` serving `dist/` with long-cache static assets +
  security headers.
- `cloudbuild.yaml` → Artifact Registry
  `us-central1-docker.pkg.dev/robium-prod/robium/site:latest`.
- Cloud Run service `robium-site`, region `us-central1`, min-instances 0,
  max 2 (expected cost ≈ $0–1/mo at launch traffic).
- **New GCP project `robium-prod`** on the existing billing account.
- Domain: Cloud Run domain mapping for `robium.org` + `www.robium.org`
  (managed TLS); user adds the mapping's DNS records at the registrar.
- Deploys manual via `make build-image deploy` (gcloud builds submit +
  gcloud run deploy). No CI trigger in v1.

## Testing / done bar

- `make smoke`: build site → run container locally → assert HTTP 200 and
  key content present (hero headline, ≥ 20 skill tiles, install command
  string, marquee logos ≥ 8). Exit code gates done.
- Build-time internal link check (Astro build fails on broken internal
  refs; external links spot-checked in smoke).
- Launch bar: smoke green locally AND https://robium.org serving with valid
  TLS and the same content.

## Non-goals (v1)

No docs hosting, no blog, no CMS, no analytics, no light theme, no
interactive playground, no newsletter, no CI/CD pipeline.

## Launch prerequisites / open risks

1. **`jazarium/robium-docs` must be public** before launch — the install command
   and the build-time catalog fetch both depend on it. Making it public is a
   user decision outside this repo.
2. **Media assets:** PushT eval MP4 exists (manip-trial `outputs/eval/`);
   nav-trial needs one good Foxglove capture (screenshot acceptable for v1).
3. **Logo licensing:** each marquee logo checked against its brand
   guidelines at implementation time; any project whose guidelines don't
   permit the use is dropped from the strip.
4. **GCP quotas/billing:** new project creation + Artifact Registry +
   Cloud Run APIs need enabling; one-time manual step documented in README.
