# robium.org Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the robium.org landing page — Astro static site, Dark/Aurora theme, 100% real content — served from GCP Cloud Run.

**Architecture:** Single-page Astro 6 static site. A build-time script generates the skill catalog JSON from the local robium checkout (GitHub API fallback). Components per section, plain CSS with design-token custom properties, zero client-side JS. Multi-stage Docker build (node → nginx) deployed via Cloud Build → Artifact Registry → Cloud Run, domain-mapped to robium.org.

**Tech Stack:** Astro ^6.3 (current major — supersedes the spec's "Astro 5", verified against docs 2026-07-12), @fontsource-variable/inter, nginx:alpine, gcloud (Cloud Build, Artifact Registry, Cloud Run).

## Global Constraints

- Repo root: `/Users/jazarium/repos/robium.org` (git initialized, `main`).
- **Real content only** — every transcript, metric, command, and skill description on the page is real; the design-system doc's fake `robium.yaml` composer must NOT appear.
- Design tokens verbatim (from spec): bg `#090B11`, bg2 `#11131A`, card `#161922`, border `rgba(255,255,255,0.08)`, accent `#7C5CFF`, gradient `#7C5CFF→#4DA3FF`, success `#4ADE80`, text `#F7F8FA`/`#9CA3AF`/`#6B7280`; Inter; hero 64px/700/1.05; sections 40px/700; body 18px; labels 14px uppercase tracked; content 1200px; sections 120–160px vertical; cards 24px pad/16px radius; buttons 44px/10px radius; hover translateY(-2px) 150ms; Lucide icons; faint radial glows, no particles/glassmorphism.
- Zero client-side JavaScript in the built site (CSS-only marquee).
- No Tailwind, no external CDNs at runtime (fonts/icons self-hosted).
- Node ≥ 22 (local: v25.9.0). Astro `output: 'static'` (default).
- Commit after every task; messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Astro scaffold that builds

**Files:**
- Create: `package.json`, `astro.config.mjs`, `.gitignore`, `src/pages/index.astro`, `src/layouts/Base.astro`, `src/styles/theme.css`, `public/favicon.svg`

**Interfaces:**
- Produces: `Base.astro` layout (slot-based, imports `theme.css`, sets `<title>` and meta description) — every later component renders inside it via `src/pages/index.astro`. CSS custom properties (`--bg`, `--bg2`, `--card`, `--border`, `--accent`, `--accent2`, `--success`, `--text`, `--text2`, `--muted`) available globally.

- [ ] **Step 1: Write files**

`package.json`:
```json
{
  "name": "robium.org",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "node scripts/fetch-skills.mjs && astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "@fontsource-variable/inter": "^5.2.0",
    "astro": "^6.3.0"
  }
}
```

`astro.config.mjs`:
```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://robium.org',
  output: 'static',
});
```

`.gitignore`:
```
node_modules/
dist/
.astro/
```

`src/styles/theme.css` (tokens + base; full file):
```css
@import '@fontsource-variable/inter';

:root {
  --bg: #090B11;
  --bg2: #11131A;
  --card: #161922;
  --border: rgba(255, 255, 255, 0.08);
  --accent: #7C5CFF;
  --accent2: #4DA3FF;
  --success: #4ADE80;
  --text: #F7F8FA;
  --text2: #9CA3AF;
  --muted: #6B7280;
  --content-w: 1200px;
}

* { box-sizing: border-box; margin: 0; }

html { scroll-behavior: smooth; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter Variable', system-ui, sans-serif;
  font-size: 18px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.container { max-width: var(--content-w); margin: 0 auto; padding: 0 24px; }

section { padding: 120px 0; }

h1 { font-size: 64px; font-weight: 700; line-height: 1.05; letter-spacing: -0.02em; }
h2 { font-size: 40px; font-weight: 700; letter-spacing: -0.01em; }

.label {
  font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text2); font-weight: 600;
}

.gradient-text {
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}

.card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 16px; padding: 24px;
  transition: transform 150ms ease, border-color 150ms ease;
}
.card:hover { transform: translateY(-2px); border-color: rgba(255, 255, 255, 0.16); }

.btn {
  display: inline-flex; align-items: center; gap: 8px;
  height: 44px; padding: 0 20px; border-radius: 10px;
  font-size: 16px; font-weight: 600; text-decoration: none;
  transition: transform 150ms ease, filter 150ms ease;
}
.btn:hover { transform: translateY(-2px); filter: brightness(1.1); }
.btn-primary { background: linear-gradient(90deg, var(--accent), var(--accent2)); color: #fff; }
.btn-secondary { border: 1px solid var(--border); color: var(--text); background: transparent; }

@media (max-width: 800px) {
  h1 { font-size: 40px; }
  h2 { font-size: 30px; }
  section { padding: 72px 0; }
}
```

`src/layouts/Base.astro`:
```astro
---
import '../styles/theme.css';
const { title = 'robium — robotics skills for AI coding agents' } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      name="description"
      content="robium equips Claude Code with battle-tested robotics engineering skills — stack selection, simulation, navigation, learned manipulation — to build smoke-tested robot applications."
    />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
```

`src/pages/index.astro` (placeholder body; sections land in later tasks):
```astro
---
import Base from '../layouts/Base.astro';
---
<Base>
  <main>
    <h1>Your AI agent, <span class="gradient-text">robotics-ready</span>.</h1>
  </main>
</Base>
```

`public/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#090B11"/><path d="M9 23V9h8a5 5 0 0 1 1.6 9.7L23 23h-4.4l-3.7-4H13v4H9zm4-8h4a1.5 1.5 0 0 0 0-3h-4v3z" fill="url(#g)"/><defs><linearGradient id="g" x1="9" y1="9" x2="23" y2="23"><stop stop-color="#7C5CFF"/><stop offset="1" stop-color="#4DA3FF"/></linearGradient></defs></svg>
```

- [ ] **Step 2: Install and verify the build fails only on the missing script**

Run: `cd /Users/jazarium/repos/robium.org && npm install && npm run build`
Expected: FAIL — `Cannot find module ... scripts/fetch-skills.mjs` (build script references it; Task 2 provides it).

- [ ] **Step 3: Stub the script minimally so the scaffold builds**

`scripts/fetch-skills.mjs` (minimal; replaced in Task 2):
```js
console.log('fetch-skills: stub (Task 2 implements)');
```

- [ ] **Step 4: Verify build passes and output contains the hero string**

Run: `npm run build && grep -q "robotics-ready" dist/index.html && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Astro scaffold with Dark/Aurora theme tokens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Skill catalog generator

**Files:**
- Create: `scripts/fetch-skills.mjs` (replace stub), `src/data/skills.json` (generated, committed)

**Interfaces:**
- Produces: `src/data/skills.json` — array of `{ name: string, description: string, version: string }`, ≥ 20 entries, sorted by name. Task 6 imports it.
- Consumes: local robium checkout at `$ROBIUM_DIR` (default `~/repos/robium`), falling back to the GitHub API (`https://api.github.com/repos/jazarium/robium-docs/contents/skills`).

- [ ] **Step 1: Write the generator (full file)**

```js
// scripts/fetch-skills.mjs — build-time skill catalog generation.
// Prefers the local robium checkout; falls back to the GitHub API so CI
// builds work once the repo is public. Trims each description to its
// capability sentence (text before "Use when:").
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const OUT = 'src/data/skills.json';
const ROBIUM_DIR = process.env.ROBIUM_DIR ?? join(homedir(), 'repos/robium');
const SKIP = new Set(['_TEMPLATE']);

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];
  const name = fm.match(/^name:\s*(.+)$/m)?.[1].trim();
  const version = fm.match(/^version:\s*(.+)$/m)?.[1].trim();
  const descBlock = fm.match(/^description:\s*>?\s*\n((?:[ \t]+.+\n?)+)/m)?.[1]
    ?? fm.match(/^description:\s*(.+)$/m)?.[1];
  if (!name || !version || !descBlock) return null;
  const full = descBlock.replace(/\s+/g, ' ').trim();
  const description = full.split(/Use when:/)[0].trim().replace(/[.:]$/, '') + '.';
  return { name, description, version };
}

async function fromLocal() {
  const dirs = readdirSync(join(ROBIUM_DIR, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !SKIP.has(d.name));
  return dirs
    .map((d) => {
      const p = join(ROBIUM_DIR, 'skills', d.name, 'SKILL.md');
      return existsSync(p) ? parseFrontmatter(readFileSync(p, 'utf8')) : null;
    })
    .filter(Boolean);
}

async function fromGitHub() {
  const list = await (await fetch('https://api.github.com/repos/jazarium/robium-docs/contents/skills')).json();
  const skills = [];
  for (const entry of list) {
    if (entry.type !== 'dir' || SKIP.has(entry.name)) continue;
    const res = await fetch(`https://raw.githubusercontent.com/jazarium/robium-docs/main/skills/${entry.name}/SKILL.md`);
    if (!res.ok) continue;
    const parsed = parseFrontmatter(await res.text());
    if (parsed) skills.push(parsed);
  }
  return skills;
}

