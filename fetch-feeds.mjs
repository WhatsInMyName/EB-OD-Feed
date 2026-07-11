// fetch-feeds.mjs
// Runs inside the GitHub Action. Reads sources.json, fetches every feed
// server-side (no CORS, no rate-limit borrowing), and writes feed-data.json
// that the page reads. Run locally with:  node fetch-feeds.mjs

import Parser from "rss-parser";
import { readFile, writeFile } from "node:fs/promises";

const enc = encodeURIComponent;
const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "SignalDesk/1.0 (+https://github.com) feed reader" },
});

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const strip = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function gnUrl(query, loc) {
  return `https://news.google.com/rss/search?q=${enc(query)}&hl=${enc(loc.hl)}&gl=${enc(loc.gl)}&ceid=${enc(loc.ceid)}`;
}
function feedUrl(src, loc) {
  return src.mode === "news" ? gnUrl(src.query, loc) : src.url;
}

// Google News titles look like "Headline - Publisher"; pull the publisher out.
function publisher(item, feedTitle) {
  if (item.creator) return item.creator.trim();
  if (item.author) return item.author.trim();
  const t = item.title || "";
  const i = t.lastIndexOf(" - ");
  if (i > 0 && i > t.length - 60) return t.slice(i + 3).trim();
  return feedTitle || "";
}
function cleanTitle(t) {
  const i = (t || "").lastIndexOf(" - ");
  if (i > 0 && i > t.length - 60) return t.slice(0, i).trim();
  return t;
}
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return h;
}
const idFor = (link, title) => "i_" + Math.abs(hash((link || "") + "|" + (title || ""))).toString(36);

function normaliseItems(items, src, feedTitle, limit) {
  const isGN = src.mode === "news";
  return (items || []).slice(0, limit).map((it) => {
    const title = isGN ? cleanTitle(it.title || "") : (it.title || "");
    return {
      id: idFor(it.link, title),
      title,
      link: it.link || "",
      source: src.name,
      publisher: isGN ? publisher(it, feedTitle) : src.name,
      via: isGN,
      pubDate: it.isoDate || it.pubDate || "",
      snippet: strip(it.contentSnippet || it.content || it.summary || "").slice(0, 280),
    };
  });
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = norm(it.title).slice(0, 60);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}
const byDateDesc = (a, b) => new Date(b.pubDate) - new Date(a.pubDate);

async function main() {
  const cfg = JSON.parse(await readFile(new URL("./sources.json", import.meta.url)));
  const loc = cfg.locale;

  // ---------- Trusted (curated sources) ----------
  let trusted = [];
  const sourceStatus = [];
  for (const src of cfg.sources) {
    try {
      const feed = await parser.parseURL(feedUrl(src, loc));
      const items = normaliseItems(feed.items, src, feed.title, src.mode === "news" ? 12 : 20);
      trusted.push(...items);
      sourceStatus.push({ name: src.name, cat: src.cat, mode: src.mode, ok: true, count: items.length });
      console.log(`ok    ${src.name} (${items.length})`);
    } catch (e) {
      sourceStatus.push({ name: src.name, cat: src.cat, mode: src.mode, ok: false, count: 0 });
      console.log(`FAIL  ${src.name}: ${e.message}`);
    }
  }
  trusted = dedupe(trusted).sort(byDateDesc).slice(0, 120);

  // ---------- Discover (Google News topic searches) ----------
  let discover = [];
  for (const q of cfg.topics) {
    try {
      const feed = await parser.parseURL(gnUrl(q, loc));
      (feed.items || []).slice(0, 20).forEach((it) => {
        const title = cleanTitle(it.title || "");
        const pub = publisher(it, feed.title);
        discover.push({
          id: idFor(it.link, title),
          title,
          link: it.link || "",
          source: pub || "Google News",
          publisher: pub,
          via: true,
          pubDate: it.isoDate || it.pubDate || "",
          snippet: strip(it.contentSnippet || it.content || "").slice(0, 280),
        });
      });
      console.log(`ok    topic: ${q}`);
    } catch (e) {
      console.log(`FAIL  topic ${q}: ${e.message}`);
    }
  }
  discover = dedupe(discover).sort(byDateDesc).slice(0, 80);

  // ---------- Candidate publishers (not already on the list) ----------
  const known = new Set(cfg.sources.map((s) => norm(s.name)));
  const counts = {};
  for (const it of discover) {
    const p = it.publisher;
    if (!p) continue;
    const n = norm(p);
    if (known.has(n)) continue;
    counts[p] = (counts[p] || 0) + 1;
  }
  const candidates = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  const out = {
    generatedAt: new Date().toISOString(),
    trusted,
    discover,
    candidates,
    sourceStatus,
  };
  await writeFile(new URL("./feed-data.json", import.meta.url), JSON.stringify(out, null, 2));
  console.log(`\nWrote feed-data.json  —  trusted:${trusted.length}  discover:${discover.length}  candidates:${candidates.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
