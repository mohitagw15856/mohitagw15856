#!/usr/bin/env node
// The case-study cards: ten SVGs (dark + light) that tell the profile as a product.
// Zero dependencies. Reads GitHub (GraphQL + REST), npm, the PM Skills feeds and this
// repo's own data/history.json (daily snapshots, so retro/status/funnel have a past).
//   PROFILE_TOKEN — a PAT with read access to the pm-claude-skills repo (traffic needs
//                   push/admin-read); falls back to GITHUB_TOKEN, then to the last snapshot.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const OWNER = 'mohitagw15856', REPO = 'pm-claude-skills', FULL = `${OWNER}/${REPO}`;
const TOKEN = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN || '';
const RAW = `https://raw.githubusercontent.com/${FULL}/main`;
const WORKER = 'https://pm-skills-mcp.pm-claude-skills.workers.dev';
const today = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => (n == null || Number.isNaN(+n) ? '—' : Number(n).toLocaleString('en-US'));
const H = { authorization: TOKEN ? `Bearer ${TOKEN}` : undefined, 'user-agent': 'profile-cards' };
async function get(url, { json = true, headers = {} } = {}) {
  try { const r = await fetch(url, { headers: { ...H, ...headers }, signal: AbortSignal.timeout(10000) }); if (!r.ok) return null; return json ? await r.json() : await r.text(); } catch { return null; }
}
async function gql(query) { const r = await get('https://api.github.com/graphql', { json: true, headers: { 'content-type': 'application/json' } }) ; return r; }
async function gqlPost(query) {
  try { const r = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(10000) }); return r.ok ? (await r.json()).data : null; } catch { return null; }
}
async function head(url) { const t0 = Date.now(); try { const r = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) }); return { ok: r.status < 400, status: r.status, ms: Date.now() - t0 }; } catch { return { ok: false, status: 0, ms: Date.now() - t0 }; } }

// ── history ─────────────────────────────────────────────────────────────────
const HIST = 'data/history.json';
const hist = existsSync(HIST) ? JSON.parse(readFileSync(HIST, 'utf8')) : { days: {} };
const lastSnap = () => { const ks = Object.keys(hist.days).sort(); return ks.length ? hist.days[ks[ks.length - 1]] : {}; };
const snapAt = (daysAgo) => { const ks = Object.keys(hist.days).sort(); const target = new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10); const k = ks.filter((d) => d <= target).pop() || ks[0]; return k ? { date: k, ...hist.days[k] } : null; };

// ── data ────────────────────────────────────────────────────────────────────
const user = (await gqlPost(`{ user(login: "${OWNER}") { followers { totalCount } sponsors { totalCount } repositories(privacy: PUBLIC, ownerAffiliations: OWNER, first: 100) { totalCount nodes { stargazerCount } } } }`))?.user || {};
const stars = (user.repositories?.nodes || []).reduce((s, r) => s + r.stargazerCount, 0) || lastSnap().stars;
const repo = await get(`https://api.github.com/repos/${FULL}`) || {};
const releases = [...(await get(`https://api.github.com/repos/${FULL}/releases?per_page=100&page=1`) || []), ...(await get(`https://api.github.com/repos/${FULL}/releases?per_page=100&page=2`) || [])];
const issues = (await get(`https://api.github.com/repos/${FULL}/issues?state=open&per_page=100`) || []).filter((i) => !i.pull_request);
const qStart = new Date(Date.UTC(new Date().getUTCFullYear(), Math.floor(new Date().getUTCMonth() / 3) * 3, 1)).toISOString().slice(0, 10);
const closedQ = (await get(`https://api.github.com/search/issues?q=repo:${FULL}+is:issue+is:closed+closed:>=${qStart}`))?.total_count;
const views = await get(`https://api.github.com/repos/${FULL}/traffic/views`);
const clones = await get(`https://api.github.com/repos/${FULL}/traffic/clones`);
const npm = await get('https://api.npmjs.org/downloads/point/last-month/pm-claude-skills');
const tryStats = await get(`${WORKER}/try/stats`);
const freeRuns = +String(tryStats?.message || '').replace(/[^\d]/g, '') || lastSnap().freeRuns;
const todayJ = await get(`${WORKER}/today.json`) || {};
const skillsJ = await get(`https://${OWNER}.github.io/${REPO}/skills.json`) || {};
const roadmap = await get(`${RAW}/ROADMAP.md`, { json: false }) || '';
const results = await get(`${RAW}/evals/results.json`);
const evalAvg = results?.results?.length ? +(results.results.reduce((s, r) => s + (r.overall || 0), 0) / results.results.length).toFixed(2) : null;
const syco = await get(`${RAW}/skillbench/SYCOPHANCY.md`, { json: false }) || '';
const sycoRow = syco.match(/\|\s*(\d+)\s*\|\s*([\d.]+)%\s*\|\s*([\d.]+)%\s*\|/);
const bench = await get(`${RAW}/skillbench/reports/route-bench.md`, { json: false }) || '';
const benchKw = bench.match(/\| keyword \| \d+ \| ([\d.]+)%/)?.[1], benchAd = bench.match(/adapter[^|]*\| \d+ \| ([\d.]+)%/)?.[1];