let skills = [];
try {
  skills = await fromLocal();
  console.log(`fetch-skills: ${skills.length} skills from ${ROBIUM_DIR}`);
} catch {
  skills = await fromGitHub();
  console.log(`fetch-skills: ${skills.length} skills from GitHub API`);
}

if (skills.length === 0) {
  if (existsSync(OUT)) {
    console.warn('fetch-skills: no source reachable — keeping committed skills.json');
    process.exit(0);
  }
  throw new Error('fetch-skills: no skills found and no committed fallback');
}

skills.sort((a, b) => a.name.localeCompare(b.name));
mkdirSync('src/data', { recursive: true });
writeFileSync(OUT, JSON.stringify(skills, null, 2) + '\n');
console.log(`fetch-skills: wrote ${OUT}`);
```

- [ ] **Step 2: Run and verify the JSON**

Run: `node scripts/fetch-skills.mjs && node -e "const s=require('./src/data/skills.json'); if(s.length<20) throw Error('only '+s.length); if(!s.every(x=>x.name&&x.description&&x.version)) throw Error('missing fields'); console.log('OK', s.length, 'skills')"`
Expected: `OK 20 skills`

- [ ] **Step 3: Verify full build still passes**

Run: `npm run build && echo BUILD-OK`
Expected: `BUILD-OK`

- [ ] **Step 4: Commit (include generated skills.json — it is the offline fallback)**

```bash
git add -A && git commit -m "feat: build-time skill catalog generator (local checkout + GitHub fallback)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Nav, Footer, background glow, page frame

