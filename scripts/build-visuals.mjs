#!/usr/bin/env node
// Ten visual elements, dark + light, zero dependencies. Same daily action as the rest.
//   vis-galaxy      one dot per skill, clustered by bundle, coloured by risk tier; today's skill pulses
//   vis-cinemagraph a looping animation: a prompt is typed, routed with probabilities, an artifact appears
//   vis-tree        the skill tree of the person, nodes dated from repo creation
//   vis-map         a dotted world map of countries the worker has served (aggregate country codes only)
//   vis-words       the 60 most frequent words in the last 500 commit subjects
//   vis-medals      milestone medals, greyed until earned
//   vis-hours       when the commits happen, by UTC hour
//   vis-ring        the library by risk tier, with the expert-review count
//   social-card     a 1200×630 preview card with live numbers (upload as the repo's social preview)
//   (sparklines are drawn into cs-prd by build-cards.mjs from data/history.json)
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const OWNER = 'mohitagw15856', REPO = 'pm-claude-skills', FULL = `${OWNER}/${REPO}`;
const TOKEN = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN || '';
const RAW = `https://raw.githubusercontent.com/${FULL}/main`;
const WORKER = 'https://pm-skills-mcp.pm-claude-skills.workers.dev';
const today = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => (n == null || Number.isNaN(+n) ? '—' : Number(n).toLocaleString('en-US'));
const H = { authorization: TOKEN ? `Bearer ${TOKEN}` : undefined, 'user-agent': 'profile-visuals' };
async function get(url, { json = true, headers = {} } = {}) { try { const r = await fetch(url, { headers: { ...H, ...headers }, signal: AbortSignal.timeout(12000) }); if (!r.ok) return null; return json ? await r.json() : await r.text(); } catch { return null; } }
async function gqlPost(query) { try { const r = await fetch('https://api.github.com/graphql', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(12000) }); return r.ok ? (await r.json()).data : null; } catch { return null; } }
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const rnd = (seed) => { let x = hash(seed) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return (x % 10000) / 10000; }; };

const THEMES = {
  dark: { bg: '#0d1117', border: '#30363d', text: '#c9d1d9', dim: '#8b949e', title: '#d2a8ff', accent: '#58a6ff', key: '#ffa657', good: '#3fb950', warn: '#d29922', bad: '#f85149', panel: '#161b22', line: '#21262d', grid: '#1c2129' },
  light: { bg: '#ffffff', border: '#d0d7de', text: '#24292f', dim: '#57606a', title: '#8250df', accent: '#0969da', key: '#953800', good: '#1a7f37', warn: '#9a6700', bad: '#cf222e', panel: '#f6f8fa', line: '#d8dee4', grid: '#eef1f5' },
};
const FONT = `font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"`;
const MONO = `font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"`;
function card(theme, { title, kicker, height, body, foot, width = 760 }) {
  const T = THEMES[theme]; const W = width;
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
const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 13}" fill="${o.fill}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.mono ? ' ' + MONO : ''}${o.cls ? ` class="${o.cls}"` : ''}${o.op != null ? ` opacity="${o.op}"` : ''}>${esc(s)}</text>`;
function write(name, build) { for (const theme of ['dark', 'light']) writeFileSync(`${name}-${theme}.svg`, build(theme)); }

// ── data ────────────────────────────────────────────────────────────────────
const skillsJ = await get(`https://${OWNER}.github.io/${REPO}/skills.json`) || { skills: [] };
const skills = (skillsJ.skills || []).filter((s) => !s.deprecated);
const tiers = (await get(`https://${OWNER}.github.io/${REPO}/risk-tiers.json`))?.tiers || {};
const review = await get(`${RAW}/config/human-review.json`) || { reviews: [] };
const todayJ = await get(`${WORKER}/today.json`) || {};
const geo = await get(`${WORKER}/geo.json`) || { countries: {}, total: 0 };
let commits = []; for (let page = 1; page <= 5; page++) { const c = await get(`https://api.github.com/repos/${FULL}/commits?per_page=100&page=${page}`); if (!c || !c.length) break; commits.push(...c); }
const star1000 = (await get(`https://api.github.com/repos/${FULL}/stargazers?per_page=100&page=10`, { headers: { accept: 'application/vnd.github.star+json' } }) || []).slice(-1)[0]?.starred_at?.slice(0, 10);
const extPRs = (await get(`https://api.github.com/search/issues?q=repo:${FULL}+is:pr+is:merged+-author:${OWNER}&sort=created&order=asc&per_page=20`))?.items || [];
const firstExt = extPRs.find((p) => !/\[bot\]$/.test(p.user?.login || ''));
const closedIssues = await get(`https://api.github.com/search/issues?q=repo:${FULL}+is:issue+is:closed&sort=created&order=asc&per_page=100`);
const releases = [...(await get(`https://api.github.com/repos/${FULL}/releases?per_page=100&page=1`) || []), ...(await get(`https://api.github.com/repos/${FULL}/releases?per_page=100&page=2`) || [])].sort((a, b) => (a.published_at || '').localeCompare(b.published_at || ''));
const repos = (await gqlPost(`{ user(login: "${OWNER}") { repositories(first: 100, privacy: PUBLIC, ownerAffiliations: OWNER) { nodes { name createdAt stargazerCount } } } }`))?.user?.repositories?.nodes || [];
const repoBy = Object.fromEntries(repos.map((r) => [r.name, r]));
const repoMeta = await get(`https://api.github.com/repos/${FULL}`) || {};
const hist = existsSync('data/history.json') ? JSON.parse(readFileSync('data/history.json', 'utf8')) : { days: {} };
const last = hist.days[Object.keys(hist.days).sort().pop()] || {};

