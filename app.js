import { lookupGerman, lookupItalian, suggest, quickTranslate } from './sources.js';
import { clean, forMeaning } from './wikitext.js';

const $ = id => document.getElementById(id);
const els = { form: $('search'), q: $('q'), dir: $('dir'), clear: $('clear'), umlauts: $('umlauts'),
  suggest: $('suggest'), quick: $('quick'), results: $('results'), home: $('home') };

const ICON = {
  speak: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/></svg>',
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = s => s.replace(/<[^>]+>/g, '');

// ---------- persistent prefs (per device) ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let dir = store.get('dir', 'de');            // 'de' = DE→IT, 'it' = IT→DE
let recent = store.get('recent', []);        // [word]
let favs = store.get('favs', []);            // [{q, label}]

function remember(word) {
  recent = [word, ...recent.filter(w => w !== word)].slice(0, 20);
  store.set('recent', recent);
}

// ---------- rendering ----------
function meta(e) {
  const f = e.forms, parts = [...e.pos];
  if (e.ipa) parts.push(`/${esc(e.ipa)}/`);
  if (f.plural && f.plural !== '—') parts.push(`Pl. die ${clean(f.plural)}`);
  if (f.genitive && e.genus) parts.push(`Gen. ${e.genus === 'f' ? 'der' : 'des'} ${clean(f.genitive)}`);
  if (f.past) parts.push(`${clean(f.present)} · ${clean(f.past)} · ${f.aux === 'sein' ? 'ist' : 'hat'} ${clean(f.participle)}`);
  if (f.comparative) parts.push(`${clean(f.comparative)} · am ${clean(f.superlative)}`);
  return parts.join(' · ');
}

const list = (items, cls) => items.length ? `<ul class="${cls}">${items.map(x => `<li>${x.text}</li>`).join('')}</ul>` : '';

function meaning(e, m) {
  const ref = m.refs[0] || '1';
  const it = forMeaning(e.it, ref).flatMap(t => t.words);
  const ex = forMeaning(e.examples, ref).slice(0, 4);
  const col = forMeaning(e.collocations, ref);
  return `<li><span class="num">${esc(ref)}</span><div>
      <p class="def">${m.text}</p>
      ${it.length ? `<p class="it">${it.join(', ')}</p>` : ''}
    </div>
    ${col.length ? `<div class="sub"><h4>Combinazioni tipiche</h4>${col.map(c => `<p class="colloc">${c.text}</p>`).join('')}</div>` : ''}
    ${ex.length ? `<div class="sub"><h4>Esempi · tocca per tradurre</h4>${list(ex, 'ex')}</div>` : ''}
  </li>`;
}

function card(e) {
  const label = `${e.article ? e.article + ' ' : ''}${e.title}`;
  const isFav = favs.some(f => f.q === e.title);
  const allIt = [...new Set(e.it.flatMap(t => t.words.map(w => strip(w).replace(/\s+[mfn]$/, ''))))];
  const meanings = e.hitRefs?.length ? e.meanings.filter(m => m.refs.some(r => e.hitRefs.includes(r))) : e.meanings;
  const extra = [['Sinonimi', e.synonyms], ['Contrari', e.antonyms], ['Modi di dire', e.idioms]]
    .filter(([, v]) => v.length)
    .map(([h, v]) => `<details><summary>${h}</summary>${v.map(x => `<p>${x.refs.length ? `<span class="num">[${esc(x.refs.join(', '))}]</span> ` : ''}${x.text}</p>`).join('')}</details>`).join('');
  const t = encodeURIComponent(e.title);
  return `<article class="card">
    ${e.from ? `<p class="from">${esc(e.from)} → forma base</p>` : ''}
    <header>
      <div class="lemma">${e.article ? `<span class="art art-${e.article}">${e.article}</span>` : ''}${esc(e.title)}</div>
      <button class="icon" data-say="${esc(label)}" aria-label="Ascolta">${ICON.speak}</button>
      <button class="icon${isFav ? ' on' : ''}" data-fav="${esc(e.title)}" data-label="${esc(label)}" aria-label="Preferito">${ICON.star}</button>
    </header>
    <p class="meta">${meta(e)}</p>
    ${allIt.length ? `<p class="summary">${esc(allIt.slice(0, 6).join(', '))}</p>` : ''}
    <ol class="meanings">${meanings.map(m => meaning(e, m)).join('')}</ol>
    ${extra}
    <nav class="links">
      <a href="https://www.duden.de/suchen/dudenonline/${t}" target="_blank" rel="noopener">Duden</a>
      <a href="https://www.dwds.de/wb/${t}" target="_blank" rel="noopener">DWDS</a>
      <a href="https://dict.leo.org/italienisch-deutsch/${t}" target="_blank" rel="noopener">LEO</a>
      <a href="https://de.wiktionary.org/wiki/${t}" target="_blank" rel="noopener">Wiktionary</a>
    </nav>
  </article>`;
}

function renderHome() {
  const show = !els.q.value.trim();
  els.home.hidden = !show;
  if (!show) return;
  const chips = arr => `<div class="chips">${arr.map(x => `<button data-go="${esc(x.q ?? x)}">${esc(x.label ?? x)}</button>`).join('')}</div>`;
  els.home.className = 'home';
  els.home.innerHTML = `
    ${favs.length ? `<h3>Preferiti</h3>${chips(favs)}` : ''}
    ${recent.length ? `<h3>Recenti</h3>${chips(recent)}` : ''}
    ${!favs.length && !recent.length ? `<p class="msg">Scrivi una parola tedesca.<br>Tocca <b>DE → IT</b> per cercare partendo dall'italiano.</p>` : ''}
    <p class="foot">Dizionario: <a href="https://de.wiktionary.org" target="_blank" rel="noopener">Wiktionary</a> (CC BY-SA 4.0) ·
      Traduzione rapida: <a href="https://mymemory.translated.net" target="_blank" rel="noopener">MyMemory</a></p>`;
}

function setDir(d) {
  dir = d; store.set('dir', d);
  els.dir.textContent = d === 'de' ? 'DE → IT' : 'IT → DE';
  els.q.placeholder = d === 'de' ? 'Parola tedesca…' : 'Parola italiana…';
  els.umlauts.hidden = d !== 'de';
}

// ---------- search ----------
let ctrl, suggestCtrl, timer, suggestTimer;

async function run(word, { submit = false } = {}) {
  word = word.trim();
  if (!word) return;
  ctrl?.abort(); ctrl = new AbortController();
  const { signal } = ctrl;
  hideSuggest();
  els.home.hidden = true;
  els.results.innerHTML = '<div class="skeleton"></div>';

  quickTranslate(word, dir === 'de' ? 'de|it' : 'it|de', signal)
    .then(t => { if (!signal.aborted) { els.quick.hidden = false; els.quick.innerHTML = `<span class="tag">Rapida</span><span class="txt">${esc(t)}</span>`; } })
    .catch(() => { if (!signal.aborted) els.quick.hidden = true; });

  try {
    const entries = await (dir === 'de' ? lookupGerman(word, signal) : lookupItalian(word, signal));
    if (signal.aborted) return;
    if (entries.length) {
      els.results.innerHTML = entries.map(card).join('');
      remember(word);
    } else {
      const w = encodeURIComponent(word);
      els.results.innerHTML = `<p class="msg">Nessuna voce nel dizionario per «${esc(word)}».<br>
        <span class="hint">Controlla l'ortografia (i sostantivi tedeschi vanno bene anche in minuscolo) oppure apri
        <a href="https://www.dwds.de/wb/${w}" target="_blank" rel="noopener">DWDS</a> ·
        <a href="https://dict.leo.org/italienisch-deutsch/${w}" target="_blank" rel="noopener">LEO</a>.</span></p>`;
      if (submit) remember(word);
    }
  } catch (err) {
    if (signal.aborted) return;
    els.results.innerHTML = `<p class="msg">${navigator.onLine ? 'Errore di rete, riprova.' : 'Sei offline: funzionano solo le parole già cercate.'}</p>`;
  }
}

function go(word) {
  els.q.value = word;
  els.clear.hidden = false;
  els.q.blur();
  run(word, { submit: true });
  window.scrollTo({ top: 0 });
}

function hideSuggest() { els.suggest.hidden = true; suggestCtrl?.abort(); clearTimeout(suggestTimer); }

async function showSuggest(q) {
  suggestCtrl?.abort(); suggestCtrl = new AbortController();
  try {
    const items = (await suggest(q, suggestCtrl.signal)).filter(s => s.toLowerCase() !== q.toLowerCase()).slice(0, 6);
    if (document.activeElement !== els.q || !items.length) return hideSuggest();
    els.suggest.innerHTML = items.map(s => `<li data-go="${esc(s)}">${esc(s)}</li>`).join('');
    els.suggest.hidden = false;
  } catch { /* aborted or offline: ignore */ }
}

// ---------- events ----------
els.q.addEventListener('input', () => {
  const q = els.q.value.trim();
  els.clear.hidden = !q;
  clearTimeout(timer); clearTimeout(suggestTimer);
  if (!q) { ctrl?.abort(); hideSuggest(); els.results.innerHTML = ''; els.quick.hidden = true; renderHome(); return; }
  if (dir === 'de') suggestTimer = setTimeout(() => showSuggest(q), 120);
  timer = setTimeout(() => run(q), 550);
});
els.form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); go(els.q.value); });
els.clear.addEventListener('click', () => { els.q.value = ''; els.q.dispatchEvent(new Event('input')); els.q.focus(); });
els.dir.addEventListener('click', () => { setDir(dir === 'de' ? 'it' : 'de'); if (els.q.value.trim()) run(els.q.value); els.q.focus(); });
els.umlauts.addEventListener('mousedown', e => e.preventDefault()); // keep keyboard open
els.umlauts.addEventListener('click', e => {
  if (e.target.tagName !== 'BUTTON') return;
  const { selectionStart: s, selectionEnd: t, value: v } = els.q;
  els.q.value = v.slice(0, s ?? v.length) + e.target.textContent + v.slice(t ?? v.length);
  els.q.setSelectionRange((s ?? v.length) + 1, (s ?? v.length) + 1);
  els.q.dispatchEvent(new Event('input'));
});
els.q.addEventListener('blur', () => setTimeout(hideSuggest, 150));

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-go],[data-q],[data-say],[data-fav],.ex li');
  if (!t) return;
  if (t.dataset.go || t.dataset.q) { if (dir !== 'de' && t.dataset.q) setDir('de'); return go(t.dataset.go || t.dataset.q); }
  if (t.dataset.say) return speak(t.dataset.say);
  if (t.dataset.fav) {
    const q = t.dataset.fav, on = favs.some(f => f.q === q);
    favs = on ? favs.filter(f => f.q !== q) : [{ q, label: t.dataset.label }, ...favs];
    store.set('favs', favs);
    return t.classList.toggle('on', !on);
  }
  if (t.matches('.ex li') && !t.querySelector('.tr')) {
    const tr = document.createElement('span'); tr.className = 'tr'; tr.textContent = '…'; t.append(tr);
    try { tr.textContent = await quickTranslate(strip(t.innerHTML).replace(/[„“”"]/g, ''), 'de|it'); }
    catch { tr.textContent = 'Traduzione non disponibile'; }
  }
});

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE'; u.rate = 0.9;
  const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith('de'));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

// ---------- boot ----------
setDir(dir);
renderHome();
const shared = new URLSearchParams(location.search).get('q');
if (shared) go(shared);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