**Files:**
- Create: `src/components/Nav.astro`, `src/components/Footer.astro`
- Modify: `src/pages/index.astro`, `src/styles/theme.css` (append glow styles)

**Interfaces:**
- Produces: page frame — `index.astro` renders `<Nav/> <main> …sections… </main> <Footer/>`; section anchor ids used by Nav: `#how`, `#skills`, `#apps`, `#get-started` (later tasks must use exactly these ids).

- [ ] **Step 1: Write components**

`src/components/Nav.astro`:
```astro
<header class="nav">
  <div class="container nav-inner">
    <a href="/" class="brand">robium</a>
    <nav class="links">
      <a href="#how">How it works</a>
      <a href="#skills">Skills</a>
      <a href="#apps">Apps</a>
    </nav>
    <div class="actions">
      <a href="https://github.com/jazarium/robium-docs" aria-label="GitHub" class="gh">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.93c.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.05.78 2.13v3.16c0 .31.2.67.8.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z"/></svg>
      </a>
      <a href="#get-started" class="btn btn-primary">Get Started</a>
    </div>
  </div>
</header>

<style>
  .nav {
    position: sticky; top: 0; z-index: 10;
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .nav-inner { display: flex; align-items: center; gap: 32px; height: 64px; }
  .brand { font-weight: 700; font-size: 20px; color: var(--text); text-decoration: none; letter-spacing: -0.01em; }
  .links { display: flex; gap: 24px; flex: 1; }
  .links a { color: var(--text2); text-decoration: none; font-size: 15px; transition: color 150ms; }
  .links a:hover { color: var(--text); }
  .actions { display: flex; align-items: center; gap: 16px; }
  .gh { color: var(--text2); display: flex; transition: color 150ms; }
  .gh:hover { color: var(--text); }
  .actions .btn { height: 38px; padding: 0 16px; font-size: 15px; }
  @media (max-width: 800px) { .links { display: none; } }
</style>
```

`src/components/Footer.astro`:
```astro
<footer class="footer">
  <div class="container footer-inner">
    <span class="muted">robium — MIT license</span>
    <nav class="flinks">
      <a href="https://github.com/jazarium/robium-docs">GitHub</a>
      <a href="https://github.com/jazarium/robium-applications">Sample apps</a>
      <a href="mailto:jazarium@gmail.com">Contact</a>
    </nav>
  </div>
</footer>

<style>
  .footer { border-top: 1px solid var(--border); padding: 32px 0; }
  .footer-inner { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
  .muted { color: var(--muted); font-size: 14px; }
  .flinks { display: flex; gap: 24px; }
  .flinks a { color: var(--text2); font-size: 14px; text-decoration: none; }
  .flinks a:hover { color: var(--text); }
</style>
```

Append to `src/styles/theme.css`:
```css
.glow-field {
  position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background:
    radial-gradient(600px 400px at 15% 10%, rgba(124, 92, 255, 0.10), transparent 70%),
    radial-gradient(700px 500px at 85% 30%, rgba(77, 163, 255, 0.07), transparent 70%),
    radial-gradient(500px 400px at 60% 90%, rgba(124, 92, 255, 0.05), transparent 70%);
}
```

Update `src/pages/index.astro`:
```astro
---
import Base from '../layouts/Base.astro';
import Nav from '../components/Nav.astro';
import Footer from '../components/Footer.astro';
---
<Base>
  <div class="glow-field"></div>
  <Nav />
  <main>
    <h1>Your AI agent, <span class="gradient-text">robotics-ready</span>.</h1>
  </main>
  <Footer />
</Base>
```

- [ ] **Step 2: Verify build + frame strings**

Run: `npm run build && grep -q "Get Started" dist/index.html && grep -q "MIT license" dist/index.html && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: nav, footer, aurora glow field

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Hero with real-transcript terminal

**Files:**
- Create: `src/components/Terminal.astro`, `src/components/Hero.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `.btn`, `.gradient-text`, `.label` from theme.
- Produces: `Terminal.astro` — props `{ title: string }`, slot = pre-formatted content; reused by Task 7 (apps) and Task 9 (install).

