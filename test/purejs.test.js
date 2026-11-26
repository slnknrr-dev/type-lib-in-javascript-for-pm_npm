//The pure-JavaScript path: what a browser sees. A child process with process.getBuiltinModule
//removed loads the engine without the host's util.types, so every brand is the pure probe —
//and the Promise brand is absent, as documented. The numbers here are the contract for
//environments without a host brand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const engine = new URL('../src/type-im.js', import.meta.url).href;
const script = [
	'process.getBuiltinModule = undefined;',
	`const { default: t } = await import(${JSON.stringify(engine)});`,
	"const vm = await import('node:vm');",
	"const F = vm.runInNewContext('({ map: new Map(), d: new Date(0), p: Promise.resolve(1), box: Object(1) })');",
	'const stripped = Object.setPrototypeOf(new Map(), {});',
	'const bare = Object.setPrototypeOf(new Map(), null);',
	'console.log(JSON.stringify({',
	"	map: t.ismap(new Map()), foreignMap: t.ismap(F.map), costume: t.ismap({ [Symbol.toStringTag]: 'Map' }), chain: t.ismap(Object.create(Map.prototype)),",
	'	stripped: t.ismap(stripped), bare: t.ismap(bare),',
	'	date: t.isdate(new Date()), foreignDate: t.isdate(F.d), prom: t.isprom(Promise.resolve()), foreignProm: t.isprom(F.p), thenable: t.isprom({ then() {} }),',
	"	box: t.isbox(Object(1)), foreignBox: t.isbox(F.box), tbox: t.tbox(Object('x')), notBox: t.isbox({}), plain: t.isplain({}), typed: t.istyped(new Uint8Array(1)),",
	'}));',
].join('\n');
const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim());

test('without a host brand the pure probes give the same answers for anything with a prototype', () => {
	assert.equal(out.map, 63);
	assert.equal(out.foreignMap, 15); //the probe is cross-realm too
	assert.equal(out.costume, 2);
	assert.equal(out.chain, 51); //NAME TAG PROTO OWN — no slot, no DUCK (the size getter refuses it)
	assert.equal(out.date, 61);
	assert.equal(out.foreignDate, 13);
	assert.equal(out.box, 29);
	assert.equal(out.foreignBox, 5);
	assert.equal(out.tbox, 'string');
	assert.equal(out.notBox, 0);
	assert.equal(out.plain, 11);
	assert.equal(out.typed, 63);
});
test('the stated blind spot: a Map whose prototype was swapped is silent to the probe, a bare one is not', () => {
	assert.equal(out.stripped, 0); //no name, no tag, no methods, a prototype that is not null: the probe is not asked
	assert.equal(out.bare, 8); //no prototype at all: the probe is asked, and the slot answers
});
test('the Promise brand belongs to the host: without one, 55 for a genuine promise and never 8', () => {
	assert.equal(out.prom, 55); //NAME TAG DUCK PROTO OWN — everything but BRAND
	assert.equal(out.foreignProm, 7); //NAME TAG DUCK
	assert.equal(out.thenable, 4);
});
