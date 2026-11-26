//Core: the witness model — bits that agree, bits that disagree, other realms, costumes,
//revoked proxies — the constants on the methods, the factory, and the shape of the exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import t, { typeim, _typeim } from '../src/type-im.js';

//values born in another realm: instanceof is blind to every one of them
const F = vm.runInNewContext('({ arr: [1], u8: new Uint8Array(2), map: new Map(), p: Promise.resolve(1), d: new Date(0), err: new TypeError("x"), obj: { a: 1 } })');

//=== exports ===
test('exports: singleton, class, factory; 33 public methods', () => {
	assert.ok(t instanceof typeim);
	assert.equal(typeof typeim, 'function');
	assert.equal(typeof _typeim, 'function');
	const pub = Object.getOwnPropertyNames(typeim.prototype).filter((k) => k !== 'constructor' && !k.startsWith('_'));
	assert.equal(pub.length, 33); //27 predicates + 6 accessors
	assert.ok(Object.isFrozen(t.ismap)); //the constants are sealed onto the methods
});

//=== the constants live on the methods, per predicate ===
test('every predicate carries its own bit constants, disjoint powers of two', () => {
	const preds = ['isarr', 'istyped', 'isbuf', 'isview', 'ismap', 'isset', 'isweakmap', 'isweakset', 'isprom', 'isdate', 'isregex', 'iserr', 'isargs', 'isbox', 'isplain', 'isasync', 'isgenfn', 'isagenfn', 'isclass', 'isarrow', 'isbound', 'isnative', 'isiter', 'isaiter', 'isgen', 'isagen', 'isiterable'];
	for (const k of preds) {
		const bits = Object.values(t[k]);
		assert.ok(bits.length >= 1, k);
		for (const b of bits) assert.ok(Number.isInteger(b) && b > 0 && (b & (b - 1)) === 0, `${k}: ${b} is a power of two`);
		assert.equal(new Set(bits).size, bits.length, `${k}: distinct bits`);
	}
	assert.equal(t.ismap.BRAND, 8);
	assert.equal(t.isarr.BRAND, 4); //positions follow the kind: Array has no DUCK bit
	assert.equal(t.istyped.SHAPE, 2);
	assert.equal(t.isbuf.SHARED, 64);
	assert.equal(t.telem.CLAMPED, 0x1000);
	assert.equal(t.tfn.CTOR, 128);
});

//=== zero means "no witness said so"; the top bit is the truth where the platform has one ===
test('the genuine, local, unextended thing lights every bit; nothing lights none', () => {
	assert.equal(t.ismap(new Map()), 63);
	assert.equal(t.isset(new Set()), 63);
	assert.equal(t.isprom(Promise.resolve()), 63);
	assert.equal(t.istyped(new Uint8Array(1)), 63);
	assert.equal(t.isbuf(new ArrayBuffer(1)), 63);
	assert.equal(t.isview(new DataView(new ArrayBuffer(1))), 63);
	assert.equal(t.isarr([]), 29); //no TAG: a real array has no tag property, so TAG is a costume detector
	assert.equal(t.isdate(new Date()), 61); //same
	assert.equal(t.isregex(/x/), 61);
	assert.equal(t.iserr(new TypeError('x')), 61);
	for (const v of [null, undefined, 1, 'x', true, Symbol(), 1n, {}, () => {}]) {
		assert.equal(t.ismap(v), 0, String(v));
		assert.equal(t.istyped(v), 0);
		assert.equal(t.isprom(v), 0);
		assert.equal(t.isdate(v), 0);
	}
});

