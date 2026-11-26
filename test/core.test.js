//Core: the shape of the exports and the boundary conventions — booleans by the strongest
//witness, costumes and ducks collapsed to false, other realms and subclasses to true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ez, * as named from '../src/type-ez.js';
import t from '@slnknrr/type-im';

const F = vm.runInNewContext('({ arr: [1], u8: new Uint8Array(2), map: new Map(), p: Promise.resolve(1), d: new Date(0), err: new TypeError("x"), obj: { a: 1 }, gen: (function* () {})(), afn: async () => {} })');

//=== exports ===
test('default export: a frozen object holding every named export', () => {
	assert.ok(Object.isFrozen(ez));
	const names = Object.keys(named).filter((k) => k !== 'default');
	assert.equal(names.length, 41); //27 wrappers + 6 accessors + 8 compositions
	for (const k of names) assert.equal(ez[k], named[k], `ez.${k} is the named export`);
	assert.equal(Object.keys(ez).length, names.length);
});
test('every export is a function', () => {
	for (const [k, v] of Object.entries(ez)) assert.equal(typeof v, 'function', k);
});
test('every predicate returns a boolean, never the engine\'s bits', () => {
	for (const k of Object.keys(ez).filter((k) => k.startsWith('is'))) {
		for (const v of [new Map(), [], 1, null, undefined, () => {}, {}]) assert.equal(typeof ez[k](v), 'boolean', `${k}(${String(v)})`);
	}
});

//=== the strongest witness decides ===
test('the brand decides: costumes and ducks are false, subclasses and other realms are true', () => {
	assert.equal(t.ismap({ [Symbol.toStringTag]: 'Map' }), 2); //the engine sees a costume
	assert.equal(ez.isMap({ [Symbol.toStringTag]: 'Map' }), false); //the wrapper does not care
	assert.equal(ez.isMap({ get() {}, set() {}, has() {}, delete() {}, size: 0 }), false); //a duck
	assert.equal(ez.isMap(Object.create(Map.prototype)), false); //a chain costume: instanceof says true
	assert.equal(ez.isMap(new (class Cache extends Map {})()), true);
	assert.equal(ez.isMap(F.map), true); //instanceof says false
	assert.equal(F.map instanceof Map, false);
	assert.equal(ez.isArray(F.arr), true);
	assert.equal(ez.isTypedArray(F.u8), true);
	assert.equal(ez.isTypedArray(new (class Float32Array {})()), false); //named like one, is not one
	assert.equal(ez.isDate(F.d), true);
	assert.equal(ez.isDate({ getTime() {}, toISOString() {} }), false);
	assert.equal(ez.isError(F.err), true);
	assert.equal(ez.isError({ message: 'x', name: 'Error' }), false);
	assert.equal(ez.isError(Object.create(Error.prototype)), false); //no [[ErrorData]]
});
test('isPromise: the brand where the host has one; a thenable is not a promise, but isThenable', () => {
	assert.equal(ez.isPromise(Promise.resolve()), true);
	assert.equal(ez.isPromise(F.p), true);
	assert.equal(ez.isPromise(new (class P extends Promise {})(() => {})), true);
	assert.equal(ez.isPromise({ then() {} }), false);
	assert.equal(ez.isPromise(Object.create(Promise.prototype)), false); //Node: the host brand says no
	assert.equal(ez.isThenable({ then() {} }), true);
	assert.equal(ez.isThenable(Promise.resolve()), true);
	assert.equal(ez.isThenable({ then: 1 }), false);
});
test('functions: the source text decides, cross-realm', () => {
	assert.equal(ez.isAsyncFunction(F.afn), true);
	assert.equal(ez.isAsyncFunction(function asyncName() {}), false);
	assert.equal(ez.isAsyncFunction(async function* () {}), false);
	assert.equal(ez.isClass(class {}), true);
	assert.equal(ez.isClass(Map), false); //a native constructor, not class syntax
	assert.equal(ez.isConstructor(Map), true);
	assert.equal(ez.isConstructor(class {}), true);
	assert.equal(ez.isConstructor(() => {}), false);
	assert.equal(ez.isConstructor(async function () {}), false);
	assert.equal(ez.isBoundFunction(Math.max), false); //prints as native, is not named bound
	assert.equal(ez.isBoundFunction(Math.max.bind(null)), true);
	assert.equal(ez.isNativeFunction(Math.max.bind(null)), false);
});
test('iterators: the protocol; generators need the tag or the chain too', () => {
	assert.equal(ez.isIterator({ next() {} }), true); //the protocol is the contract
	assert.equal(ez.isIterator(new Map()), false); //iterable, not an iterator
	assert.equal(ez.isGenerator({ next() {}, return() {}, throw() {} }), false); //the protocol alone is not a generator
	assert.equal(ez.isGenerator((function* () {})()), true);
	assert.equal(ez.isGenerator(F.gen), true); //another realm: the tag carries it
	assert.equal(ez.isGenerator([].values()), false);
});

//=== accessors unpack the engine's numbers ===
test('typedArrayKind / functionKind are objects; nothing packed leaks out', () => {
	assert.deepEqual(ez.typedArrayKind(new Uint8ClampedArray(1)), { kind: 'uint', bits: 8, clamped: true, bytesPerElement: 1 });
	assert.deepEqual(ez.typedArrayKind(Buffer.alloc(1)), { kind: 'uint', bits: 8, clamped: false, bytesPerElement: 1 });
	assert.deepEqual(ez.typedArrayKind(new BigUint64Array(1)), { kind: 'biguint', bits: 64, clamped: false, bytesPerElement: 8 });
	assert.deepEqual(ez.typedArrayKind(new Float16Array(1)), { kind: 'float', bits: 16, clamped: false, bytesPerElement: 2 });
	assert.deepEqual(ez.typedArrayKind(F.u8), { kind: 'uint', bits: 8, clamped: false, bytesPerElement: 1 });
	assert.equal(ez.typedArrayKind([]), undefined);
	assert.equal(ez.typedArrayKind(1), undefined);
	assert.deepEqual(ez.functionKind(async () => {}), { async: true, generator: false, class: false, arrow: true, method: false, bound: false, native: false, constructible: false });
	assert.deepEqual(ez.functionKind(class {}), { async: false, generator: false, class: true, arrow: false, method: false, bound: false, native: false, constructible: true });
	assert.deepEqual(ez.functionKind(Math.max), { async: false, generator: false, class: false, arrow: false, method: false, bound: false, native: true, constructible: false });
	assert.equal(ez.functionKind({}), undefined);
});

//=== undefined stays undefined ===
test('what the engine cannot say stays undefined', () => {
	assert.equal(ez.constructorName(Object.create(null)), undefined);
	assert.equal(ez.constructorName(1), undefined);
	assert.equal(ez.toStringTag([]), undefined);
	assert.equal(ez.errorName({}), undefined);
	assert.equal(ez.boxedType(1), undefined);
});

//=== nothing throws ===
test('a revoked Proxy is false, undefined or "object" everywhere', () => {
	const { proxy, revoke } = Proxy.revocable([], {});
	revoke();
	for (const k of Object.keys(ez)) assert.doesNotThrow(() => ez[k](proxy, Uint8Array), k);
	assert.equal(ez.isArray(proxy), false);
	assert.equal(ez.kindOf(proxy), 'object');
	assert.equal(ez.typedArrayKind(proxy), undefined);
});