// snapshot
const snap = { stars, followers: user.followers?.totalCount ?? lastSnap().followers, openIssues: issues.length, closedQ: closedQ ?? lastSnap().closedQ, views14: views?.count ?? lastSnap().views14, uniques14: views?.uniques ?? lastSnap().uniques14, clones14: clones?.count ?? lastSnap().clones14, cloners14: clones?.uniques ?? lastSnap().cloners14, npmMonth: npm?.downloads ?? lastSnap().npmMonth, freeRuns, skills: skillsJ.count ?? lastSnap().skills, evalAvg: evalAvg ?? lastSnap().evalAvg, trafficLive: !!views };
// status probes
const SURFACES = [
  ['Playground', `https://${OWNER}.github.io/${REPO}/`], ['MCP worker', `${WORKER}/ping`], ['/route', `${WORKER}/route`],
  ['npm package', 'https://registry.npmjs.org/pm-claude-skills'], ['PyPI package', 'https://pypi.org/pypi/pm-skills/json'], ['Catalogue site', 'https://site-jet-seven-34.vercel.app/'],
];
const probes = {}; for (const [name, url] of SURFACES) probes[name] = await head(url);
snap.status = Object.fromEntries(Object.entries(probes).map(([k, v]) => [k, v.ok ? 1 : 0]));
hist.days[today] = snap;
for (const k of Object.keys(hist.days).sort().slice(0, -400)) delete hist.days[k]; // keep ~400 days
mkdirSync('data', { recursive: true }); writeFileSync(HIST, JSON.stringify(hist, null, 1));

// ── svg helpers ─────────────────────────────────────────────────────────────
const THEMES = {
  dark: { bg: '#0d1117', border: '#30363d', text: '#c9d1d9', dim: '#8b949e', title: '#d2a8ff', accent: '#58a6ff', key: '#ffa657', good: '#3fb950', warn: '#d29922', bad: '#f85149', panel: '#161b22', line: '#21262d' },
  light: { bg: '#ffffff', border: '#d0d7de', text: '#24292f', dim: '#57606a', title: '#8250df', accent: '#0969da', key: '#953800', good: '#1a7f37', warn: '#9a6700', bad: '#cf222e', panel: '#f6f8fa', line: '#d8dee4' },
};
const FONT = `font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"`;
const MONO = `font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"`;
function wrap(text, max) { const out = []; let line = ''; for (const w of String(text).split(' ')) { if ((line + ' ' + w).trim().length > max) { out.push(line.trim()); line = w; } else line += ' ' + w; } if (line.trim()) out.push(line.trim()); return out; }
function card(theme, { title, kicker, height, body, foot }) {
  const T = THEMES[theme]; const W = 760;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(title)}">