- [ ] **Step 1: Write Terminal component**

`src/components/Terminal.astro`:
```astro
---
const { title = 'terminal' } = Astro.props;
---
<div class="term card">
  <div class="term-bar">
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    <span class="term-title">{title}</span>
  </div>
  <pre class="term-body"><slot /></pre>
</div>

<style>
  .term { padding: 0; overflow: hidden; font-size: 14px; }
  .term-bar {
    display: flex; align-items: center; gap: 6px;
    padding: 12px 16px; border-bottom: 1px solid var(--border);
    background: var(--bg2);
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border); }
  .term-title { margin-left: 10px; color: var(--muted); font-size: 13px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
  .term-body {
    padding: 20px 24px; margin: 0; overflow-x: auto;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 13.5px; line-height: 1.7; color: var(--text2);
  }
  .term-body :global(.tp) { color: var(--text); }
  .term-body :global(.ta) { color: var(--accent2); }
  .term-body :global(.ts) { color: var(--success); }
</style>
```

- [ ] **Step 2: Write Hero (transcript lines are condensed REAL output from the manip-trial build, 2026-07-12)**

`src/components/Hero.astro`:
```astro
---
import Terminal from './Terminal.astro';
---
<section class="hero">
  <div class="container hero-grid">
    <div class="hero-copy">
      <span class="badge">Claude Code plugin</span>
      <h1>Your AI agent, <span class="gradient-text">robotics-ready</span>.</h1>
      <p class="sub">
        robium equips Claude Code with battle-tested robotics engineering
        skills — stack selection, simulation, navigation, learned
        manipulation — so your agent builds robot applications that pass
        their smoke tests, not just compile.
      </p>
      <div class="ctas">
        <a href="#get-started" class="btn btn-primary">Get Started →</a>
        <a href="https://github.com/jazarium/robium-docs" class="btn btn-secondary">GitHub</a>
      </div>
    </div>
    <Terminal title="claude — manip-trial">
<span class="tp">&gt; start manip-trial</span>

<span class="ta">⏺ robium:architect</span> — manipulation golden path
  stack: LeRobot 0.6.0 · gym-pusht · uv (Python 3.12) · MPS
  brief written → docs/architecture-brief.md

<span class="tp">$ make smoke</span>
tests/test_smoke.py::test_train_completes <span class="ts">PASSED</span>
tests/test_smoke.py::test_eval_produces_metrics <span class="ts">PASSED</span>

<span class="ts">2 passed</span> in 39.51s
</Terminal>
  </div>
</section>

<style>
  .hero { padding: 100px 0 120px; }
  .hero-grid { display: grid; grid-template-columns: 1.05fr 1fr; gap: 64px; align-items: center; }
  .badge {
    display: inline-block; padding: 6px 14px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--bg2);
    font-size: 13px; color: var(--text2); margin-bottom: 24px;
  }
  .sub { color: var(--text2); margin: 24px 0 32px; max-width: 34em; }
  .ctas { display: flex; gap: 16px; }
  @media (max-width: 900px) { .hero-grid { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 3: Wire into index.astro (replace the placeholder `<h1>`)**

```astro
---
import Base from '../layouts/Base.astro';
import Nav from '../components/Nav.astro';
import Hero from '../components/Hero.astro';
import Footer from '../components/Footer.astro';
---
<Base>
  <div class="glow-field"></div>
  <Nav />
  <main>
    <Hero />
  </main>
  <Footer />
</Base>
```

- [ ] **Step 4: Verify**

Run: `npm run build && grep -q "robotics-ready" dist/index.html && grep -q "39.51s" dist/index.html && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: hero with real manip-trial transcript terminal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: How-it-works strip

**Files:**
- Create: `src/components/HowItWorks.astro`
- Modify: `src/pages/index.astro` (insert `<HowItWorks />` after `<Hero />`)

**Interfaces:**
- Produces: section with `id="how"` (Nav anchor).

- [ ] **Step 1: Write component**

