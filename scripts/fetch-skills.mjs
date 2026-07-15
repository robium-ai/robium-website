// scripts/fetch-skills.mjs — build-time skill catalog generation.
// Prefers the local robium checkout; falls back to the GitHub API so CI
// builds work once the repo is public. Trims each description to its
// capability sentence (text before "Use when:").
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const OUT = 'src/data/skills.json';
const ROBIUM_DIR = process.env.ROBIUM_DIR ?? join(homedir(), 'repos/robium-plugin');
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
  const list = await (await fetch('https://api.github.com/repos/jazarium/robium-plugin/contents/skills')).json();
  if (!Array.isArray(list)) return []; // private repo / rate limit → {message: ...}
  const skills = [];
  for (const entry of list) {
    if (entry.type !== 'dir' || SKIP.has(entry.name)) continue;
    const res = await fetch(`https://raw.githubusercontent.com/jazarium/robium-plugin/main/skills/${entry.name}/SKILL.md`);
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
  try {
    skills = await fromGitHub();
    console.log(`fetch-skills: ${skills.length} skills from GitHub API`);
  } catch {
    skills = [];
  }
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