// ── 1. galaxy minimap ───────────────────────────────────────────────────────
write('vis-galaxy', (theme) => card(theme, { kicker: `galaxy minimap · ${fmt(skills.length)} skills in ${fmt(new Set(skills.map((s) => s.plugin)).size)} bundles`, title: 'Every skill, one dot. Today\'s is the one pulsing.', height: 330, foot: 'coloured by risk tier · the full Galaxy 3D is on the playground', body: (T) => {
  const tierColor = { 'high-stakes': T.bad, consequential: T.warn, informational: T.accent };
  const groups = {}; for (const s of skills) (groups[s.plugin || 'misc'] ||= []).push(s);
  const names = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  const cx = 380, cy = 190, out = [];
  // golden-angle spiral for bundle centres, biggest bundles nearest the middle
  names.forEach((b, i) => {
    const ang = i * 2.399963, r = 14 * Math.sqrt(i + 1);
    const bx = cx + Math.cos(ang) * r * 1.9, by = cy + Math.sin(ang) * r * 0.62;
    const R = 4 + Math.sqrt(groups[b].length) * 2.2; const rr = rnd(b);
    for (const s of groups[b]) {
      const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * R;
      const x = (bx + Math.cos(a) * d).toFixed(1), y = (by + Math.sin(a) * d * 0.8).toFixed(1);
      const isToday = s.name === todayJ.name;
      out.push(`<circle cx="${x}" cy="${y}" r="${isToday ? 5 : 1.6}" fill="${isToday ? T.title : tierColor[tiers[s.name]?.tier] || T.dim}" opacity="${isToday ? 1 : 0.85}"${isToday ? ' class="pulse"' : ''}/>`);
      if (isToday) out.push(`<text x="${+x + 9}" y="${+y + 4}" font-size="11" fill="${T.title}" font-weight="700">${esc(s.name)}</text>`);
    }
  });
  const legend = [['high-stakes', T.bad], ['consequential', T.warn], ['informational', T.accent]].map(([k, c], i) => `<circle cx="${34 + i * 120}" cy="${306}" r="3.5" fill="${c}"/><text x="${44 + i * 120}" y="310" font-size="11" fill="${T.dim}">${k}</text>`).join('');
  return `<style>.pulse{animation:pulse 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.8);opacity:.55}}</style>` + out.join('\n') + legend;
} }));

