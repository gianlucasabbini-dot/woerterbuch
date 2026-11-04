// Network sources. All CORS-enabled and free, no account needed.
//  - de.wiktionary.org (MediaWiki API, CC BY-SA): entries, examples, collocations, IT translations
//  - MyMemory (api.mymemory.translated.net): instant machine translation
import { parseEntry } from './wikitext.js';

const WIKI = 'https://de.wiktionary.org/w/api.php';

async function getJSON(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function wiki(params, signal) {
  const u = new URL(WIKI);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: 2, origin: '*', ...params })) u.searchParams.set(k, v);
  return getJSON(u, signal);
}

// title → wikitext for the existing pages among `titles`
async function fetchPages(titles, signal) {
  const data = await wiki({
    action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
    redirects: 1, titles: [...new Set(titles)].join('|'),
  }, signal);
  const out = new Map();
  for (const p of data.query?.pages || []) {
    if (!p.missing && p.revisions) out.set(p.title, p.revisions[0].slots.main.content);
  }
  return out;
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// German word → entries of every case variant (e.g. "essen" + "Essen"), following inflected forms.
export async function lookupGerman(word, signal) {
  const variants = [word, cap(word), word.toLowerCase()];
  const pages = await fetchPages(variants, signal);
  const order = [...pages.keys()].sort((a, b) => (b === word) - (a === word));
  let entries = [], baseForms = [];
  for (const title of order) {
    const r = parseEntry(title, pages.get(title));
    entries.push(...r.entries);
    if (r.baseForm && r.baseForm !== title) baseForms.push(r.baseForm);
  }
  if (baseForms.length) {
    const base = await fetchPages(baseForms, signal);
    for (const [title, text] of base) {
      entries.push(...parseEntry(title, text).entries.map(e => ({ ...e, from: word })));
    }
  }
  return entries;
}

// Italian word → German entries whose Italian translations contain it (reverse lookup).
export async function lookupItalian(word, signal) {
  const data = await wiki({
    action: 'query', list: 'search', srnamespace: 0, srlimit: 15, srprop: '',
    srsearch: `insource:"Ü|it|${word.replace(/"/g, '')}"`,
  }, signal);
  const titles = (data.query?.search || []).map(r => r.title);
  if (!titles.length) return [];
  const pages = await fetchPages(titles, signal);
  const needle = word.toLowerCase();
  const plain = s => s.replace(/<[^>]+>/g, '').replace(/\s+[mfn]$/, '').trim().toLowerCase();
  const out = [];
  for (const title of titles) {
    if (!pages.has(title)) continue;
    for (const e of parseEntry(title, pages.get(title)).entries) {
      const hits = e.it.filter(t => t.words.some(w => plain(w) === needle || plain(w).split(/[ ,]/).includes(needle)));
      if (hits.length) out.push({ ...e, hitRefs: hits.flatMap(h => h.refs) });
    }
  }
  return out;
}

export async function suggest(q, signal) {
  const u = new URL(WIKI);
  for (const [k, v] of Object.entries({ action: 'opensearch', search: q, limit: 8, namespace: 0, format: 'json', origin: '*' })) u.searchParams.set(k, v);
  const data = await getJSON(u, signal);
  return data[1] || [];
}

// Machine translation; `pair` like "de|it".
export async function quickTranslate(text, pair, signal) {
  const u = new URL('https://api.mymemory.translated.net/get');
  u.searchParams.set('q', text);
  u.searchParams.set('langpair', pair);
  const data = await getJSON(u, signal);
  if (data.responseStatus !== 200 && data.responseStatus !== '200') throw new Error(data.responseDetails || 'quota');
  return data.responseData.translatedText;
}
