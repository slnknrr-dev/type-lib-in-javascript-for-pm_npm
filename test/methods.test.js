//Behavioral tests of the public API, §1-6: every wrapper against the values that should and
//should not pass, Node's util.types as the oracle where it has an answer, and every composition
//against its definition. node --test, no external dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { types as U } from 'node:util';
import ez from '../src/type-ez.js';

const F = vm.runInNewContext('({ arr: [1], u8: new Uint8Array(2), ab: new ArrayBuffer(1), dv: new DataView(new ArrayBuffer(1)), map: new Map(), set: new Set(), p: Promise.resolve(1), d: new Date(0), re: /x/, err: new RangeError("x"), box: Object(1), obj: { a: 1 }, gen: (function* () {})(), it: [1].values(), cls: class {}, arrow: () => {} })');

//=== §1 containers ===
test('isArray / isTypedArray / isTypedArrayOf', () => {
	assert.equal(ez.isArray([]), true);
	assert.equal(ez.isArray(F.arr), true);
	assert.equal(ez.isArray(new (class Stack extends Array {})()), true);
	assert.equal(ez.isArray(new Uint8Array(1)), false);
	assert.equal(ez.isArray({ length: 0 }), false);
	assert.equal(ez.isArray('abc'), false);
	for (const C of [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, ...(typeof Float16Array == "function" ? [Float16Array] : [])]) {
		assert.equal(ez.isTypedArray(new C(1)), true, C.name);
		assert.equal(ez.isTypedArrayOf(new C(1), C), true, C.name);
		assert.equal(ez.isTypedArrayOf(new C(1), C.name), true, C.name);
	}
	assert.equal(ez.isTypedArray(Buffer.alloc(1)), true);
	assert.equal(ez.isTypedArray(F.u8), true);
	assert.equal(ez.isTypedArray(new DataView(new ArrayBuffer(1))), false);
	assert.equal(ez.isTypedArray([1]), false);
	assert.equal(ez.isTypedArray({ [Symbol.toStringTag]: 'Uint8Array' }), false);
	assert.equal(ez.isTypedArrayOf(Buffer.alloc(1), Uint8Array), true); //by the slot: a Buffer is a Uint8Array
	assert.equal(ez.isTypedArrayOf(F.u8, Uint8Array), true); //across realms: by name
	assert.equal(ez.isTypedArrayOf(new (class PixelArray extends Uint8ClampedArray {})(1), 'Uint8ClampedArray'), true);
	assert.equal(ez.isTypedArrayOf(new Float32Array(1), Uint8Array), false);
	assert.equal(ez.isTypedArrayOf(new (class Float32Array {})(), Float32Array), false); //not a typed array at all
	assert.equal(ez.isTypedArrayOf([1], Uint8Array), false);
	assert.equal(ez.isTypedArrayOf(new Uint8Array(1), 5), false);
	assert.equal(U.isTypedArray(F.u8), true);
});
test('isArrayBuffer / isSharedArrayBuffer / isAnyArrayBuffer / isDataView', () => {
	assert.equal(ez.isArrayBuffer(new ArrayBuffer(1)), true);
	assert.equal(ez.isArrayBuffer(F.ab), true);
	assert.equal(ez.isArrayBuffer(new SharedArrayBuffer(1)), false);
	assert.equal(ez.isSharedArrayBuffer(new SharedArrayBuffer(1)), true);
	assert.equal(ez.isSharedArrayBuffer(new ArrayBuffer(1)), false);
	assert.equal(ez.isAnyArrayBuffer(new ArrayBuffer(1)), true);
	assert.equal(ez.isAnyArrayBuffer(new SharedArrayBuffer(1)), true);
	assert.equal(ez.isAnyArrayBuffer(new Uint8Array(1)), false);
	assert.equal(ez.isArrayBuffer({ byteLength: 1, slice() {} }), false);
	assert.equal(ez.isDataView(new DataView(new ArrayBuffer(1))), true);
	assert.equal(ez.isDataView(F.dv), true);
	assert.equal(ez.isDataView(new Uint8Array(1)), false);
	assert.equal(U.isAnyArrayBuffer(F.ab), true);
});
test('isMap / isSet / isWeakMap / isWeakSet', () => {
	assert.equal(ez.isMap(new Map()), true);
	assert.equal(ez.isMap(F.map), true);
	assert.equal(ez.isMap(new Set()), false);
	assert.equal(ez.isMap(new WeakMap()), false);
	assert.equal(ez.isSet(new Set()), true);
	assert.equal(ez.isSet(F.set), true);
	assert.equal(ez.isSet(new Map()), false);
	assert.equal(ez.isWeakMap(new WeakMap()), true);
	assert.equal(ez.isWeakMap(new Map()), false); //a Map ducks as one, but the slot says no
	assert.equal(ez.isWeakSet(new WeakSet()), true);
	assert.equal(ez.isWeakSet(new Set()), false);
	assert.equal(U.isMap(F.map), true);
});