// ── 2. cinemagraph ──────────────────────────────────────────────────────────
write('vis-cinemagraph', (theme) => card(theme, { kicker: 'the whole product in eight seconds · loops', title: 'A prompt → a typed decision → an artifact', height: 300, foot: 'the numbers shown are a real route from the decision layer', body: (T) => {
  // GitHub strips inline style attributes from SVG images, so every delay is a generated class.
  const prompt = 'my landlord kept my security deposit';
  const rules = [];
  const chars = [...prompt].map((c, i) => { rules.push(`.c${i}{animation-delay:${(0.2 + i * 0.05).toFixed(2)}s}`); return `<text class="ch c${i}" x="${(48 + i * 8.4).toFixed(1)}" y="122" font-size="13" fill="${T.text}" ${MONO}>${esc(c === ' ' ? ' ' : c)}</text>`; }).join('');
  const rows = [['security-deposit-recovery', 0.92, T.good], ['lease-decoder', 0.05, T.accent], ['tenant-rights-explainer', 0.02, T.accent]];
  const bars = rows.map(([n, p, c], i) => { rules.push(`.b${i}{animation-delay:${(2.4 + i * 0.25).toFixed(2)}s}`, `.f${i}{animation-delay:${(2.6 + i * 0.25).toFixed(2)}s}`); return `<text class="rv b${i}" x="24" y="${146 + i * 24}" font-size="12" fill="${T.text}">${esc(n)}</text><rect x="230" y="${137 + i * 24}" width="240" height="8" rx="4" fill="${T.line}"/><rect class="fill f${i}" x="230" y="${137 + i * 24}" width="${Math.round(240 * p)}" height="8" rx="4" fill="${c}"/><text class="rv b${i}" x="480" y="${146 + i * 24}" font-size="12" fill="${T.dim}" ${MONO}>${p.toFixed(2)}</text>`; }).join('');
  const lines = ['# Deposit Recovery: $1,500 · phase: challenging', '| Claimed | Amount | Type | Response |', '| Cleaning | $400 | unsubstantiated | request itemised receipt |', '| Paint | $800 | wear, 3-year tenancy | cite useful life |', 'Next: the demand letter, sent within 7 days.'];
  const art = lines.map((l, i) => { rules.push(`.a${i}{animation-delay:${(4.6 + i * 0.3).toFixed(2)}s}`); return `<text class="rv a${i}" x="24" y="${230 + i * 15}" font-size="11" fill="${i === 0 ? T.title : T.text}" ${MONO}>${esc(l)}</text>`; }).join('');
  rules.push('.hb{animation-delay:2.4s}', '.ha{animation-delay:4.4s}');
  return `<style>
  .ch,.rv{opacity:1;animation:show 9s linear infinite both}
  .fill{transform:scaleX(1);transform-box:fill-box;transform-origin:left center;animation:grow 9s linear infinite both}
  @keyframes show{0%{opacity:0}1%{opacity:1}92%{opacity:1}100%{opacity:0}}
  @keyframes grow{0%{transform:scaleX(0)}8%{transform:scaleX(1)}92%{transform:scaleX(1)}100%{transform:scaleX(0)}}
  .cur{animation:blink 1s steps(2,start) infinite}@keyframes blink{to{visibility:hidden}}
  ${rules.join('')}
</style>
<text x="24" y="96" font-size="11" fill="${T.dim}">YOU TYPE</text>
<rect x="24" y="104" width="712" height="26" rx="6" fill="${T.panel}" stroke="${T.line}"/>
<text x="34" y="122" font-size="13" fill="${T.dim}" ${MONO}>$</text>
${chars}
<text class="cur" x="${(48 + prompt.length * 8.4 + 2).toFixed(1)}" y="122" font-size="13" fill="${T.text}" ${MONO}>▌</text>
<text class="rv hb" x="500" y="146" font-size="11" fill="${T.dim}">THE ROUTER PICKS · confidence 0.87</text>
${bars}
<text class="rv ha" x="24" y="214" font-size="11" fill="${T.dim}">THE SKILL PRODUCES</text>
${art}`;
} }));