//=== the sign of a lie: which witness said what ===
test('costumes: a toStringTag or a name without the substance', () => {
	assert.equal(t.ismap({ [Symbol.toStringTag]: 'Map' }), t.ismap.TAG); //2: the tag claims, nothing else
	assert.equal(t.isarr({ [Symbol.toStringTag]: 'Array' }), t.isarr.TAG);
	assert.equal(t.iserr({ [Symbol.toStringTag]: 'Error' }), t.iserr.TAG);
	assert.equal(t.istyped(new (class Float32Array {})()), t.istyped.SUFFIX | t.istyped.SHAPE); //3: named like one, is not one
	assert.equal(t.istyped({ [Symbol.toStringTag]: 'Uint8Array' }), t.istyped.TAG); //4
	assert.equal(t.isdate({ getTime() {}, toISOString() {} }), t.isdate.DUCK); //4: walks like one
	assert.equal(t.isprom({ then() {} }), t.isprom.DUCK); //4: a thenable — await accepts it, the brand does not
	assert.equal(t.ismap({ get() {}, set() {}, has() {}, delete() {}, size: 0 }), t.ismap.DUCK);
	//the reading: claimed, not real
	const x = t.ismap({ [Symbol.toStringTag]: 'Map' });
	assert.ok(x & (t.ismap.NAME | t.ismap.TAG));
	assert.equal(x & t.ismap.BRAND, 0);
});
test('another realm: BRAND without PROTO or OWN — exactly where instanceof lies', () => {
	assert.equal(F.arr instanceof Array, false); //the lie
	assert.equal(t.isarr(F.arr), t.isarr.NAME | t.isarr.BRAND); //5: name and slot, no local chain
	assert.equal(t.istyped(F.u8), 15); //SUFFIX SHAPE TAG BRAND
	assert.equal(t.ismap(F.map), 15); //NAME TAG DUCK BRAND
	assert.equal(t.isprom(F.p), 15);
	assert.equal(t.isdate(F.d), 13); //NAME DUCK BRAND
	assert.equal(t.iserr(F.err), 13);
	assert.equal(t.isplain(F.obj), t.isplain.NAME | t.isplain.SHAPE); //3: plain by shape, not local
	for (const [pred, v] of [[t.isarr, F.arr], [t.istyped, F.u8], [t.ismap, F.map], [t.isprom, F.p], [t.isdate, F.d], [t.iserr, F.err]]) {
		const x = pred(v);
		assert.ok(x & pred.BRAND, 'real');
		assert.equal(x & (pred.PROTO | pred.OWN), 0, 'not of this realm');
	}
});
test('a subclass: BRAND and PROTO without OWN', () => {
	class Stack extends Array {}
	class MyMap extends Map {}
	class PixelArray extends Uint8ClampedArray {}
	class ValidationError extends Error {}
	assert.equal(t.isarr(new Stack()), t.isarr.BRAND | t.isarr.PROTO); //12: no NAME (Stack), no OWN
	assert.equal(t.ismap(new MyMap()), 30); //TAG DUCK BRAND PROTO — the tag is inherited, the name is not
	assert.equal(t.istyped(new PixelArray(1)), 29); //SUFFIX TAG BRAND PROTO: the slot says Uint8ClampedArray
	assert.equal(t.iserr(new ValidationError('x')), 29); //NAME DUCK BRAND PROTO, not a native error class
	assert.equal(t.istyped(Buffer.alloc(1)), t.istyped.TAG | t.istyped.BRAND | t.istyped.PROTO); //28: a Uint8Array whose name says nothing
});

//=== nothing throws ===
test('a revoked Proxy, a throwing getter, a null-prototype object: 0, never an exception', () => {
	const { proxy, revoke } = Proxy.revocable([], {});
	revoke();
	assert.throws(() => Array.isArray(proxy), TypeError); //the platform throws
	const preds = ['isarr', 'istyped', 'isbuf', 'isview', 'ismap', 'isset', 'isweakmap', 'isweakset', 'isprom', 'isdate', 'isregex', 'iserr', 'isargs', 'isbox', 'isplain', 'isasync', 'isgenfn', 'isagenfn', 'isclass', 'isarrow', 'isbound', 'isnative', 'isiter', 'isaiter', 'isgen', 'isagen', 'isiterable'];
	for (const k of preds) assert.equal(t[k](proxy), 0, k);
	for (const k of ['tname', 'ttag', 'terr', 'tbox']) assert.equal(t[k](proxy), undefined, k);
	assert.equal(t.telem(proxy), 0);
	assert.equal(t.tfn(proxy), 0);
	const nasty = { get constructor() { throw new Error('no'); }, get [Symbol.toStringTag]() { throw new Error('no'); }, get then() { throw new Error('no'); } };
	for (const k of preds) assert.doesNotThrow(() => t[k](nasty), k);
	assert.equal(t.isplain(Object.create(null)), t.isplain.NULL);
	assert.equal(t.tname(Object.create(null)), undefined);
});

