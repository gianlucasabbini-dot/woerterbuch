// Parser for German entries of de.wiktionary.org (wikitext → plain data).
// Pure functions, no DOM: testable with Node.

const POS_IT = {
  Substantiv: 'sostantivo', Verb: 'verbo', Adjektiv: 'aggettivo', Adverb: 'avverbio',
  Präposition: 'preposizione', Konjunktion: 'congiunzione', Subjunktion: 'congiunzione',
  Pronomen: 'pronome', Personalpronomen: 'pronome personale', Artikel: 'articolo',
  Interjektion: 'interiezione', Numerale: 'numerale', Partikel: 'particella',
  Hilfsverb: 'verbo ausiliare', Modalverb: 'verbo modale', Redewendung: 'locuzione',
  'Partizip II': 'participio passato', 'Partizip I': 'participio presente',
  Vorname: 'nome proprio', Toponym: 'toponimo', Abkürzung: 'abbreviazione',
};
const ARTICLE = { m: 'der', f: 'die', n: 'das' };
const DROP = /^(Ref-|QS |Lit-|Literatur|Beispiele fehlen|Audio|Hörbeispiele|Wikipedia|Internetquelle|Per-)/;

// Split on `sep` only at top level (outside {{ }} and [[ ]]).
export function splitTop(s, sep = '|') {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if ((two === '}}' || two === ']]') && depth > 0) { depth--; cur += two; i++; continue; }
    if (s[i] === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

// Find the first template whose name starts with `prefix`; handles nesting/multiline.
export function findTemplate(text, prefix) {
  const start = text.indexOf('{{' + prefix);
  if (start < 0) return null;
  let depth = 0, i = start;
  for (; i < text.length; i++) {
    if (text.startsWith('{{', i)) { depth++; i++; }
    else if (text.startsWith('}}', i)) { depth--; i++; if (depth === 0) break; }
  }
  const [name, ...parts] = splitTop(text.slice(start + 2, i - 1));
  const params = {}, positional = [];
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0 && !p.slice(0, eq).includes('[')) params[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
    else positional.push(p.trim());
  }
  return { name: name.trim(), params, positional };
}

const ENTITIES = { nbsp: ' ', thinsp: ' ', ndash: '–', mdash: '—', hellip: '…', amp: '&', lt: '<', gt: '>', quot: '"' };
const decode = s => s.replace(/&(\w+);/g, (m, n) => ENTITIES[n] ?? m);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderTemplate(inner) {
  const [rawName, ...args] = splitTop(inner);
  const name = rawName.trim();
  const pos = args.filter(a => !/^\w+=/.test(a)).map(a => a.trim());
  if (DROP.test(name)) return '';
  if (name === 'K') {
    const ft = args.find(a => a.startsWith('ft='));
    const labels = pos.join(', ') + (ft ? (pos.length ? ', ' : '') + ft.slice(3) : '');
    return labels ? `<span class="lbl">${labels}:</span>` : '';
  }
  if (name === 'Ü' || name === 'Üt') return pos[1] || '';
  if (['m', 'f', 'n', 'Pl.', 'Sg.'].includes(name)) return `<span class="g">${name}</span>`;
  if (!pos.length && name.endsWith('.')) return `<span class="lbl">${name}</span>`;
  return pos[0] || '';
}

// Wikitext fragment → safe HTML (escaped, with <i>, <b>, labels and tappable links).
export function clean(s) {
  s = s.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<\/?(sup|sub|small|span|nowiki)[^>]*>/g, '');
  s = esc(decode(s));
  s = s.replace(/\[\[(?:Datei|File|Bild):[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_, t, l) => `<a data-q="${t.replace(/#.*/, '')}">${l}</a>`)
    .replace(/\[\[([^\]]+)\]\]/g, (_, t) => `<a data-q="${t.replace(/#.*/, '')}">${t}</a>`);
  let prev;
  do { prev = s; s = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => renderTemplate(inner)); } while (s !== prev);
  return s.replace(/'''(.+?)'''/g, '<b>$1</b>').replace(/''(.+?)''/g, '<i>$1</i>')
    .replace(/\{\{|\}\}/g, '').replace(/\(\s*\)/g, '').replace(/\s+([,.;:])/g, '$1').replace(/\s+/g, ' ').trim();
}

// "1, 2" → ['1','2'] ; "1–3" → ['1','2','3'] ; "2a" → ['2a']
export function parseRefs(s) {
  return s.split(/[,;]/).flatMap(part => {
    const m = part.trim().match(/^(\d+)\s*[–-]\s*(\d+)$/);
    if (!m) return part.trim() ? [part.trim()] : [];
    const out = [];
    for (let n = +m[1]; n <= +m[2]; n++) out.push(String(n));
    return out;
  });
}

