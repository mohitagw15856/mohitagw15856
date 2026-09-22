#!/usr/bin/env node
// Self-updating profile card (neofetch style), dark + light. Zero dependencies.
// Reads GitHub GraphQL (GITHUB_TOKEN) plus two public JSON feeds from PM Skills,
// writes card-dark.svg and card-light.svg. Runs daily from .github/workflows/update.yml.
import { writeFileSync } from 'node:fs';

const LOGIN = process.env.PROFILE_LOGIN || 'mohitagw15856';
const TOKEN = process.env.GITHUB_TOKEN || '';
const CREATED_FALLBACK = '2022-11-25T12:31:54Z';

async function gql(query) {
  if (!TOKEN) return null;
  const r = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
  if (!r.ok) return null;
  return (await r.json()).data;
}
async function json(url, fallback) { try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : fallback; } catch { return fallback; } }

const data = await gql(`{ user(login: "${LOGIN}") { createdAt followers { totalCount } repositories(privacy: PUBLIC, ownerAffiliations: OWNER, first: 100, orderBy: {field: STARGAZERS, direction: DESC}) { totalCount nodes { name stargazerCount forkCount primaryLanguage { name } } } contributionsCollection { totalCommitContributions contributionCalendar { totalContributions } } } }`);
const u = data?.user || {};
const repos = u.repositories?.nodes || [];
const stars = repos.reduce((s, r) => s + r.stargazerCount, 0);
const forks = repos.reduce((s, r) => s + r.forkCount, 0);
const langs = {}; for (const r of repos) { const l = r.primaryLanguage?.name; if (l) langs[l] = (langs[l] || 0) + 1; }
const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l]) => l);
const skills = await json('https://mohitagw15856.github.io/pm-claude-skills/skills.json', {});
const market = await json('https://raw.githubusercontent.com/mohitagw15856/pm-claude-skills/main/.claude-plugin/marketplace.json', {});
const today = await json('https://pm-skills-mcp.pm-claude-skills.workers.dev/today.json', {});

const created = new Date(u.createdAt || CREATED_FALLBACK); const now = new Date();
let y = now.getUTCFullYear() - created.getUTCFullYear(), m = now.getUTCMonth() - created.getUTCMonth(), d = now.getUTCDate() - created.getUTCDate();
if (d < 0) { m--; d += 30; } if (m < 0) { y--; m += 12; }
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const rows = [
  ['OS', 'macOS · Claude Code · too many tabs'],
  ['Uptime', `${y}y ${m}m ${d}d on GitHub`],
  ['Shell', 'zsh, aliases nobody else can read'],
  ['Kernel', 'product manager → builder'],
  null,
  ['Shipped', `${fmt(skills.count)} agent skills · ${fmt(market.plugins?.length)} bundles · MIT`],
  ['Today', today.name ? `${today.name} (skill of the day)` : 'a different skill every day'],
  ['Now', 'a typed decision layer for agent skills'],
  null,
  ['Repos', `${fmt(u.repositories?.totalCount)} public · ${fmt(u.followers?.totalCount)} followers`],
  ['Stars', `${fmt(stars)} · forks ${fmt(forks)}`],
  ['Commits', `${fmt(u.contributionsCollection?.totalCommitContributions)} this year · ${fmt(u.contributionsCollection?.contributionCalendar?.totalContributions)} contributions`],
  ['Languages', topLangs.length ? topLangs.slice(0, 3).join(' · ') : 'JavaScript · Python · C++'],
  null,
  ['Where', 'github.com/mohitagw15856'],
];

const ART = String.raw`
  ____  __  __   ____  _    _ _ _
 |  _ \|  \/  | / ___|| | _(_) | |___
 | |_) | |\/| | \___ \| |/ / | | / __|
 |  __/| |  | |  ___) |   <| | | \__ \
 |_|   |_|  |_| |____/|_|\_\_|_|_|___/

   ┌──────────────────┐
   │ SKILL.md         │
   │ ──────────────── │
   │ • framework      │
   │ • output template│
   │ • quality checks │
   │ • anti-patterns  │
   └──────────────────┘

   $ npx pm-claude-skills add
   ▌`.split('\n').slice(1);

