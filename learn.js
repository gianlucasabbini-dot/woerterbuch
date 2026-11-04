// "Impara" mode: flashcards with the word inside a real sentence, scheduled with spaced repetition.
import { forMeaning } from './wikitext.js';
import { newCard, schedule, label, GRADES } from './srs.js';
import { quickTranslate, audioUrls } from './sources.js';
import { say } from './audio.js';

const KEY = 'cards';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const norm = s => s.toLowerCase().replace(/[„“”"'.,;:!?]/g, '').trim();

// ---------- storage ----------
let cards = load();
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(cards)); } catch {} onChange(); }
let onChange = () => {};

export const cardId = (entry, ref) => `${entry.article}|${entry.title}|${ref}`;
export const isSaved = id => cards.some(c => c.id === id);
export const dueCount = (now = Date.now()) => cards.filter(c => c.due <= now).length;

// ---------- card creation ----------
function findTarget(html, lemma) {
  const italic = html.match(/<i>(.+?)<\/i>/);
  if (italic) return strip(italic[1]);
  const prefix = lemma.toLowerCase().slice(0, Math.max(3, lemma.length - 3));
  return (strip(html).match(/[\p{L}-]+/gu) || []).find(t => t.toLowerCase().startsWith(prefix)) || '';
}

function pickExample(entry, ref) {
  const list = forMeaning(entry.examples, ref)
    .map(x => ({ html: x.text, text: strip(x.text).replace(/^[„“"]|[“”"]$/g, '') }))
    .filter(x => x.text.length >= 12)
    .sort((a, b) => a.text.length - b.text.length);
  return list.find(x => x.text.length <= 140 && findTarget(x.html, entry.title)) || list[0] || null;
}

export async function addCard(entry, ref) {
  const id = cardId(entry, ref);
  if (isSaved(id)) return;
  const meaning = entry.meanings.find(m => m.refs.includes(ref)) || entry.meanings[0];
  const ex = pickExample(entry, ref);
  const card = {
    id, title: entry.title, article: entry.article, pos: entry.pos.join(', '),
    plural: entry.forms.plural || '', ref, audio: entry.audio || '',
    def: strip(meaning.text),
    it: forMeaning(entry.it, ref).flatMap(t => t.words.map(w => strip(w).replace(/\s+[mfn]$/, ''))),
    sentence: ex?.text || '', target: ex ? findTarget(ex.html, entry.title) : '', sentenceIt: '',
    added: Date.now(), ...newCard(),
  };
  cards.push(card);
  save();
  if (card.sentence) {
    try { card.sentenceIt = await quickTranslate(card.sentence, 'de|it'); save(); } catch { /* translated later */ }
  }
}

export function removeCard(id) { cards = cards.filter(c => c.id !== id); save(); }

// ---------- session ----------
let root, queue = [], current = null, phase = 'overview', typed = '', audio = new Map();

export function initLearn(el, changed) { root = el; onChange = changed; root.addEventListener('click', onClick); }

export function renderLearn() {
  if (phase === 'overview' || !current) return overview();
  return flash();
}

function overview() {
  phase = 'overview';
  const due = dueCount();
  const next = cards.filter(c => c.due > Date.now()).sort((a, b) => a.due - b.due)[0];
  const nextIn = next ? Math.ceil((next.due - Date.now()) / 36e5) : 0;
  const sorted = [...cards].sort((a, b) => b.added - a.added);
  root.innerHTML = cards.length ? `
    <div class="stats"><div><b>${due}</b><span>da ripassare</span></div><div><b>${cards.length}</b><span>parole</span></div></div>
    ${due ? `<button class="primary" data-l="start">Inizia ripasso</button>`
      : `<p class="msg">Niente da ripassare adesso.${next ? ` Prossima carta tra ${nextIn < 24 ? nextIn + ' h' : Math.round(nextIn / 24) + ' g'}.` : ''}</p>`}
    <details class="saved"><summary>Le tue parole (${cards.length})</summary><ul>
      ${sorted.map(c => `<li><span>${c.article ? `<span class="art art-${c.article}">${c.article}</span>` : ''}<b>${esc(c.title)}</b> <span class="muted">[${esc(c.ref)}] ${esc(c.it.slice(0, 2).join(', ') || c.def)}</span></span>
        <button class="icon" data-l="del" data-id="${esc(c.id)}" aria-label="Rimuovi"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>`).join('')}
    </ul></details>
    <div class="backup"><button data-l="export">Esporta backup</button><label>Importa backup<input type="file" accept="application/json,.json" hidden></label></div>`
    : `<p class="msg">Nessuna parola da imparare.<br>Cerca una parola e tocca <b>＋ Impara</b> accanto al significato che ti interessa.</p>
       <div class="backup"><label>Importa backup<input type="file" accept="application/json,.json" hidden></label></div>`;
}

const writeMode = c => c.reps >= 2 && c.target && c.reps % 2 === 0;

function sentenceHtml(c, gap) {
  if (!c.sentence) return '';
  const s = esc(c.sentence);
  if (!c.target) return s;
  const t = esc(c.target);
  const hint = c.target[0] + '…';
  return s.replace(t, gap ? `<span class="gap">${esc(hint)}</span>` : `<mark>${t}</mark>`);
}