<rect x="0.5" y="0.5" width="${W - 1}" height="${height - 1}" rx="12" fill="${T.bg}" stroke="${T.border}"/>
<g ${FONT}>
<text x="24" y="30" font-size="11" letter-spacing="1.5" fill="${T.dim}">${esc(kicker).toUpperCase()}</text>
<text x="24" y="54" font-size="19" font-weight="700" fill="${T.title}">${esc(title)}</text>
<line x1="24" y1="66" x2="${W - 24}" y2="66" stroke="${T.line}"/>
${body(T, W)}
${foot ? `<text x="${W - 24}" y="${height - 14}" text-anchor="end" font-size="11" fill="${T.dim}">${esc(foot)}</text>` : ''}
</g></svg>
`;
}
const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 13}" fill="${o.fill}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.mono ? ' ' + MONO : ''}>${esc(s)}</text>`;
function kv(T, x, y, k, v, o = {}) { return `<text x="${x}" y="${y}" font-size="${o.size || 13}"><tspan fill="${T.key}" font-weight="700">${esc(k)}</tspan><tspan fill="${T.dim}"> · </tspan><tspan fill="${T.text}">${esc(v)}</tspan></text>`; }
function bullets(T, x, y, items, max = 64, lh = 18) { let yy = y; const out = []; for (const it of items) { const ls = wrap(it, max); ls.forEach((l, i) => { out.push(t(x, yy, (i ? '  ' : '• ') + l, { fill: T.text })); yy += lh; }); } return { svg: out.join('\n'), y: yy }; }
function bar(T, x, y, w, frac, color) { return `<rect x="${x}" y="${y}" width="${w}" height="8" rx="4" fill="${T.line}"/><rect x="${x}" y="${y}" width="${Math.max(2, Math.round(w * Math.min(1, Math.max(0, frac))))}" height="8" rx="4" fill="${color}"/>`; }
function write(name, build) { for (const theme of ['dark', 'light']) writeFileSync(`${name}-${theme}.svg`, build(theme)); }

// ── 1. PRD ───────────────────────────────────────────────────────────────────
write('cs-prd', (theme) => card(theme, { kicker: 'Product requirements · v79 · status: shipping', title: 'PRD: Mohit (the product)', height: 326, foot: `metrics live as of ${today}`, body: (T) => {
  const L = [];
  let y = 92;
  L.push(kv(T, 24, y, 'Problem', 'AI answers like a very confident intern. The moments that matter need the senior colleague\'s notes.')); y += 26;
  L.push(kv(T, 24, y, 'Users', 'people mid-lease, mid-layoff, mid-launch, mid-grief — at work and at home')); y += 26;
  L.push(kv(T, 24, y, 'Solution', 'one markdown file per task: framework, template, quality checks, anti-patterns')); y += 26;
  L.push(kv(T, 24, y, 'Non-goals', 'a chatbot · a token · a newsletter about newsletters · "it depends"')); y += 26;
  L.push(kv(T, 24, y, 'Open question', 'will "PM stands for Professional" ever stick?')); y += 34;
  L.push(t(24, y, 'SUCCESS METRICS', { size: 11, fill: T.dim })); y += 22;
  const M = [['skills shipped', fmt(snap.skills)], ['GitHub stars', fmt(stars)], ['npm installs / 30d', fmt(snap.npmMonth)], ['free runs served', fmt(freeRuns)], ['eval score', evalAvg ? `${evalAvg} / 5` : '—']];
  M.forEach(([k, v], i) => { const x = 24 + i * 146; L.push(t(x, y, v, { size: 22, weight: 700, fill: T.accent })); L.push(t(x, y + 18, k, { size: 11, fill: T.dim })); });
  return L.join('\n');
} }));

// ── 2. Roadmap ──────────────────────────────────────────────────────────────
const sec = (name) => { const m = roadmap.match(new RegExp(`^## [^\\n]*${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm')); return m ? m[1].split('\n').filter((l) => /^- /.test(l)).map((l) => l.replace(/^- /, '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`/g, '')).slice(0, 4) : []; };
const NOW = sec('Now'), NEXT = sec('Next'), LATER = sec('Later');
const NEVER = ['a Discord', 'a token', 'a rebrand to "PM Skills AI"', 'a skill that says "it depends"'];
write('cs-roadmap', (theme) => card(theme, { kicker: 'Roadmap · from ROADMAP.md, except the last column', title: 'Now / Next / Later / Never', height: 372, foot: 'never is load-bearing', body: (T) => {
  const cols = [['NOW', NOW.length ? NOW : ['the decision layer'], T.good], ['NEXT', NEXT.length ? NEXT : ['expert-reviewed badges'], T.accent], ['LATER', LATER.length ? LATER : ['the printed edition'], T.warn], ['NEVER', NEVER, T.bad]];
  return cols.map(([h, items, c], i) => { const x = 24 + i * 180; let y = 92; const out = [t(x, y, h, { size: 11, fill: c, weight: 700 })]; y += 20; for (const it of items.slice(0, 4)) { for (const l of wrap(it, 24).slice(0, 4)) { out.push(t(x, y, l, { size: 12, fill: T.text })); y += 16; } y += 6; } return out.join('\n'); }).join('\n');
} }));