function render(theme) {
  const T = theme === 'dark'
    ? { bg: '#0d1117', border: '#30363d', text: '#c9d1d9', key: '#ffa657', val: '#a5d6ff', dim: '#8b949e', art: '#7ee787', accent: '#d2a8ff' }
    : { bg: '#ffffff', border: '#d0d7de', text: '#24292f', key: '#953800', val: '#0a3069', dim: '#57606a', art: '#1a7f37', accent: '#8250df' };
  const W = 1000, H = 470, LH = 22, x0 = 420, y0 = 74;
  const artLines = ART.map((l, i) => `<text x="28" y="${y0 - 4 + i * 21}" class="art">${esc(l).replace(/ /g, ' ')}</text>`).join('\n');
  let y = y0; const body = [];
  for (const r of rows) {
    if (!r) { y += 10; continue; }
    const [k, v] = r;
    body.push(`<text x="${x0}" y="${y}"><tspan class="key">${esc(k)}</tspan><tspan class="dim">: </tspan><tspan class="val">${esc(v)}</tspan></text>`);
    y += LH;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mohit — GitHub profile card">
<style>
  text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 14px; fill: ${T.text}; }
  .key { fill: ${T.key}; font-weight: 700; } .val { fill: ${T.val}; } .dim { fill: ${T.dim}; } .art { fill: ${T.art}; font-size: 13px; }
  .title { fill: ${T.accent}; font-weight: 700; font-size: 17px; } .hint { fill: ${T.dim}; font-size: 12px; }
  .cursor { animation: blink 1.1s steps(2, start) infinite; } @keyframes blink { to { visibility: hidden; } }
  .dot { animation: pulse 2.4s ease-in-out infinite; } @keyframes pulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${T.bg}" stroke="${T.border}"/>
<circle cx="24" cy="24" r="6" fill="#ff5f56"/><circle cx="44" cy="24" r="6" fill="#ffbd2e"/><circle cx="64" cy="24" r="6" fill="#27c93f" class="dot"/>
<text x="${W / 2}" y="30" text-anchor="middle" class="hint" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12">mohit@github ~ % neofetch --profile</text>
<text x="${x0}" y="${y0 - 26}" class="title" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="17">mohit<tspan class="dim">@</tspan>github</text>
<text x="${x0}" y="${y0 - 10}" class="dim" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14">${'─'.repeat(52)}</text>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" font-size="13">
${artLines}
</g>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" font-size="14">
${body.join('\n')}
</g>
<text x="${x0}" y="${y + 6}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14"><tspan class="dim">$ </tspan><tspan class="cursor">▌</tspan></text>
<text x="${W - 24}" y="${H - 14}" text-anchor="end" class="hint" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12">updated ${now.toISOString().slice(0, 10)} · rebuilt daily by a GitHub Action</text>
</svg>
`;
}
writeFileSync('card-dark.svg', render('dark'));
writeFileSync('card-light.svg', render('light'));

// ── Featured repo cards (self-hosted; no third-party stats service to go 503) ──
const FEATURED = [
  ['pm-claude-skills', 'The library. 1166 skills, 132 bundles, a playground, an MCP server, and a typed decision layer that answers which skill? is it safe? ship or slip? with a probability.', 'Markdown · JavaScript'],
  ['notugly', 'Provably not ugly. Generate a design system from a seed; every text pairing clears WCAG AA before you see it. A GitHub Action fails your PR on a contrast regression.', null],
  ['rulebook', 'Settle the argument. 37 board and card games, 203 rulings, and which house rules are actually real. With an MCP server, because of course.', null],
  ['runs-on-what', 'Will this model run on my machine, and how fast? One command benchmarks your hardware and opens a PR. Comparable numbers, or none at all.', null],
];
const byName = Object.fromEntries(repos.map((r) => [r.name, r]));
function wrap(text, max) { const out = []; let line = ''; for (const w of text.split(' ')) { if ((line + ' ' + w).trim().length > max) { out.push(line.trim()); line = w; } else line += ' ' + w; } if (line.trim()) out.push(line.trim()); return out.slice(0, 3); }
function repoCard(name, blurb, theme, langLabel) {
  const T = theme === 'dark'
    ? { bg: '#0d1117', border: '#30363d', text: '#c9d1d9', title: '#58a6ff', dim: '#8b949e', accent: '#d2a8ff' }
    : { bg: '#ffffff', border: '#d0d7de', text: '#24292f', title: '#0969da', dim: '#57606a', accent: '#8250df' };
  const r = byName[name] || {}; const W = 480, H = 168;
  const lines = wrap(blurb, 62).map((l, i) => `<text x="22" y="${62 + i * 19}" font-size="13" fill="${T.text}">${esc(l)}</text>`).join('');
  const lang = langLabel || r.primaryLanguage?.name || 'Markdown';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(name)}: ${esc(blurb)}">
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${T.bg}" stroke="${T.border}"/>
<g font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">
<text x="22" y="34" font-size="17" font-weight="700" fill="${T.title}">📦 ${esc(name)}</text>
${lines}
<text x="22" y="${H - 20}" font-size="12.5" fill="${T.dim}"><tspan fill="${T.accent}">●</tspan> ${esc(lang)}   ★ ${fmt(r.stargazerCount ?? 0)}   ⑂ ${fmt(r.forkCount ?? 0)}</text>
</g></svg>
`;
}
for (const [name, blurb, lang] of FEATURED) { writeFileSync(`repo-${name}-dark.svg`, repoCard(name, blurb, 'dark', lang)); writeFileSync(`repo-${name}-light.svg`, repoCard(name, blurb, 'light', lang)); }
console.log(`card + ${FEATURED.length} repo cards (dark/light) — stars ${stars}, repos ${u.repositories?.totalCount}, skills ${skills.count}, today ${today.name || '-'}`);

