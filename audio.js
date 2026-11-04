// Pronunciation: real recordings (Wikimedia Commons) when known, otherwise the device's German voice.
let voices = [];
const loadVoices = () => { voices = window.speechSynthesis?.getVoices() || []; };
loadVoices();
window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices);

let current;

// Must be called synchronously inside a tap handler (iOS only allows audio started by a gesture).
export function say(text, url) {
  current?.pause();
  if (url) {
    current = new Audio(url);
    current.play().catch(() => tts(text));
    return;
  }
  tts(text);
}

function tts(text) {
  const s = window.speechSynthesis;
  if (!s) return;
  if (s.speaking || s.pending) s.cancel(); // cancelling an idle engine right before speak() silences iOS Safari
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = 0.9;
  const v = voices.find(v => /^de[-_]DE/i.test(v.lang)) || voices.find(v => /^de/i.test(v.lang));
  if (v) u.voice = v;
  s.speak(u);
}