// ── 3. Timeline ─────────────────────────────────────────────────────────────
const rel = releases.map((r) => ({ tag: r.tag_name, date: (r.published_at || '').slice(0, 10), name: (r.name || '').replace(/^v?[\d.]+\s*[—–-]+\s*/, '') })).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
const picks = []; if (rel.length) { picks.push(rel[0]); const majors = rel.filter((r) => /\.0\.0$/.test(r.tag)); const step = Math.max(1, Math.floor(majors.length / 5)); for (let i = step; i < majors.length - 1; i += step) picks.push(majors[i]); picks.push(rel[rel.length - 1]); }
write('cs-timeline', (theme) => card(theme, { kicker: 'Changelog · semantic versioning applied to a person', title: 'Release history (major bumps are life events)', height: 96 + Math.max(1, picks.length) * 34 + 30, foot: `${rel.length} releases on record`, body: (T) => {
  let y = 92; const out = [`<line x1="88" y1="86" x2="88" y2="${86 + picks.length * 34}" stroke="${T.line}" stroke-width="2"/>`];
  for (const p of picks) { out.push(`<circle cx="88" cy="${y - 4}" r="5" fill="${T.accent}"/>`); out.push(t(24, y, p.tag, { size: 12, fill: T.key, weight: 700, mono: true })); out.push(t(104, y, p.date, { size: 12, fill: T.dim, mono: true })); out.push(t(196, y, wrap(p.name || 'a release', 62)[0] || '', { size: 13, fill: T.text })); y += 34; }
  return out.join('\n');
} }));

// ── 4. Retro ────────────────────────────────────────────────────────────────
const qAgo = snapAt(90); const starsGained = qAgo?.stars != null ? stars - qAgo.stars : null;
write('cs-retro', (theme) => card(theme, { kicker: `Retrospective · quarter starting ${qStart}`, title: 'What went well / what didn\'t / actions', height: 300, foot: starsGained == null ? 'tracking started today — the deltas grow from here' : `deltas vs ${qAgo.date}`, body: (T) => {
  const cols = [['WENT WELL', T.good, [`${fmt(closedQ)} issues closed this quarter`, starsGained != null ? `+${fmt(starsGained)} stars since ${qAgo.date}` : `${fmt(stars)} stars, first snapshot taken`, `eval score ${evalAvg ?? '—'} / 5, in the open`, 'every commit still gated']],
    ['DIDN\'T', T.bad, [`${issues.length} issues still open (${issues.filter((i) => i.labels.some((l) => l.name === 'adopt-a-profession')).length} waiting for a profession to adopt them)`, 'the drift check will catch a stale number; it always does', 'TypeSafe signups closed the week the decision layer shipped']],
    ['ACTIONS', T.accent, ['keep the keyword floor visible', 'recruit three expert reviewers', 'say "PM stands for Professional" once more']]];
  return cols.map(([h, c, items], i) => { const x = 24 + i * 240; const out = [t(x, 92, h, { size: 11, fill: c, weight: 700 })]; out.push(bullets(T, x, 112, items, 34, 16).svg); return out.join('\n'); }).join('\n');
} }));

// ── 5. Funnel ───────────────────────────────────────────────────────────────
write('cs-funnel', (theme) => card(theme, { kicker: 'Acquisition funnel · the drop-offs are the point', title: 'Repo views → visitors → clones → installs → runs', height: 336, foot: snap.trafficLive ? 'traffic: last 14 days · installs: last 30 days · runs: all time' : `traffic as of last snapshot · set PROFILE_TOKEN to refresh`, body: (T) => {
  const steps = [['views (14d)', snap.views14], ['unique visitors', snap.uniques14], ['clones (14d)', snap.clones14], ['npm installs (30d)', snap.npmMonth], ['free runs served', freeRuns]];
  const max = Math.max(...steps.map((s) => +s[1] || 0), 1); let y = 92; const out = [];
  steps.forEach(([k, v], i) => { const prev = steps[i - 1]?.[1]; const conv = prev && v != null ? `${Math.round(100 * v / prev)}% of previous` : ''; out.push(t(24, y, k, { size: 12, fill: T.dim })); out.push(t(736, y, fmt(v), { size: 13, fill: T.text, anchor: 'end', weight: 700 })); if (conv) out.push(t(640, y, conv, { size: 10, fill: T.dim, anchor: 'end' })); out.push(bar(T, 24, y + 8, 712, (+v || 0) / max, i === steps.length - 1 ? T.good : T.accent)); y += 42; });
  return out.join('\n');
} }));