// ── Tagline: a self-hosted typing animation (no third-party image service) ──
const LINES = ['1166 agent skills, one markdown file each.', 'Decode the lease before you sign it.', 'Ship or slip? A probability, not a paragraph.', 'PM stands for Professional. Yes, we get asked.'];
function tagline(theme) {
  const T = theme === 'dark' ? { fg: '#d2a8ff', dim: '#8b949e' } : { fg: '#6e40c9', dim: '#57606a' };
  const W = 760, H = 44, per = 3.2, total = per * LINES.length;
  const items = LINES.map((l, i) => `<text class="l l${i}" x="${W / 2}" y="29" text-anchor="middle" font-size="19" font-weight="600" fill="${T.fg}">${esc(l)}</text>`).join('\n');
  const delays = LINES.map((_, i) => `.l${i} { animation-delay: ${(i * per).toFixed(2)}s }`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(LINES.join(' '))}">
<style>
  .l { opacity: 0; animation: cycle ${total}s linear infinite both; } .l0 { opacity: 1; } ${delays}
  @keyframes cycle { 0% { opacity: 0 } 3% { opacity: 1 } 22% { opacity: 1 } 25% { opacity: 0 } 100% { opacity: 0 } }
  .c { animation: blink 1.1s steps(2, start) infinite; } @keyframes blink { to { visibility: hidden } }
</style>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">
${items}
<text class="c" x="${W - 8}" y="40" text-anchor="end" font-size="10" fill="${T.dim}">▌</text>
</g></svg>
`;
}
writeFileSync('tagline-dark.svg', tagline('dark'));
writeFileSync('tagline-light.svg', tagline('light'));
