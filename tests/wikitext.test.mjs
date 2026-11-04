import assert from 'node:assert/strict';
import { parseEntry, clean, parseRefs, forMeaning } from '../wikitext.js';

const ENTSCHEIDUNG = `{{Siehe auch|[[entscheidung]]}}
== Entscheidung ({{Sprache|Deutsch}}) ==
=== {{Wortart|Substantiv|Deutsch}}, {{f}} ===

{{Deutsch Substantiv Übersicht
|Genus=f
|Nominativ Singular=Entscheidung
|Nominativ Plural=Entscheidungen
|Genitiv Singular=Entscheidung
|Genitiv Plural=Entscheidungen
}}

{{Worttrennung}}
:Ent·schei·dung, {{Pl.}} Ent·schei·dun·gen

{{Aussprache}}
:{{IPA}} {{Lautschrift|ɛntˈʃaɪ̯dʊŋ}}
:{{Hörbeispiele}} {{Audio|De-Entscheidung.ogg}}

{{Bedeutungen}}
:[1] [[Wahl]] zwischen mehreren [[Möglichkeit]]en
:[2] {{K|Rechtswesen}} [[Urteil]] eines [[Gericht]]s<ref>{{Ref-Duden|Entscheidung}}</ref>

{{Synonyme}}
:[1] [[Beschluss]], [[Entschluss]]

{{Beispiele}}
:[1] „Die ''Entscheidung'' fiel ihm schwer.“<!-- comment -->
:[1, 2] Wir warten auf eine ''Entscheidung.''
:[2] Das Gericht hat eine [[Entscheidung]] [[getroffen|gefällt]].

{{Charakteristische Wortkombinationen}}
:[1] eine Entscheidung [[treffen]], vor einer Entscheidung [[stehen]]

==== {{Übersetzungen}} ====
{{Ü-Tabelle|Ü-Liste=
*{{en}}: [1] {{Ü|en|decision}}
*{{it}}: [1] {{Ü|it|decisione}} {{f}}, {{Ü|it|scelta}} {{f}}; [2] {{Ü|it|sentenza}} {{f}}
}}

{{Referenzen}}
:[1] {{Ref-Duden|Entscheidung}}

== Entscheidung ({{Sprache|Englisch}}) ==
=== {{Wortart|Substantiv|Englisch}} ===
{{Bedeutungen}}
:[1] fake
`;

const { entries, baseForm } = parseEntry('Entscheidung', ENTSCHEIDUNG);
assert.equal(baseForm, null);
assert.equal(entries.length, 1);
const e = entries[0];
assert.deepEqual(e.pos, ['sostantivo']);
assert.equal(e.article, 'die');
assert.equal(e.ipa, 'ɛntˈʃaɪ̯dʊŋ');
assert.equal(e.audio, 'De-Entscheidung.ogg');
assert.equal(e.forms.plural, 'Entscheidungen');
assert.equal(e.meanings.length, 2);
assert.match(e.meanings[1].text, /<span class="lbl">Rechtswesen:<\/span>/);
assert.doesNotMatch(e.meanings[1].text, /Duden|ref/);
assert.equal(e.examples.length, 3);
assert.deepEqual(e.examples[1].refs, ['1', '2']);
assert.match(e.examples[2].text, /<a data-q="getroffen">gefällt<\/a>/);
assert.equal(e.collocations.length, 1);
assert.equal(e.it.length, 2);
assert.deepEqual(e.it[0].words.map(w => w.replace(/<[^>]+>/g, '')), ['decisione f', 'scelta f']);
assert.deepEqual(e.it[1].refs, ['2']);
assert.equal(forMeaning(e.examples, '2').length, 2);

const GING = `== ging ({{Sprache|Deutsch}}) ==
=== {{Wortart|Konjugierte Form|Deutsch}} ===
{{Grammatische Merkmale}}
*1. Person Singular Indikativ Präteritum Aktiv des Verbs '''[[gehen]]'''
{{Grundformverweis Konj|gehen}}
`;
assert.deepEqual(parseEntry('ging', GING), { entries: [], baseForm: 'gehen' });

const GEHEN = `== gehen ({{Sprache|Deutsch}}) ==
=== {{Wortart|Verb|Deutsch}} ===
{{Deutsch Verb Übersicht
|Präsens_ich=gehe
|Präsens_du=gehst
|Präsens_er, sie, es=geht
|Präteritum_ich=ging
|Partizip II=gegangen
|Konjunktiv II_ich=ginge
|Imperativ Singular=geh
|Imperativ Plural=geht
|Hilfsverb=sein
}}
{{Bedeutungen}}
:[1] {{K|intrans.}} sich zu Fuß fortbewegen
`;
const g = parseEntry('gehen', GEHEN).entries[0];
assert.deepEqual(g.forms, { present: 'geht', past: 'ging', participle: 'gegangen', aux: 'sein' });
assert.equal(g.article, '');

assert.deepEqual(parseRefs('1–3, 5a'), ['1', '2', '3', '5a']);
assert.equal(clean("'''fett''' und ''kursiv'' <b>x</b>"), '<b>fett</b> und <i>kursiv</i> &lt;b&gt;x&lt;/b&gt;');
assert.equal(clean('{{ugs.}} [[Haus|Hause]]'), '<span class="lbl">ugs.</span> <a data-q="Haus">Hause</a>');
console.log('all parser tests passed');