`src/components/HowItWorks.astro`:
```astro
---
const steps = [
  {
    n: '01',
    title: 'Describe the robot app',
    body: '"Autonomous navigation in sim" or "train a manipulation policy" — plain language, in your Claude Code session.',
    art: '> build a mobile robot that\n  navigates a warehouse',
  },
  {
    n: '02',
    title: 'Skills route the stack',
    body: 'The architect skill turns requirements into a verified stack decision and writes an architecture brief your whole build follows.',
    art: 'middleware  ROS 2 Jazzy\nnav         Nav2\nsim         Gazebo Harmonic\nviz         Foxglove',
  },
  {
    n: '03',
    title: 'Build and see it run',
    body: 'Reproducible envs (uv or Docker), headless simulation, browser visualization — local and remote runs behave identically.',
    art: 'gz sim -s --headless-rendering\nfoxglove ws://localhost:8765\nRTF ≈ 0.99',
  },
  {
    n: '04',
    title: 'Smoke test gates done',
    body: 'An app is not done until one command proves it: robot reaches its goals, policy trains and evals with metrics. Exit code 0 or it is not shipped.',
    art: '$ make smoke\nPASS: all goals reached\nexit 0',
  },
];
---
<section id="how">
  <div class="container">
    <span class="label">How it works</span>
    <h2>From idea to a smoke-tested robot app.</h2>
    <div class="steps">
      {steps.map((s) => (
        <div class="card step">
          <span class="n gradient-text">{s.n}</span>
          <h3>{s.title}</h3>
          <p>{s.body}</p>
          <pre class="art">{s.art}</pre>
        </div>
      ))}
    </div>
  </div>
</section>

<style>
  h2 { margin: 12px 0 48px; }
  .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
  .step h3 { font-size: 19px; margin: 12px 0 8px; }
  .step p { font-size: 15px; color: var(--text2); }
  .n { font-size: 14px; font-weight: 700; font-family: ui-monospace, Menlo, monospace; }
  .art {
    margin-top: 16px; padding: 14px; border-radius: 10px;
    background: var(--bg2); border: 1px solid var(--border);
    font-family: ui-monospace, Menlo, monospace; font-size: 12.5px;
    line-height: 1.6; color: var(--text2); overflow-x: auto;
  }
  @media (max-width: 1000px) { .steps { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .steps { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 2: Verify**

Run: `npm run build && grep -q "Smoke test gates done" dist/index.html && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: how-it-works strip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Skills grid (generated)

**Files:**
- Create: `src/components/SkillsGrid.astro`
- Modify: `src/pages/index.astro` (insert `<SkillsGrid />` after `<HowItWorks />`)

**Interfaces:**
- Consumes: `src/data/skills.json` (`{name, description, version}[]`, Task 2).
- Produces: section `id="skills"`.

- [ ] **Step 1: Write component**

`src/components/SkillsGrid.astro`:
```astro
---
import skills from '../data/skills.json';
---
<section id="skills">
  <div class="container">
    <span class="label">Skill catalog</span>
    <h2>{skills.length} skills. One coherent robotics brain.</h2>
    <p class="lead">
      Generated from the repo at build time — versioned, battle-tested on real
      builds, and hardened by a continuous learning loop.
    </p>
    <div class="grid">
      {skills.map((s) => (
        <div class="card skill">
          <div class="head">
            <span class="name">{s.name}</span>
            <span class="ver">v{s.version}</span>
          </div>
          <p>{s.description}</p>
        </div>
      ))}
    </div>
  </div>
</section>

<style>
  h2 { margin: 12px 0 8px; }
  .lead { color: var(--text2); margin-bottom: 48px; max-width: 40em; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .skill .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .name { font-family: ui-monospace, Menlo, monospace; font-weight: 600; font-size: 15px; color: var(--text); }
  .ver { font-size: 12px; color: var(--muted); font-family: ui-monospace, Menlo, monospace; }
  .skill p {
    font-size: 13.5px; color: var(--text2); line-height: 1.55;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  @media (max-width: 1000px) { .grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 2: Verify all 20 tiles render**

Run: `npm run build && test "$(grep -o 'class="card skill"' dist/index.html | wc -l | tr -d ' ')" -ge 20 && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: auto-generated skills grid

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Apps / proof section with real media

**Files:**
- Create: `src/components/Apps.astro`, `public/media/pusht-eval.mp4`
- Modify: `src/pages/index.astro` (insert `<Apps />` after `<SkillsGrid />`)

**Interfaces:**
- Consumes: `Terminal.astro` (Task 4).
- Produces: section `id="apps"`.

- [ ] **Step 1: Copy the real PushT eval rollout video**

Run:
```bash
cp /Users/jazarium/repos/robium-applications/apps/manip-trial/outputs/eval/baseline/videos/pusht_0/eval_episode_0.mp4 public/media/pusht-eval.mp4
ls -la public/media/
```
Expected: `pusht-eval.mp4` present (a few hundred KB). If manip-trial `outputs/` was cleaned, regenerate first: `cd /Users/jazarium/repos/robium-applications/apps/manip-trial && make baseline-eval` (or `make eval-trained` and use `outputs/eval/smoke/videos/pusht_0/eval_episode_0.mp4`).

- [ ] **Step 2: Write component (nav-trial card uses its REAL smoke transcript; image swap-in is a follow-up when the Foxglove capture exists)**