function answer(c) {
  return `<div class="ans">
      <div class="lemma">${c.article ? `<span class="art art-${c.article}">${c.article}</span>` : ''}${esc(c.title)}
        <button class="icon" data-l="say-word" aria-label="Ascolta"><svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg></button></div>
      <p class="meta">${esc(c.pos)}${c.plural ? ` · Pl. die ${esc(c.plural)}` : ''}</p>
      ${c.it.length ? `<p class="summary">${esc(c.it.join(', '))}</p>` : ''}
      <p class="def">${esc(c.def)}</p>
      ${c.sentenceIt ? `<p class="sent-it">${esc(c.sentenceIt)}</p>` : ''}
    </div>
    <div class="grades">${GRADES.map((g, i) => `<button data-l="grade" data-g="${i}" class="g${i}"><b>${g}</b><span>${label(c, i)}</span></button>`).join('')}</div>`;
}

function flash() {
  const c = current, write = writeMode(c);
  const progress = `<div class="progress"><button data-l="quit">‹ Esci</button><span>${queue.length + 1} rimaste</span></div>`;
  const sentence = c.sentence
    ? `<p class="sent">${sentenceHtml(c, write && phase === 'front')}
        <button class="icon" data-l="say-sent" aria-label="Ascolta la frase"><svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg></button></p>`
    : `<p class="sent big">${c.article ? `<span class="art art-${c.article}">${c.article}</span>` : ''}${esc(c.title)}</p>`;
  let body;
  if (phase === 'front' && write) {
    body = `${c.sentenceIt ? `<p class="sent-it">${esc(c.sentenceIt)}</p>` : `<p class="ask">${esc(c.it.join(', '))}</p>`}
      <form data-l="check" class="write"><input id="typed" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Scrivi la parola mancante" enterkeyhint="done">
      <button class="primary">Verifica</button></form>`;
  } else if (phase === 'front') {
    body = `<p class="ask">Cosa significa <b>${esc(c.target || c.title)}</b>${c.sentence ? ' in questa frase' : ''}?</p>
      <button class="primary" data-l="show">Mostra risposta</button>`;
  } else {
    const ok = norm(typed) === norm(c.target);
    body = `${write ? `<p class="result ${ok ? 'ok' : 'ko'}">${ok ? 'Giusto' : `Hai scritto «${esc(typed) || '—'}», era «${esc(c.target)}»`}</p>` : ''}${answer(c)}`;
  }
  root.innerHTML = `${progress}<article class="flash">${sentence}${body}</article>`;
  root.querySelector('#typed')?.focus();
}

async function start() {
  const now = Date.now();
  queue = cards.filter(c => c.due <= now).sort((a, b) => a.due - b.due);
  const files = [...new Set(queue.map(c => c.audio).filter(f => f && !audio.has(f)))];
  next();
  for (let i = 0; i < files.length; i += 40) {
    try { for (const [k, v] of await audioUrls(files.slice(i, i + 40))) audio.set(k, v); } catch { break; }
  }
}

function next() {
  current = queue.shift() || null;
  phase = current ? 'front' : 'overview';
  typed = '';
  renderLearn();
  if (current && !current.sentenceIt && current.sentence) {
    const c = current;
    quickTranslate(c.sentence, 'de|it').then(t => { c.sentenceIt = t; save(); }).catch(() => {});
  }
}

function grade(g) {
  Object.assign(current, schedule(current, g));
  save();
  if (current.due - Date.now() < 20 * 60e3) queue.push(current); // relearn later in this session
  next();
}

async function exportCards() {
  const name = `woerterbuch-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(cards)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { return await navigator.share({ files: [file], title: 'Backup Wörterbuch' }); } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importCards(input) {
  try {
    const incoming = JSON.parse(await input.files[0].text());
    if (!Array.isArray(incoming)) throw new Error();
    const byId = new Map(cards.map(c => [c.id, c]));
    for (const c of incoming) if (c?.id && (!byId.has(c.id) || (c.reps ?? 0) > byId.get(c.id).reps)) byId.set(c.id, c);
    cards = [...byId.values()];
    save();
    overview();
  } catch { alert('File di backup non valido.'); }
}

function onClick(e) {
  const t = e.target.closest('[data-l]');
  if (!t) return;
  const action = t.dataset.l;
  if (action === 'start') start();
  else if (action === 'show') { phase = 'back'; renderLearn(); }
  else if (action === 'grade') grade(+t.dataset.g);
  else if (action === 'quit') { queue = []; current = null; overview(); }
  else if (action === 'say-word') say(`${current.article} ${current.title}`.trim(), audio.get(current.audio));
  else if (action === 'say-sent') say(current.sentence);
  else if (action === 'del' && confirm('Rimuovere questa parola dallo studio?')) { removeCard(t.dataset.id); overview(); }
  else if (action === 'export') exportCards();
}

document.addEventListener('submit', e => {
  if (!e.target.matches('[data-l="check"]')) return;
  e.preventDefault();
  typed = e.target.querySelector('#typed').value;
  phase = 'back';
  renderLearn();
});
document.addEventListener('change', e => {
  if (e.target.matches('.backup input[type=file]') && e.target.files.length) importCards(e.target);
});