//=== §2 values with a slot ===
test('isDate / isRegExp / isError / isArguments / isBoxedPrimitive', () => {
	assert.equal(ez.isDate(new Date(NaN)), true);
	assert.equal(ez.isDate(F.d), true);
	assert.equal(ez.isDate(Date.now()), false);
	assert.equal(ez.isRegExp(/x/), true);
	assert.equal(ez.isRegExp(F.re), true);
	assert.equal(ez.isRegExp(RegExp.prototype), false);
	assert.equal(ez.isRegExp({ exec() {}, test() {} }), false);
	assert.equal(ez.isError(new TypeError('x')), true);
	assert.equal(ez.isError(new (class ValidationError extends Error {})()), true);
	assert.equal(ez.isError(F.err), true);
	assert.equal(ez.isError({ [Symbol.toStringTag]: 'Error' }), false);
	assert.equal(ez.isArguments((function () { return arguments; })()), true);
	assert.equal(ez.isArguments({ [Symbol.toStringTag]: 'Arguments' }), false);
	assert.equal(ez.isArguments([]), false);
	assert.equal(ez.isBoxedPrimitive(Object(1)), true);
	assert.equal(ez.isBoxedPrimitive(Object('x')), true);
	assert.equal(ez.isBoxedPrimitive(Object(1n)), true);
	assert.equal(ez.isBoxedPrimitive(Object(Symbol())), true);
	assert.equal(ez.isBoxedPrimitive(F.box), true);
	assert.equal(ez.isBoxedPrimitive(1), false);
	assert.equal(ez.isBoxedPrimitive({}), false);
	assert.equal(ez.isBoxedPrimitive(Object.create(Number.prototype)), false);
	assert.equal(U.isBoxedPrimitive(F.box), true);
	assert.equal(U.isNativeError(F.err), true);
});
test('isPlainObject', () => {
	assert.equal(ez.isPlainObject({}), true);
	assert.equal(ez.isPlainObject({ a: [1] }), true);
	assert.equal(ez.isPlainObject(JSON.parse('{"a":1}')), true);
	assert.equal(ez.isPlainObject(Object.create(null)), true);
	assert.equal(ez.isPlainObject(F.obj), true); //another realm
	assert.equal(ez.isPlainObject(new (class Point {})()), false);
	assert.equal(ez.isPlainObject([]), false);
	assert.equal(ez.isPlainObject(new Map()), false);
	assert.equal(ez.isPlainObject(() => {}), false);
	assert.equal(ez.isPlainObject(null), false);
	assert.equal(ez.isPlainObject(1), false);
	assert.equal(ez.isPlainObject(Math), false); //tagged: not plain, as lodash agrees
	assert.equal(ez.isPlainObject({ [Symbol.toStringTag]: 'x' }), false);
	assert.equal(ez.isPlainObject(Object.create(Object.create(null))), false);
	assert.equal(ez.isPlainObject((function () { return arguments; })()), true); //lodash agrees here too
});