// ── 3. skill tree ───────────────────────────────────────────────────────────
write('vis-tree', (theme) => card(theme, { kicker: 'skill tree · nodes unlock as repos land', title: 'The skill tree of a product manager who started building', height: 300, foot: 'dates are repo creation dates', body: (T) => {
  const d = (n) => repoBy[n]?.createdAt?.slice(0, 7) || '';
  const nodes = [
    { id: 'root', x: 80, y: 180, label: 'product manager', sub: '2022 · GitHub uptime begins', c: T.dim },
    { id: 'lib', x: 260, y: 110, label: 'pm-claude-skills', sub: `${d('pm-claude-skills')} · the library`, c: T.title, from: 'root' },
    { id: 'dec', x: 470, y: 80, label: 'decision layer', sub: '2026-09 · typed questions', c: T.good, from: 'lib' },
    { id: 'spec', x: 470, y: 128, label: 'skillspec', sub: `${d('skillspec')} · the standard`, c: T.accent, from: 'lib' },
    { id: 'gpt', x: 470, y: 176, label: 'professional-gpt-library', sub: `${d('professional-gpt-library')} · the ChatGPT twin`, c: T.accent, from: 'lib' },
    { id: 'design', x: 260, y: 200, label: 'notugly', sub: `${d('notugly')} · provably not ugly`, c: T.warn, from: 'root' },
    { id: 'games', x: 260, y: 240, label: 'rulebook', sub: `${d('rulebook')} · settle the argument`, c: T.warn, from: 'root' },
    { id: 'ink', x: 470, y: 224, label: 'Inkkit', sub: `${d('Inkkit')} · e-ink side quest`, c: T.key, from: 'root' },
    { id: 'cards', x: 640, y: 204, label: 'Inkcards', sub: d('Inkcards'), c: T.key, from: 'ink' },
    { id: 'wiki', x: 640, y: 244, label: 'PocketWiki', sub: d('PocketWiki'), c: T.key, from: 'ink' },
    { id: 'row', x: 640, y: 128, label: 'runs-on-what', sub: `${d('runs-on-what')} · benchmarks`, c: T.accent, from: 'spec' },
  ];
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const links = nodes.filter((n) => n.from).map((n) => { const f = by[n.from]; return `<path d="M${f.x + 8} ${f.y} C ${(f.x + n.x) / 2} ${f.y}, ${(f.x + n.x) / 2} ${n.y}, ${n.x - 8} ${n.y}" fill="none" stroke="${T.line}" stroke-width="2"/>`; }).join('');
  const dots = nodes.map((n) => `<circle cx="${n.x}" cy="${n.y}" r="6" fill="${n.c}"/><text x="${n.x + 12}" y="${n.y - 2}" font-size="12" font-weight="700" fill="${T.text}">${esc(n.label)}</text><text x="${n.x + 12}" y="${n.y + 12}" font-size="10" fill="${T.dim}">${esc(n.sub)}</text>`).join('');
  return links + dots;
} }));