// Group the lines of a Wortart section into blocks keyed by their heading template.
function blocks(body) {
  const out = {}; let cur = null;
  for (const line of body.split('\n')) {
    const head = line.replace(/^=+|=+\s*$/g, '').trim().match(/^\{\{([^{}|]+)(\|[^{}]*)?\}\}$/);
    if (head && !line.startsWith(':') && !line.startsWith('*')) { cur = head[1].trim(); out[cur] = []; continue; }
    if (cur) out[cur].push(line);
  }
  return out;
}

// [{refs, text}] from ":[1] …" lines.
function items(lines = []) {
  const out = [];
  for (const line of lines) {
    const m = line.match(/^:+\s*\[(?!\[)([^\]]+)\]\s*(.*)$/);
    if (m) { const text = clean(m[2]); if (text) out.push({ refs: parseRefs(m[1]), text }); }
    else if (/^:+\s*\S/.test(line)) {
      const text = clean(line.replace(/^:+/, '')); if (text) out.push({ refs: [], text });
    }
  }
  return out;
}

function translations(body, lang) {
  const line = body.match(new RegExp(`^\\*\\{\\{${lang}\\}\\}:(.*)$`, 'm'));
  if (!line) return [];
  const parts = line[1].replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').split(/\[([^\]]+)\]/);
  const out = [];
  if (parts[0].trim()) out.push({ refs: [], words: words(parts[0]) });
  for (let i = 1; i < parts.length; i += 2) out.push({ refs: parseRefs(parts[i]), words: words(parts[i + 1] || '') });
  return out.filter(t => t.words.length);
}
const words = s => splitTop(s, ';').flatMap(x => splitTop(x, ',')).map(clean).map(w => w.replace(/^[,;:\s]+|[,;:\s]+$/g, '')).filter(Boolean);

function forms(body) {
  const n = findTemplate(body, 'Deutsch Substantiv Übersicht');
  if (n) {
    const p = n.params;
    return {
      genus: p.Genus || p['Genus 1'] || '',
      plural: p['Nominativ Plural'] || p['Nominativ Plural 1'] || '',
      genitive: p['Genitiv Singular'] || p['Genitiv Singular 1'] || '',
    };
  }
  const v = findTemplate(body, 'Deutsch Verb Übersicht');
  if (v) {
    const p = v.params;
    return {
      present: p['Präsens_er, sie, es'] || '',
      past: p['Präteritum_ich'] || '',
      participle: p['Partizip II'] || '',
      aux: p.Hilfsverb || p.Hilfsverb1 || '',
    };
  }
  const a = findTemplate(body, 'Deutsch Adjektiv Übersicht');
  if (a) return { comparative: a.params.Komparativ || '', superlative: a.params.Superlativ || '' };
  return {};
}

// Main entry: wikitext of a page → { entries, baseForm }
export function parseEntry(title, wikitext) {
  const head = wikitext.match(/^==[^=].*\(\{\{Sprache\|Deutsch\}\}\)\s*==\s*$/m);
  if (!head) return { entries: [], baseForm: null };
  const rest = wikitext.slice(head.index + head[0].length);
  const next = rest.search(/^==[^=]/m);
  const german = next < 0 ? rest : rest.slice(0, next);

  const sections = german.split(/^===([^=].*?[^=])===\s*$/m);
  const entries = [];
  for (let i = 1; i < sections.length; i += 2) {
    const header = sections[i], body = sections[i + 1] || '';
    const pos = [...header.matchAll(/\{\{Wortart\|([^|}]+)/g)].map(m => m[1]);
    const b = blocks(body);
    const meanings = items(b.Bedeutungen);
    if (!meanings.length) continue;
    const f = forms(body);
    const genus = f.genus || (header.match(/\{\{([mfn])\}\}/) || [])[1] || '';
    const pron = (b.Aussprache || []).join('\n');
    const ipa = (pron.match(/\{\{Lautschrift\|([^}|]+)/) || [])[1] || '';
    const audio = (pron.match(/\{\{Audio\|([^}|]+\.(?:ogg|oga|mp3|wav|flac|opus))/i) || [])[1]?.trim() || '';
    entries.push({
      title,
      pos: pos.map(p => POS_IT[p] || p),
      article: ARTICLE[genus] || '',
      genus,
      ipa,
      audio,
      forms: f,
      meanings,
      examples: items(b.Beispiele),
      collocations: items(b['Charakteristische Wortkombinationen']),
      idioms: items(b.Redewendungen),
      synonyms: items(b.Synonyme),
      antonyms: items(b['Gegenwörter']),
      it: translations(body, 'it'),
      en: translations(body, 'en'),
    });
  }
  const base = entries.length ? null : findTemplate(german, 'Grundformverweis');
  return { entries, baseForm: base ? base.positional[0] : null };
}

// Items whose refs include meaning `ref` (or unnumbered items, for meaning 1).
export const forMeaning = (list, ref) =>
  list.filter(x => x.refs.includes(ref) || x.refs.includes(ref.replace(/[a-z]$/, '')) || (!x.refs.length && ref === '1'));