//=== §3 functions ===
test('the function predicates', () => {
	assert.equal(ez.isAsyncFunction(async () => {}), true);
	assert.equal(ez.isAsyncFunction(async function () {}), true);
	assert.equal(ez.isAsyncFunction({ async m() {} }.m), true);
	assert.equal(ez.isAsyncFunction(() => {}), false);
	assert.equal(ez.isAsyncFunction(function () { return Promise.resolve(); }), false);
	assert.equal(ez.isGeneratorFunction(function* () {}), true);
	assert.equal(ez.isGeneratorFunction({ *g() {} }.g), true);
	assert.equal(ez.isGeneratorFunction(async function* () {}), false);
	assert.equal(ez.isAsyncGeneratorFunction(async function* () {}), true);
	assert.equal(ez.isAsyncGeneratorFunction(function* () {}), false);
	assert.equal(ez.isClass(class {}), true);
	assert.equal(ez.isClass(F.cls), true);
	assert.equal(ez.isClass(function f() {}), false);
	assert.equal(ez.isArrowFunction(() => {}), true);
	assert.equal(ez.isArrowFunction((x) => x), true);
	assert.equal(ez.isArrowFunction(async (a, b = (1)) => a), true);
	assert.equal(ez.isArrowFunction(F.arrow), true);
	assert.equal(ez.isArrowFunction({ m() {} }.m), false);
	assert.equal(ez.isArrowFunction(function () {}), false);
	assert.equal(ez.isBoundFunction(function b() {}.bind(null)), true);
	assert.equal(ez.isBoundFunction(Object.defineProperty(function () {}, 'name', { value: 'bound x' })), false); //renamed, not bound
	assert.equal(ez.isNativeFunction(Math.max), true);
	assert.equal(ez.isNativeFunction(Map), true);
	assert.equal(ez.isNativeFunction(function () {}), false);
	assert.equal(ez.isConstructor(function f() {}), true);
	assert.equal(ez.isConstructor(function b() {}.bind(null)), true);
	assert.equal(ez.isConstructor({ m() {} }.m), false);
	assert.equal(ez.isConstructor(function* () {}), false);
	assert.equal(ez.isConstructor(Math.max), false);
	assert.equal(ez.isConstructor(5), false);
	assert.equal(U.isAsyncFunction(F.arrow), false);
});

//=== §4 iteration ===
test('the iteration predicates', () => {
	for (const it of [[].values(), new Map().keys(), 'x'[Symbol.iterator](), (function* () {})(), F.it]) assert.equal(ez.isIterator(it), true);
	assert.equal(ez.isIterator({ next() {} }), true);
	assert.equal(ez.isIterator([]), false);
	assert.equal(ez.isIterator({}), false);
	assert.equal(ez.isAsyncIterator((async function* () {})()), true);
	assert.equal(ez.isAsyncIterator([].values()), true); //the protocol is next; the sync iterator has one
	assert.equal(ez.isAsyncIterator({}), false);
	assert.equal(ez.isGenerator((function* () {})()), true);
	assert.equal(ez.isGenerator(F.gen), true);
	assert.equal(ez.isGenerator((async function* () {})()), false);
	assert.equal(ez.isGenerator({ next() {}, return() {}, throw() {}, [Symbol.toStringTag]: 'Generator' }), true); //protocol + tag: the best a foreign generator can offer, and a costume can match it
	assert.equal(ez.isAsyncGenerator((async function* () {})()), true);
	assert.equal(ez.isAsyncGenerator((function* () {})()), false);
	assert.equal(ez.isIterable([]), true);
	assert.equal(ez.isIterable('x'), true);
	assert.equal(ez.isIterable(new Map()), true);
	assert.equal(ez.isIterable({}), false);
	assert.equal(ez.isIterable(null), false);
	assert.equal(ez.isAsyncIterable((async function* () {})()), true);
	assert.equal(ez.isAsyncIterable([]), false);
	assert.equal(U.isGeneratorObject(F.gen), true);
});