// ── 6. RICE contact table ───────────────────────────────────────────────────
write('cs-rice', (theme) => card(theme, { kicker: 'Prioritisation · RICE, applied to reaching me', title: 'How to get a reply, ranked', height: 300, foot: 'scored with the library\'s own rice-prioritisation skill', body: (T) => {
  const rows = [['Open an issue on pm-claude-skills', 9, 8, 9, 2, 'github.com/mohitagw15856/pm-claude-skills/issues'], ['Email', 6, 7, 8, 3, 'mohit15856@gmail.com'], ['Sponsor a free run', 4, 9, 9, 1, 'github.com/sponsors/mohitagw15856'], ['LinkedIn DM', 5, 3, 5, 2, 'reach: high · impact: "let\'s connect"'], ['Carrier pigeon', 1, 10, 2, 9, 'confidence assumes the pigeon']];
  const scored = rows.map((r) => ({ r, score: +((r[1] * r[2] * r[3]) / r[4]).toFixed(0) })).sort((a, b) => b.score - a.score);
  const out = [['Channel', 24], ['R', 400], ['I', 440], ['C', 480], ['E', 520], ['RICE', 570]].map(([h, x]) => t(x, 90, h, { size: 11, fill: T.dim, weight: 700 }));
  let y = 112; for (const { r, score } of scored) { out.push(t(24, y, r[0], { size: 13, fill: T.text })); [r[1], r[2], r[3], r[4]].forEach((n, i) => out.push(t(400 + i * 40, y, String(n), { size: 12, fill: T.dim, mono: true }))); out.push(t(570, y, String(score), { size: 13, fill: T.accent, weight: 700, mono: true })); out.push(t(24, y + 14, r[5], { size: 10, fill: T.dim })); y += 34; }
  return out.join('\n');
} }));

// ── 7. Competitive teardown ─────────────────────────────────────────────────
write('cs-teardown', (theme) => card(theme, { kicker: 'Competitive teardown · one column is a person', title: 'Mohit vs. a generic AI assistant', height: 320, foot: 'evidence rows update from evals/ and skillbench/', body: (T) => {
  const rows = [['Says "it depends"', '✗', '✓'], ['Publishes negative findings', '✓', '✗'], ['Knows what a security deposit is', '✓', 'sort of'], ['Has a keyword baseline to beat', '✓', 'what?'], ['Eval score, judged blind', evalAvg ? `${evalAvg} / 5` : '—', 'vibes'], ['Flatters you without evidence', sycoRow ? `${sycoRow[2]}% of outputs` : 'measured', 'great question!'], ['Routes to the right skill', benchAd ? `${benchAd}% top-1` : '—', `${benchKw || '—'}% (keyword)`], ['Admits when it is not Jev', '✓', 'n/a']];
  const out = [t(24, 90, 'Capability', { size: 11, fill: T.dim, weight: 700 }), t(430, 90, 'Mohit', { size: 11, fill: T.good, weight: 700 }), t(590, 90, 'Generic AI', { size: 11, fill: T.warn, weight: 700 })];
  let y = 112; for (const [c, a, b] of rows) { out.push(t(24, y, c, { size: 13, fill: T.text })); out.push(t(430, y, a, { size: 13, fill: a === '✗' ? T.bad : T.good, weight: 700 })); out.push(t(590, y, b, { size: 13, fill: b === '✓' ? T.good : T.dim })); y += 25; }
  return out.join('\n');
} }));