`src/components/Apps.astro`:
```astro
---
import Terminal from './Terminal.astro';
---
<section id="apps">
  <div class="container">
    <span class="label">Proof, not promises</span>
    <h2>Built by the plugin. Gated by smoke tests.</h2>
    <p class="lead">
      Every reference app in
      <a href="https://github.com/jazarium/robium-applications">robium-applications</a>
      is built with the skills and stays green — the apps are the regression
      suite, and the registry tells the next build what to bootstrap from.
    </p>
    <div class="apps-grid">
      <div class="card app">
        <h3>nav-trial</h3>
        <p class="stack">ROS 2 Jazzy · Nav2 · slam_toolbox · Gazebo Harmonic · Docker (arm64) · Foxglove</p>
        <p>
          TurtleBot 3 maps its world with SLAM, then navigates goals on the
          saved map — fully headless on a MacBook, visualized in the browser.
        </p>
        <Terminal title="make smoke — nav-trial">
9/9 waypoints <span class="ts">SUCCEEDED</span> — map saved 111×103
AMCL localized, 2 map-frame goals <span class="ts">SUCCEEDED</span>
<span class="ts">PASS: all goals reached</span> · exit 0 · 94 s wall
</Terminal>
      </div>
      <div class="card app">
        <h3>manip-trial</h3>
        <p class="stack">LeRobot 0.6.0 · ACT policy · gym-pusht · uv · Apple-silicon MPS</p>
        <p>
          An imitation-learning policy trains on the PushT dataset and evaluates
          in sim with metrics — on a GPU-less laptop. Below: a real evaluation
          rollout.
        </p>
        <video src="/media/pusht-eval.mp4" autoplay loop muted playsinline></video>
      </div>
    </div>
  </div>
</section>

<style>
  h2 { margin: 12px 0 8px; }
  .lead { color: var(--text2); margin-bottom: 48px; max-width: 44em; }
  .lead a { color: var(--accent2); }
  .apps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
  .app h3 { font-size: 22px; font-family: ui-monospace, Menlo, monospace; }
  .stack { font-size: 13px; color: var(--muted); margin: 6px 0 12px; }
  .app p { font-size: 15px; color: var(--text2); margin-bottom: 16px; }
  video { width: 100%; border-radius: 12px; border: 1px solid var(--border); display: block; }
  @media (max-width: 900px) { .apps-grid { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 3: Verify**

Run: `npm run build && grep -q "pusht-eval.mp4" dist/index.html && grep -q "nav-trial" dist/index.html && test -f dist/media/pusht-eval.mp4 && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: apps proof section with real PushT rollout video and nav-trial smoke transcript

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Integrations marquee

**Files:**
- Create: `src/components/Marquee.astro`, `public/logos/*.svg` (downloaded)
- Modify: `src/pages/index.astro` (insert `<Marquee />` after `<Apps />`)

**Interfaces:**
- Produces: full-width auto-scrolling strip; pure CSS animation; pauses on hover.

- [ ] **Step 1: Download official SVG logos where brand guidelines permit; wordmark-fallback the rest**

