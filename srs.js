// Spaced repetition scheduling (simplified SM-2, the family Anki descends from). Pure functions.
const MIN = 60e3, DAY = 864e5;
export const GRADES = ['Ancora', 'Difficile', 'Bene', 'Facile'];

export function newCard(now = Date.now()) {
  return { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0 };
}

// Returns the scheduling fields after answering with grade 0..3. `interval` is in days.
export function schedule(card, grade, now = Date.now()) {
  let { interval, ease, reps, lapses } = card;
  if (grade === 0) {
    return { due: now + MIN, interval: 0, ease: Math.max(1.3, ease - (reps ? 0.2 : 0)), reps: 0, lapses: lapses + (reps ? 1 : 0) };
  }
  if (reps === 0 && grade === 1) return { due: now + 10 * MIN, interval: 0, ease, reps, lapses };
  if (reps === 0) interval = grade === 3 ? 4 : 1;
  else if (grade === 1) { interval = Math.max(1, interval * 1.2); ease = Math.max(1.3, ease - 0.15); }
  else if (grade === 2) interval = Math.max(interval + 1, interval * ease);
  else { interval = Math.max(interval + 1, interval * ease * 1.3); ease += 0.15; }
  interval = Math.round(interval);
  return { due: now + interval * DAY, interval, ease, reps: reps + 1, lapses };
}

export function label(card, grade, now = Date.now()) {
  const ms = schedule(card, grade, now).due - now;
  if (ms < 60 * MIN) return `${Math.round(ms / MIN)} min`;
  const d = Math.round(ms / DAY);
  return d < 31 ? `${d} g` : d < 365 ? `${Math.round(d / 30)} mesi` : `${(d / 365).toFixed(1)} anni`;
}