// ── 8. Launch post for the skill of the day ────────────────────────────────
const desc = String(todayJ.description || '').replace(/\s+/g, ' '); let first = desc.split(/(?<=\.)\s/)[0] || 'A skill your assistant can read.'; if (first.length > 240) first = first.slice(0, 237).replace(/\s+\S*$/, '') + '…'; const useWhen = (desc.match(/Use when ([^.]*)\./i) || [])[1];
write('cs-launch', (theme) => card(theme, { kicker: `Launch post · regenerated every morning · ${today}`, title: `Introducing ${todayJ.title || todayJ.name || 'today\'s skill'}`, height: 300, foot: 'one of the library\'s skills, launched again like it\'s new', body: (T) => {
  let y = 92; const out = [];
  for (const l of wrap(first, 84).slice(0, 3)) { out.push(t(24, y, l, { size: 14, fill: T.text })); y += 20; }
  y += 6; if (useWhen) { out.push(t(24, y, 'WHO IT\'S FOR', { size: 11, fill: T.dim })); y += 18; { const ls = wrap(`anyone who would say: ${useWhen}`, 84); const shown = ls.slice(0, 2); if (ls.length > 2) shown[1] = shown[1].replace(/\s+\S*$/, '') + '…'; for (const l of shown) { out.push(t(24, y, l, { size: 13, fill: T.text })); y += 18; } } y += 6; }
  out.push(t(24, y, 'INSTALL', { size: 11, fill: T.dim })); y += 20;
  out.push(`<rect x="24" y="${y - 15}" width="712" height="28" rx="6" fill="${T.panel}" stroke="${T.line}"/>`); out.push(t(36, y + 4, `$ npx pm-claude-skills add ${todayJ.name || ''}`, { size: 13, fill: T.good, mono: true }));
  return out.join('\n');
} }));

// ── 9. Status page ──────────────────────────────────────────────────────────
const days = Object.keys(hist.days).sort().slice(-30);
write('cs-status', (theme) => card(theme, { kicker: 'Status · probed daily from the profile action', title: Object.values(probes).every((p) => p.ok) ? 'All systems operational (PM stands for Professional)' : 'Degraded — something needs a look', height: 96 + SURFACES.length * 34 + 30, foot: `last 30 days · ${days.length} day(s) of history`, body: (T) => {
  let y = 92; const out = [];
  for (const [name] of SURFACES) { const p = probes[name]; out.push(`<circle cx="32" cy="${y - 4}" r="5" fill="${p.ok ? T.good : T.bad}"/>`); out.push(t(48, y, name, { size: 13, fill: T.text })); out.push(t(230, y, p.ok ? `${p.ms} ms` : `HTTP ${p.status || 'timeout'}`, { size: 11, fill: T.dim, mono: true }));
    const up = days.filter((d) => hist.days[d].status?.[name] === 1).length; const pct = days.length ? Math.round(100 * up / days.length) : 100;
    days.forEach((d, i) => { const s = hist.days[d].status?.[name]; out.push(`<rect x="${300 + i * 13}" y="${y - 12}" width="10" height="14" rx="2" fill="${s === 1 ? T.good : s === 0 ? T.bad : T.line}"/>`); });
    out.push(t(736, y, `${pct}%`, { size: 12, fill: T.dim, anchor: 'end', mono: true })); y += 34; }
  return out.join('\n');
} }));

// ── 10. Onboarding flow ─────────────────────────────────────────────────────
write('cs-onboarding', (theme) => card(theme, { kicker: 'Onboarding · you are here', title: 'The three-step funnel every visitor is in right now', height: 250, foot: 'conversion numbers are live; the guilt is implied', body: (T) => {
  const steps = [['1 · Try a skill in the browser', 'no install, no signup', `${fmt(freeRuns)} free runs served`, `https://${OWNER}.github.io/${REPO}/`], ['2 · Install with one command', 'npx pm-claude-skills add', `${fmt(snap.npmMonth)} installs this month`, ''], ['3 · Star it if it saved you a mistake', 'this is how others find it', `${fmt(stars)} stars so far`, '']];
  return steps.map(([h, s, n, url], i) => { const x = 24 + i * 240; return [`<rect x="${x}" y="82" width="222" height="120" rx="10" fill="${T.panel}" stroke="${T.line}"/>`, t(x + 14, 108, h, { size: 12, fill: T.text, weight: 700 }), t(x + 14, 128, s, { size: 11, fill: T.dim, mono: true }), t(x + 14, 170, n, { size: 16, fill: T.accent, weight: 700 }), i < 2 ? t(x + 232, 146, '→', { size: 18, fill: T.dim }) : ''].join('\n'); }).join('\n');
} }));

console.log(`10 case-study cards × 2 themes · stars ${stars} · views14 ${snap.views14 ?? '—'} (${snap.trafficLive ? 'live' : 'snapshot'}) · npm ${snap.npmMonth} · runs ${freeRuns} · closedQ ${closedQ} · today ${todayJ.name}`);