//=== §5 kinds ===
test('constructorName / toStringTag / errorName / boxedType', () => {
	assert.equal(ez.constructorName(new Map()), 'Map');
	assert.equal(ez.constructorName(F.map), 'Map');
	assert.equal(ez.constructorName(Buffer.alloc(0)), 'Buffer');
	assert.equal(ez.constructorName(null), undefined);
	assert.equal(ez.toStringTag(Buffer.alloc(0)), 'Uint8Array');
	assert.equal(ez.toStringTag(new Date()), undefined);
	assert.equal(ez.errorName(new RangeError('x')), 'RangeError');
	assert.equal(ez.errorName(F.err), 'RangeError');
	assert.equal(ez.errorName(new (class Oops extends Error {})()), 'Oops');
	assert.equal(ez.errorName('x'), undefined);
	assert.equal(ez.boxedType(Object(1)), 'number');
	assert.equal(ez.boxedType(Object(true)), 'boolean');
	assert.equal(ez.boxedType(F.box), 'number');
	assert.equal(ez.boxedType({}), undefined);
});

//=== §6 everyday questions ===
test('isPrimitive / kindOf', () => {
	for (const v of [null, undefined, 1, 'x', 1n, Symbol(), true, NaN]) assert.equal(ez.isPrimitive(v), true, String(v));
	for (const v of [{}, [], () => {}, new Map(), Object(1)]) assert.equal(ez.isPrimitive(v), false);
	const cases = [
		[null, 'null'], [undefined, 'undefined'], [1, 'number'], ['x', 'string'], [1n, 'bigint'], [Symbol(), 'symbol'], [true, 'boolean'],
		[[], 'array'], [F.arr, 'array'], [new Uint8Array(1), 'typedarray'], [Buffer.alloc(1), 'typedarray'], [new ArrayBuffer(1), 'arraybuffer'], [new SharedArrayBuffer(1), 'arraybuffer'],
		[new DataView(new ArrayBuffer(1)), 'dataview'], [new Map(), 'map'], [F.map, 'map'], [new Set(), 'set'], [new WeakMap(), 'weakmap'], [new WeakSet(), 'weakset'],
		[Promise.resolve(), 'promise'], [F.p, 'promise'], [{ then() {} }, 'plain'], [new Date(), 'date'], [/x/, 'regexp'], [new TypeError('x'), 'error'], [F.err, 'error'],
		[(function () { return arguments; })(), 'arguments'], [Object(1), 'boxed'], [(function* () {})(), 'generator'], [F.gen, 'generator'], [(async function* () {})(), 'asyncgenerator'],
		[[].values(), 'iterator'], [{ next() {} }, 'iterator'], [{}, 'plain'], [Object.create(null), 'plain'], [F.obj, 'plain'], [new (class Point {})(), 'object'], [Math, 'object'], [Object.create(Map.prototype), 'object'],
		[() => {}, 'function'], [function f() {}, 'function'], [class {}, 'class'], [function* () {}, 'generatorfunction'], [async () => {}, 'asyncfunction'], [async function* () {}, 'asyncgeneratorfunction'], [Math.max, 'function'],
	];
	cases.forEach(([v, kind], i) => assert.equal(ez.kindOf(v), kind, `case ${i}: expected ${kind}`));
});

test('async detection survives minified source and async used as a name', () => {
	const fn = (src) => vm.runInNewContext(`(${src})`);
	assert.equal(ez.isAsyncFunction(fn('async()=>{}')), true);
	assert.equal(ez.isArrowFunction(fn('async()=>{}')), true);
	assert.equal(ez.isAsyncGeneratorFunction(fn('({async*m(){}}).m')), true);
	assert.equal(ez.isAsyncFunction(fn('({async(){}}).async')), false);
	assert.equal(ez.isAsyncFunction(fn('async => 1')), false);
	assert.deepEqual(ez.functionKind(fn('async()=>{}')), { async: true, generator: false, class: false, arrow: true, method: false, bound: false, native: false, constructible: false });
});
