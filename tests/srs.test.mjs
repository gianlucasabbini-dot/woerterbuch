import assert from 'node:assert/strict';
import { newCard, schedule, label } from '../srs.js';
const now = 0, DAY = 864e5;
let c = newCard(now);
assert.equal(label(c, 0, now), '1 min');
assert.equal(label(c, 1, now), '10 min');
assert.equal(label(c, 2, now), '1 g');
assert.equal(label(c, 3, now), '4 g');
c = { ...c, ...schedule(c, 2, now) };                 // 1 day
assert.equal(c.interval, 1);
c = { ...c, ...schedule(c, 2, c.due) };               // max(2, 2.5) → 3 days (rounded 2.5→3)
assert.equal(c.interval, 3);
c = { ...c, ...schedule(c, 2, c.due) };               // 3*2.5 = 7.5 → 8
assert.equal(c.interval, 8);
const lapsed = schedule(c, 0, c.due);
assert.equal(lapsed.reps, 0); assert.equal(lapsed.lapses, 1); assert.ok(lapsed.ease < 2.5);
assert.ok(schedule(c, 3, c.due).interval > schedule(c, 2, c.due).interval);
assert.ok(schedule(c, 1, c.due).interval < schedule(c, 2, c.due).interval);
console.log('all srs tests passed');