Run (each may fail — that's fine, the component wordmark-falls-back per logo):
```bash
mkdir -p public/logos
curl -fsSL "https://cdn.simpleicons.org/ros/9CA3AF" -o public/logos/ros.svg || true
curl -fsSL "https://cdn.simpleicons.org/docker/9CA3AF" -o public/logos/docker.svg || true
curl -fsSL "https://cdn.simpleicons.org/huggingface/9CA3AF" -o public/logos/huggingface.svg || true
curl -fsSL "https://cdn.simpleicons.org/nvidia/9CA3AF" -o public/logos/nvidia.svg || true
curl -fsSL "https://cdn.simpleicons.org/uv/9CA3AF" -o public/logos/uv.svg || true
ls public/logos/
```
Check each downloaded file is a real SVG (`head -c 100 public/logos/ros.svg`). Delete any HTML error bodies.

- [ ] **Step 2: Write component — icon if the file exists, styled wordmark otherwise**

`src/components/Marquee.astro`:
```astro
---
import { existsSync } from 'node:fs';
const items = [
  { name: 'ROS 2', file: 'ros.svg' },
  { name: 'Nav2', file: 'nav2.svg' },
  { name: 'Gazebo', file: 'gazebo.svg' },
  { name: 'LeRobot', file: 'lerobot.svg' },
  { name: 'Hugging Face', file: 'huggingface.svg' },
  { name: 'Isaac Sim', file: 'nvidia.svg' },
  { name: 'Foxglove', file: 'foxglove.svg' },
  { name: 'Rerun', file: 'rerun.svg' },
  { name: 'RViz2', file: 'rviz2.svg' },
  { name: 'Docker', file: 'docker.svg' },
  { name: 'uv', file: 'uv.svg' },
].map((i) => ({ ...i, has: existsSync(`public/logos/${i.file}`) }));
---
<section class="marquee-section">
  <div class="container">
    <span class="label">Works with the stack you already trust</span>
  </div>
  <div class="marquee" aria-label="Supported integrations">
    <div class="track">
      {[...items, ...items].map((i) => (
        <span class="item">
          {i.has && <img src={`/logos/${i.file}`} alt="" width="22" height="22" loading="lazy" />}
          <span>{i.name}</span>
        </span>
      ))}
    </div>
  </div>
</section>

<style>
  .marquee-section { padding: 80px 0; }
  .label { display: block; text-align: center; margin-bottom: 32px; }
  .marquee { overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
  .track { display: flex; gap: 56px; width: max-content; animation: scroll 36s linear infinite; }
  .marquee:hover .track { animation-play-state: paused; }
  .item {
    display: inline-flex; align-items: center; gap: 10px;
    color: var(--muted); font-size: 17px; font-weight: 600; white-space: nowrap;
    transition: color 150ms;
  }
  .item:hover { color: var(--text); }
  .item img { opacity: 0.55; transition: opacity 150ms; }
  .item:hover img { opacity: 1; }
  @keyframes scroll { to { transform: translateX(-50%); } }
  @media (prefers-reduced-motion: reduce) { .track { animation: none; flex-wrap: wrap; width: auto; justify-content: center; } }
</style>
```

- [ ] **Step 3: Verify**

Run: `npm run build && test "$(grep -o 'Hugging Face' dist/index.html | wc -l | tr -d ' ')" -ge 2 && echo OK`
Expected: `OK` (items duplicated for the seamless loop).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: CSS-only integrations marquee

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Get-started section

**Files:**
- Create: `src/components/GetStarted.astro`
- Modify: `src/pages/index.astro` (insert `<GetStarted />` after `<Marquee />`)

**Interfaces:**
- Consumes: `Terminal.astro`.
- Produces: section `id="get-started"` (Nav + Hero CTA anchor target).

- [ ] **Step 1: Write component**

`src/components/GetStarted.astro`:
```astro
---
import Terminal from './Terminal.astro';
---
<section id="get-started">
  <div class="container narrow">
    <span class="label">Get started</span>
    <h2>Two commands in Claude Code.</h2>
    <Terminal title="claude">
<span class="tp">/plugin marketplace add jazarium/robium-docs</span>
<span class="tp">/plugin install robium@robium</span>

<span class="ts">✓</span> 20 robotics skills loaded — start with:
<span class="ta">&gt; build a mobile robot that navigates in sim</span>
</Terminal>
    <p class="after">
      Then just describe your robot application. Full docs in the
      <a href="https://github.com/jazarium/robium-docs#readme">README</a>.
    </p>
  </div>
</section>

<style>
  .narrow { max-width: 720px; }
  h2 { margin: 12px 0 32px; }
  .after { margin-top: 24px; color: var(--text2); font-size: 15px; }
  .after a { color: var(--accent2); }
</style>
```

- [ ] **Step 2: Verify**

Run: `npm run build && grep -q "plugin marketplace add jazarium/robium-docs" dist/index.html && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: get-started install section

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Smoke test + Makefile

**Files:**
- Create: `tests/smoke.sh`, `Makefile`

**Interfaces:**
- Produces: `make smoke` (site-level done bar, exit code gated); `make build`, `make dev`. Task 11 extends smoke to the container.

- [ ] **Step 1: Write smoke script**

`tests/smoke.sh`:
```bash
#!/usr/bin/env bash
# robium.org smoke: build output contains every load-bearing section.
set -euo pipefail
cd "$(dirname "$0")/.."

URL="${1:-}"   # optional: check a served URL instead of dist/
if [[ -n "$URL" ]]; then
  HTML=$(curl -fsSL "$URL")
else
  [[ -f dist/index.html ]] || { echo "FAIL: dist/index.html missing — run npm run build"; exit 1; }
  HTML=$(cat dist/index.html)
fi

fail=0
check() {
  if grep -q "$1" <<<"$HTML"; then echo "ok: $2"; else echo "FAIL: $2"; fail=1; fi
}

check "robotics-ready" "hero headline"
check "39.51s" "hero real transcript"
check "Smoke test gates done" "how-it-works"
check "plugin marketplace add jazarium/robium-docs" "install command"
check "pusht-eval.mp4" "proof video"
check "Hugging Face" "marquee"

tiles=$(grep -o 'class="card skill"' <<<"$HTML" | wc -l | tr -d ' ')
if [[ "$tiles" -ge 20 ]]; then echo "ok: $tiles skill tiles"; else echo "FAIL: only $tiles skill tiles"; fail=1; fi

if [[ -z "$URL" ]]; then
  [[ -f dist/media/pusht-eval.mp4 ]] || { echo "FAIL: media missing from dist"; fail=1; }
fi

[[ "$fail" -eq 0 ]] && echo "SMOKE PASS" || { echo "SMOKE FAIL"; exit 1; }
```

`Makefile`:
```makefile
.PHONY: dev build smoke docker-build docker-smoke image deploy

dev:
	npm run dev

build:
	npm run build

smoke: build
	bash tests/smoke.sh

# --- container (Task 11) ---
docker-build:
	docker build -t robium-site:local .

docker-smoke: docker-build
	docker rm -f robium-site-smoke 2>/dev/null || true
	docker run -d --name robium-site-smoke -p 8080:8080 robium-site:local
	sleep 2
	bash tests/smoke.sh http://localhost:8080 ; RC=$$? ; \
	docker rm -f robium-site-smoke >/dev/null ; exit $$RC

# --- GCP (Task 12) ---
PROJECT ?= robium-prod
REGION  ?= us-central1
IMAGE   = $(REGION)-docker.pkg.dev/$(PROJECT)/robium/site:latest

image:
	gcloud builds submit --project=$(PROJECT) --config=cloudbuild.yaml .

deploy:
	gcloud run deploy robium-site --image=$(IMAGE) \
	  --region=$(REGION) --project=$(PROJECT) --platform=managed \
	  --allow-unauthenticated --min-instances=0 --max-instances=2 --quiet
```

- [ ] **Step 2: Run**

Run: `chmod +x tests/smoke.sh && make smoke`
Expected: every `ok:` line, then `SMOKE PASS`, exit 0.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: site smoke script + Makefile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Container (Dockerfile + nginx)

**Files:**
- Create: `Dockerfile`, `nginx.conf`, `.dockerignore`

**Interfaces:**
- Consumes: `npm run build` (note: inside Docker there is no robium checkout — `fetch-skills.mjs` falls back to the committed `src/data/skills.json`, which is why Task 2 commits it).
- Produces: image serving the site on port 8080 (Cloud Run's default).

- [ ] **Step 1: Write files**

`.dockerignore`:
```
node_modules
dist
.git
.astro
docs
```

`Dockerfile`:
```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
```

`nginx.conf`:
```nginx
server {
    listen 8080;
    root /usr/share/nginx/html;
    index index.html;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /_astro/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
    location /media/  { add_header Cache-Control "public, max-age=86400"; }
    location /logos/  { add_header Cache-Control "public, max-age=86400"; }

    location / { try_files $uri $uri/ /index.html; }
}
```

- [ ] **Step 2: Build and smoke the container**

Run: `make docker-smoke`
Expected: `SMOKE PASS`, exit 0. (Requires Docker Desktop running.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: nginx container serving the static site on 8080

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Cloud Build config, README, GCP runbook

**Files:**
- Create: `cloudbuild.yaml`, `README.md`

**Interfaces:**
- Consumes: `Makefile` `image`/`deploy` targets (Task 10), Dockerfile (Task 11).
- Produces: documented one-time GCP setup + repeatable deploy. Actual cloud execution happens interactively with the user (billing, DNS) — the plan's deliverable is the config + runbook, smoke-tested locally.

- [ ] **Step 1: Write cloudbuild.yaml (dervish pattern)**

```yaml
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -t
      - us-central1-docker.pkg.dev/robium-prod/robium/site:latest
      - .

images:
  - us-central1-docker.pkg.dev/robium-prod/robium/site:latest

options:
  machineType: E2_HIGHCPU_8
  logging: CLOUD_LOGGING_ONLY
```

- [ ] **Step 2: Write README.md**

```markdown
# robium.org

Landing page for the [robium](https://github.com/jazarium/robium-docs) Claude Code
plugin. Astro 6 static site, Dark/Aurora theme, zero client-side JS. All
content is real: the hero terminal is a condensed transcript from an actual
build, the skill grid is generated from the repo at build time, and the proof
section shows a real policy-evaluation rollout.

## Develop

    npm install
    make dev        # local dev server
    make smoke      # build + content assertions (the done bar)

The skill catalog regenerates on every build from `~/repos/robium` (override
with `ROBIUM_DIR=...`), falling back to the GitHub API, then to the committed
`src/data/skills.json`.

## Deploy (GCP)

One-time setup:

    gcloud projects create robium-prod
    gcloud billing projects link robium-prod --billing-account=<ACCOUNT_ID>
    gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
      artifactregistry.googleapis.com --project=robium-prod
    gcloud artifacts repositories create robium --repository-format=docker \
      --location=us-central1 --project=robium-prod

Each deploy:

    make image      # Cloud Build → Artifact Registry
    make deploy     # → Cloud Run service robium-site

Domain (one-time): map robium.org + www in Cloud Run → Domain mappings, then
add the printed DNS records at the registrar. TLS is managed automatically.

## Launch checklist

- [ ] `jazarium/robium-docs` repo public (install command + CI catalog fetch)
- [ ] `make smoke` green locally and `tests/smoke.sh https://robium.org` green
- [ ] Foxglove capture added to the nav-trial card (v1 ships the smoke
      transcript; swap in the image when captured)
```

- [ ] **Step 3: Final full check**

Run: `make smoke && make docker-smoke && git status --short`
Expected: both `SMOKE PASS`, clean-ish tree (only new files staged next).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: cloudbuild config + deploy runbook

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