// ── 4. world map of visitors ───────────────────────────────────────────────
const CENTROIDS = { US: [39, -98], CA: [56, -106], MX: [23, -102], BR: [-10, -55], AR: [-34, -64], CL: [-30, -71], CO: [4, -73], PE: [-10, -76], GB: [54, -2], IE: [53, -8], FR: [46, 2], DE: [51, 10], ES: [40, -4], PT: [39, -8], IT: [42, 12], NL: [52, 5], BE: [50, 4], CH: [47, 8], AT: [47, 14], SE: [62, 15], NO: [61, 8], DK: [56, 10], FI: [64, 26], PL: [52, 20], CZ: [50, 15], HU: [47, 19], RO: [46, 25], GR: [39, 22], TR: [39, 35], UA: [49, 32], RU: [61, 90], IL: [31, 35], SA: [24, 45], AE: [24, 54], EG: [26, 30], NG: [9, 8], KE: [0, 38], ZA: [-29, 25], MA: [32, -6], IN: [21, 78], PK: [30, 70], BD: [24, 90], LK: [7, 81], NP: [28, 84], CN: [35, 105], JP: [36, 138], KR: [36, 128], TW: [24, 121], HK: [22, 114], SG: [1, 104], MY: [4, 102], TH: [15, 101], VN: [16, 108], PH: [13, 122], ID: [-2, 118], AU: [-25, 134], NZ: [-41, 174], ZZ: [0, 0] };
write('vis-map', (theme) => card(theme, { kicker: `visitor map · ${fmt(geo.total)} runs and routes served · aggregate country codes only`, title: geo.total ? 'Where the free runs come from' : 'Where the free runs will come from (counting started today)', height: 330, foot: 'no IPs, no timestamps — the worker keeps one integer per country', body: (T) => {
  const W = 712, X0 = 24, Y0 = 84, Hh = 200;
  const proj = ([lat, lon]) => [X0 + ((lon + 180) / 360) * W, Y0 + ((90 - lat) / 180) * Hh];
  const grid = []; for (let lon = -180; lon <= 180; lon += 30) { const [x] = proj([0, lon]); grid.push(`<line x1="${x.toFixed(1)}" y1="${Y0}" x2="${x.toFixed(1)}" y2="${Y0 + Hh}" stroke="${T.grid}"/>`); } for (let lat = -60; lat <= 60; lat += 30) { const [, y] = proj([lat, 0]); grid.push(`<line x1="${X0}" y1="${y.toFixed(1)}" x2="${X0 + W}" y2="${y.toFixed(1)}" stroke="${T.grid}"/>`); }
  const faint = Object.entries(CENTROIDS).filter(([k]) => k !== 'ZZ').map(([k, ll]) => { const [x, y] = proj(ll); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${T.line}"/>`; }).join('');
  const entries = Object.entries(geo.countries || {}).filter(([k]) => k !== 'ZZ' && CENTROIDS[k]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  const hot = entries.map(([k, n]) => { const [x, y] = proj(CENTROIDS[k]); const r = 3 + 9 * Math.sqrt(n / max); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${T.accent}" opacity="0.35"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${T.accent}"/><text x="${(x + r + 3).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="10" fill="${T.text}">${k} ${fmt(n)}</text>`; }).join('');
  const top = entries.slice(0, 6).map(([k, n]) => `${k} ${fmt(n)}`).join(' · ') || 'no countries yet';
  return grid.join('') + faint + hot + t(24, 306, `top: ${top}`, { size: 11, fill: T.dim });
} }));

// ── 5. commit word cloud ───────────────────────────────────────────────────
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was', 'not', 'via', 'per', 'all', 'one', 'now', 'its', 'has', 'have', 'than', 'then', 'when', 'over', 'out', 'use', 'new', 'add', 'adds', 'added', 'update', 'updates', 'updated', 'fix', 'fixes', 'fixed', 'chore', 'feat', 'docs', 'release', 'merge', 'pull', 'request', 'branch', 'main', 'onto', 'also', 'more', 'less', 'only', 'each', 'every', 'their', 'they', 'them', 'were', 'been', 'will', 'can', 'still', 'skills', 'skill']);
const freq = {}; for (const c of commits) { const subj = (c.commit?.message || '').split('\n')[0].toLowerCase(); for (const w of subj.replace(/[`'"(){}\[\]#:,.;!?/\\|→—–-]+/g, ' ').split(/\s+/)) if (w.length > 2 && !STOP.has(w) && !/^\d/.test(w) && !/^v\d/.test(w)) freq[w] = (freq[w] || 0) + 1; }
const words = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 60);
write('vis-words', (theme) => card(theme, { kicker: `commit vocabulary · last ${fmt(commits.length)} commit subjects`, title: 'What I say when I ship', height: 300, foot: '"skills" and "skill" removed, or the card would be one word', body: (T) => {
  if (!words.length) return t(24, 100, 'no commits fetched', { fill: T.dim });
  const max = words[0][1], min = words[words.length - 1][1];
  const size = (n) => 11 + 23 * ((n - min) / Math.max(1, max - min)) ** 0.7;
  const palette = [T.title, T.accent, T.good, T.key, T.text];
  // greedy row packing, rows centred
  const rows = []; let row = [], w = 0; const maxW = 712;
  for (const [word, n] of words) { const s = size(n); const ww = s * 0.58 * word.length + 14; if (w + ww > maxW && row.length) { rows.push({ row, w }); row = []; w = 0; } row.push({ word, s, ww, n }); w += ww; }
  if (row.length) rows.push({ row, w });
  let y = 96; const out = [];
  for (const r of rows) { const lh = Math.max(...r.row.map((x) => x.s)) + 6; let x = 24 + (maxW - r.w) / 2; y += lh * 0.8; for (const it of r.row) { out.push(`<text x="${(x + it.ww / 2).toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="${it.s.toFixed(1)}" font-weight="${it.s > 22 ? 700 : 500}" fill="${palette[hash(it.word) % palette.length]}">${esc(it.word)}</text>`); x += it.ww; } y += lh * 0.25; if (y > 270) break; }
  return out.join('\n');
} }));

// ── 6. medal rack ──────────────────────────────────────────────────────────
const closed100 = closedIssues?.total_count >= 100 ? closedIssues.items?.[99]?.closed_at?.slice(0, 10) : null;
const MEDALS = [
  ['🚀', 'First release', releases[0]?.published_at?.slice(0, 10)],
  ['🤝', 'First external contributor', firstExt?.closed_at?.slice(0, 10)],
  ['⭐', '1,000 stars', star1000],
  ['🔁', '100 releases', releases[99]?.published_at?.slice(0, 10)],
  ['🧹', '100 issues closed', closed100 || (closedIssues?.total_count ? `${closedIssues.total_count}/100` : null)],
  ['🧠', '1,000 skills', releases.find((r) => /\b1[,.]?0\d\d\b|1,0\d\d skills/i.test(r.name || '') || /1[0-9]{3} skills/.test(r.body || ''))?.published_at?.slice(0, 10)],
  ['🎓', 'First expert review', review.reviews?.length ? review.reviews[0].date : null],
  ['🎯', 'Decision layer live', releases.find((r) => /decision layer/i.test(r.name || ''))?.published_at?.slice(0, 10)],
];
write('vis-medals', (theme) => card(theme, { kicker: 'milestones · greyed until earned', title: 'The medal rack', height: 236, foot: 'dates from releases, stargazers, PRs and the review registry', body: (T) => MEDALS.map(([icon, label, date], i) => {
  const earned = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date); const x = 24 + (i % 4) * 178, y = 90 + Math.floor(i / 4) * 66;
  return `<rect x="${x}" y="${y}" width="166" height="54" rx="10" fill="${T.panel}" stroke="${earned ? T.good : T.line}"${earned ? '' : ' stroke-dasharray="3 3"'}/><text x="${x + 14}" y="${y + 33}" font-size="22"${earned ? '' : ' opacity="0.35"'}>${icon}</text><text x="${x + 50}" y="${y + 24}" font-size="12" font-weight="700" fill="${earned ? T.text : T.dim}">${esc(label)}</text><text x="${x + 50}" y="${y + 41}" font-size="10.5" fill="${T.dim}" ${MONO}>${esc(earned ? date : (date || 'locked'))}</text>`;
}).join('') }));

// ── 7. commits by hour ─────────────────────────────────────────────────────
const hours = new Array(24).fill(0); for (const c of commits) { const d = c.commit?.author?.date; if (d) hours[new Date(d).getUTCHours()]++; }
write('vis-hours', (theme) => card(theme, { kicker: `a day in the life · last ${fmt(commits.length)} commits by hour (UTC)`, title: 'When the commits happen', height: 230, foot: 'the late ones are the honest ones', body: (T) => {
  const max = Math.max(1, ...hours); const out = []; const peak = hours.indexOf(max);
  hours.forEach((n, h) => { const x = 24 + h * 29.6, hh = Math.round(100 * n / max); out.push(`<rect x="${x}" y="${190 - hh}" width="22" height="${hh}" rx="3" fill="${h === peak ? T.title : (h >= 22 || h < 6) ? T.warn : T.accent}"/>`); if (h % 3 === 0) out.push(t(x + 11, 206, `${String(h).padStart(2, '0')}`, { size: 10, fill: T.dim, anchor: 'middle', mono: true })); if (n === max) out.push(t(x + 11, 184 - hh, String(n), { size: 10, fill: T.text, anchor: 'middle' })); });
  return out.join('');
} }));

// ── 8. risk-tier ring ──────────────────────────────────────────────────────
const counts = { 'high-stakes': 0, consequential: 0, informational: 0 }; for (const s of skills) counts[tiers[s.name]?.tier || 'informational']++;
write('vis-ring', (theme) => card(theme, { kicker: 'the library by risk tier · and who has checked the risky ones', title: `${fmt(review.reviews?.length || 0)} of ${fmt(counts['high-stakes'])} high-stakes skills expert-reviewed`, height: 250, foot: 'the ring nags the expert-review program forward on purpose', body: (T) => {
  const total = Math.max(1, skills.length); const cx = 120, cy = 158, R = 58, r = 38; let a0 = -Math.PI / 2; const segs = [];
  const col = { 'high-stakes': T.bad, consequential: T.warn, informational: T.accent };
  for (const [k, n] of Object.entries(counts)) { const a1 = a0 + (n / total) * Math.PI * 2; const large = a1 - a0 > Math.PI ? 1 : 0; const p = (a, rr) => `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`; segs.push(`<path d="M${p(a0, R)} A${R} ${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r} ${r} 0 ${large} 0 ${p(a0, r)} Z" fill="${col[k]}"/>`); a0 = a1; }
  const legend = Object.entries(counts).map(([k, n], i) => `<rect x="220" y="${104 + i * 30}" width="12" height="12" rx="3" fill="${col[k]}"/><text x="240" y="${115 + i * 30}" font-size="13" fill="${T.text}">${k} · <tspan font-weight="700">${fmt(n)}</tspan> <tspan fill="${T.dim}">(${Math.round(100 * n / total)}%)</tspan></text>`).join('');
  return segs.join('') + t(cx, cy + 5, fmt(skills.length), { size: 16, weight: 700, fill: T.text, anchor: 'middle' }) + legend + t(500, 115, 'high-stakes = being wrong costs money, rights, health or safety', { size: 11, fill: T.dim }) + t(500, 133, 'reviewers wanted: docs/EXPERT-REVIEW-PROGRAM.md', { size: 11, fill: T.accent });
} }));

// ── 9. social card (1200×630) ──────────────────────────────────────────────
write('social-card', (theme) => { const T = THEMES[theme]; const stars = repoMeta.stargazers_count; return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="PM Skills — ${fmt(skills.length)} professional agent skills">
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#8a5cf5"/><stop offset="1" stop-color="#4ecdc4"/></linearGradient></defs>
<rect width="1200" height="630" fill="${T.bg}"/>
<g ${FONT}>
<text x="80" y="150" font-size="72" font-weight="800" fill="${T.text}">PM Skills</text>
<rect x="84" y="170" width="240" height="8" rx="4" fill="url(#g)"/>
<text x="80" y="240" font-size="30" fill="${T.text}">${fmt(skills.length)} professional agent skills your AI can read.</text>
<text x="80" y="284" font-size="22" fill="${T.dim}">Plain markdown · Claude · ChatGPT · Gemini · Cursor · Codex · MIT</text>
${[['skills', fmt(skills.length)], ['stars', fmt(stars)], ['bundles', fmt(new Set(skills.map((s) => s.plugin)).size)], ['professions', '35']].map(([k, v], i) => `<text x="${80 + i * 240}" y="400" font-size="48" font-weight="700" fill="${T.title}">${v}</text><text x="${80 + i * 240}" y="432" font-size="18" fill="${T.dim}">${k}</text>`).join('')}
<rect x="80" y="490" width="620" height="54" rx="10" fill="${T.panel}" stroke="${T.line}"/>
<text x="100" y="525" font-size="22" fill="${T.good}" ${MONO}>$ npx pm-claude-skills add</text>
<text x="1120" y="590" text-anchor="end" font-size="18" fill="${T.dim}">github.com/mohitagw15856/pm-claude-skills · ${today}</text>
</g></svg>
`; });

console.log(`visuals: ${skills.length} skills · ${commits.length} commits · ${words.length} words · geo ${geo.total} · medals earned ${MEDALS.filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m[2] || '')).length}/8`);