//=== the _typeim factory ===
test('_typeim: no argument — the same singleton, for free', () => {
	assert.equal(_typeim(), t);
	assert.equal(_typeim({}), t);
});
test('_typeim: overrides replace a method, super reaches the original, constants follow', () => {
	const strict = _typeim({ ismap(v) { return super.ismap(v) & super.ismap.BRAND ? super.ismap(v) : 0; } }); //a Map or nothing
	assert.equal(strict.ismap(new Map()), 63);
	assert.equal(strict.ismap({ [Symbol.toStringTag]: 'Map' }), 0); //the costume no longer counts
	assert.equal(strict.ismap.BRAND, 8); //the override received the constants
	assert.ok(strict instanceof typeim);
	assert.equal(strict.isset(new Set()), 63); //the rest is untouched
	assert.ok(Object.isFrozen(strict));
	assert.equal(t.ismap({ [Symbol.toStringTag]: 'Map' }), 2); //the singleton is untouched
});
test('_typeim: the same overrides object -> the same instance; unknown names throw', () => {
	const ov = { isarr() { return 999; } };
	assert.equal(_typeim(ov), _typeim(ov));
	assert.equal(_typeim(ov).isarr([]), 999);
	assert.throws(() => _typeim({ bogus() {} }), TypeError);
	assert.throws(() => _typeim({ isarr: 5 }), TypeError);
});

//=== no side effects: the Promise brand is the host's, never a registered reaction ===
test('isprom consults the host brand and enqueues nothing', async () => {
	let thenCalls = 0;
	const spy = new Promise(() => {});
	spy.then = function (...a) { thenCalls++; return Promise.prototype.then.apply(this, a); }; //an own then: any reaction would go through here
	assert.equal(t.isprom(spy) & t.isprom.BRAND, 8); //Node: util.types.isPromise
	assert.equal(thenCalls, 0);
	const pending = new Promise(() => {});
	for (let i = 0; i < 1000; i++) t.isprom(pending); //a hot loop over a live promise costs nothing later
	const rejected = Promise.reject(new Error('x'));
	assert.equal(t.isprom(rejected) & t.isprom.BRAND, 8);
	await rejected.catch(() => {}); //handled here, not by a check
});

//=== the methods detach (point 8) ===
test('every public method is an own, bound, frozen property: it detaches and keeps its constants', () => {
	const { ismap, istyped, telem, tfn } = t;
	assert.deepEqual([new Map(), {}, new Set()].filter(ismap).length, 1);
	assert.deepEqual([new Uint8Array(1), [], Buffer.alloc(1)].map(istyped), [63, 1, 28]);
	assert.equal(telem(new Float32Array(1)), 0x320);
	assert.equal(tfn(() => {}), tfn.ARROW);
	assert.equal(ismap.BRAND, 8);
	assert.equal(typeim.prototype.ismap.BRAND, 8); //the prototype method has them too
	assert.ok(Object.isFrozen(ismap));
	assert.equal(Object.keys(t).length, 33); //enumerable: the surface is discoverable
	assert.throws(() => { 'use strict'; t.ismap = () => 0; }, TypeError); //not writable
});

//=== the other direction of the lie: a chain without a slot ===
test('a chain costume: PROTO and OWN without BRAND — where instanceof says yes and is wrong', () => {
	const fake = Object.create(Map.prototype);
	assert.equal(fake instanceof Map, true); //the lie
	assert.equal(t.ismap(fake), t.ismap.NAME | t.ismap.TAG | t.ismap.PROTO | t.ismap.OWN); //name, tag, chain, constructor — but no slot, and no DUCK either: the size getter is a brand check and refuses it
	assert.equal(t.ismap(fake) & t.ismap.BRAND, 0);
	assert.throws(() => Map.prototype.get.call(fake, 1), TypeError); //and the platform agrees
	const fakeU8 = Object.create(Uint8Array.prototype);
	assert.equal(t.istyped(fakeU8), t.istyped.SUFFIX | t.istyped.SHAPE | t.istyped.PROTO | t.istyped.OWN); //no TAG: the %TypedArray% getter answers undefined for it
	assert.equal(t.telem(fakeU8), 0x208); //a claim, from the name
});
