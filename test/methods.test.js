//Behavioral tests of the public API, §1-5: every predicate's bits against the values that
//should and should not light them, including the other realm; every accessor of kind.
//Node's util.types is the oracle where it has an answer. node --test, no external dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { types as U } from 'node:util';
import t from '../src/type-im.js';

const F16 = typeof Float16Array == "function"; //Node 24+
const ITER = typeof Iterator == "function"; //the Iterator global and its helpers: Node 22+
const TYPED = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, ...(F16 ? [Float16Array] : [])];
const F = vm.runInNewContext('({ arr: [1], u8: new Uint8Array(2), f16: typeof Float16Array == "function" ? new Float16Array(1) : undefined, ab: new ArrayBuffer(1), dv: new DataView(new ArrayBuffer(1)), map: new Map(), set: new Set(), wm: new WeakMap(), p: Promise.resolve(1), d: new Date(0), re: /x/, err: new RangeError("x"), box: Object(1), obj: { a: 1 }, afn: async () => {}, gen: function* () {}, agen: async function* () {}, cls: class {}, arrow: () => {}, it: [1].values(), genobj: (function* () {})() })');

//=== §1 containers ===
test('isarr', () => {
	assert.equal(t.isarr([1]), 29);
	assert.equal(t.isarr(new Array(3)), 29);
	assert.equal(t.isarr(F.arr), 5);
	assert.equal(t.isarr(new (class Stack extends Array {})()), 12);
	assert.equal(t.isarr(new Uint8Array(1)), 0);
	assert.equal(t.isarr({ length: 0 }), 0);
	assert.equal(t.isarr({ [Symbol.toStringTag]: 'Array' }), 2);
	assert.equal(t.isarr(new Proxy([], {})), t.isarr.NAME | t.isarr.BRAND | t.isarr.PROTO | t.isarr.OWN); //a Proxy of an array is an array to Array.isArray
});
test('istyped: every kind, the slot, the shape, the future', () => {
	for (const C of TYPED) {
		assert.equal(t.istyped(new C(1)), 63, C.name);
		assert.equal(U.isTypedArray(new C(1)), true);
	}
	assert.equal(t.istyped(F.u8), 15);
	if (F16) assert.equal(t.istyped(F.f16), 15); //Float16Array: known by its shape, not by a list
	assert.equal(t.istyped(Buffer.alloc(1)), 28);
	assert.equal(t.istyped(new DataView(new ArrayBuffer(1))), 0); //a view, not a typed array
	assert.equal(t.istyped([1]), t.istyped.SUFFIX); //named Array, nothing more
	assert.equal(t.istyped(new (class BitArray {})()), t.istyped.SUFFIX);
	assert.equal(t.istyped(new (class Float32Array {})()), 3);
	assert.equal(t.istyped(new (class Uint24Array {})()), 1); //not a power of two: no SHAPE
	assert.equal(t.istyped(new (class Int128Array {})()), 3); //a kind that does not exist yet has the shape
	assert.equal(t.istyped(new (class Uint8ClampedArray {})()), 3);
	assert.equal(t.istyped(new (class Uint4Array {})()), 1); //sub-byte widths are not typed arrays
	assert.equal(t.istyped(new (class Uint8Clampedarray {})()), 0); //'Clampedarray' does not end in Array
	assert.equal(t.istyped(new Uint8Array(1).subarray(0)), 63);
	assert.equal(t.istyped(new Uint8Array(1).buffer), 0);
});
test('isbuf / isview', () => {
	assert.equal(t.isbuf(new ArrayBuffer(1)), 63);
	assert.equal(t.isbuf(new SharedArrayBuffer(1)), 127);
	assert.equal(t.isbuf(F.ab), 15);
	assert.equal(t.isbuf(new Uint8Array(1)), 0); //a view has byteLength and slice, but DUCK excludes views
	assert.equal(t.isbuf({ byteLength: 1, slice() {} }), t.isbuf.DUCK);
	assert.equal(t.isbuf({ [Symbol.toStringTag]: 'ArrayBuffer' }), t.isbuf.TAG);
	assert.equal(t.isview(new DataView(new ArrayBuffer(1))), 63);
	assert.equal(t.isview(F.dv), 15);
	assert.equal(t.isview(new Uint8Array(1)), 0);
	assert.equal(t.isview({ getUint8() {}, byteLength: 0 }), t.isview.DUCK);
	assert.equal(U.isDataView(F.dv), true);
});
test('ismap / isset / isweakmap / isweakset', () => {
	assert.equal(t.ismap(new Map()), 63);
	assert.equal(t.isset(new Set()), 63);
	assert.equal(t.isweakmap(new WeakMap()), 63);
	assert.equal(t.isweakset(new WeakSet()), 63);
	assert.equal(t.ismap(F.map), 15);
	assert.equal(t.isset(F.set), 15);
	assert.equal(t.isweakmap(F.wm), 15);
	assert.equal(t.ismap(new Set()), 0);
	assert.equal(t.isset(new Map()), 0);
	assert.equal(t.isweakmap(new Map()), t.isweakmap.DUCK); //a Map can be used as a WeakMap: get, set, has, delete
	assert.equal(t.ismap(new WeakMap()), 0); //a WeakMap lacks size
	assert.equal(t.ismap(new (class MyMap extends Map {})()), 30);
	assert.equal(U.isMap(F.map), true);
});

//=== §2 values with a slot ===
test('isprom', () => {
	assert.equal(t.isprom(Promise.resolve()), 63);
	assert.equal(t.isprom(new Promise(() => {})), 63);
	assert.equal(t.isprom(F.p), 15);
	assert.equal(t.isprom({ then() {} }), 4);
	assert.equal(t.isprom({ then: 1 }), 0);
	assert.equal(t.isprom(new (class MyPromise extends Promise {})(() => {})), 30);
	assert.equal(t.isprom(async () => {}), 0); //an async function is not a promise
	assert.equal(U.isPromise(F.p), true);
});
test('isdate / isregex', () => {
	assert.equal(t.isdate(new Date()), 61);
	assert.equal(t.isdate(new Date(NaN)), 61); //an invalid date is still a Date
	assert.equal(t.isdate(F.d), 13);
	assert.equal(t.isdate(Date.now()), 0);
	assert.equal(t.isdate({ [Symbol.toStringTag]: 'Date' }), 2);
	assert.equal(t.isregex(/x/g), 61);
	assert.equal(t.isregex(new RegExp('x')), 61);
	assert.equal(t.isregex(F.re), 13);
	assert.equal(t.isregex(RegExp.prototype), t.isregex.NAME | t.isregex.DUCK | t.isregex.OWN); //the methods and the constructor, but no [[OriginalSource]]: not a regexp
	assert.equal(t.isregex('x'), 0);
	assert.equal(t.isregex({ exec() {}, test() {} }), 4);
	assert.equal(U.isRegExp(F.re), true);
});
test('iserr / terr', () => {
	assert.equal(t.iserr(new Error('x')), 61);
	assert.equal(t.iserr(new TypeError('x')), 61);
	assert.equal(t.iserr(new AggregateError([], 'x')), 61);
	assert.equal(t.iserr(F.err), 13);
	class ValidationError extends Error {}
	class Oops extends Error {} //a subclass whose name does not end with Error
	assert.equal(t.iserr(new ValidationError('x')), 29);
	assert.equal(t.iserr(new Oops('x')), 28);
	assert.equal(t.iserr({ message: 'x', name: 'Error' }), 4);
	assert.equal(t.iserr({ message: 'x' }), 0);
	assert.equal(t.iserr(Object.create(Error.prototype)), t.iserr.NAME | t.iserr.DUCK | t.iserr.PROTO | t.iserr.OWN); //a chain costume: instanceof and constructor say Error, the [[ErrorData]] slot says no
	assert.equal(t.terr(new RangeError('x')), 'RangeError');
	assert.equal(t.terr(new ValidationError()), 'ValidationError');
	assert.equal(t.terr(F.err), 'RangeError');
	assert.equal(t.terr({ message: 'x', name: 'Error' }), 'Object'); //DUCK saw it; the name is what it is
	assert.equal(t.terr({}), undefined);
	assert.equal(t.terr(null), undefined);
	assert.equal(U.isNativeError(F.err), true);
});
test('isargs', () => {
	const args = (function () { return arguments; })();
	assert.equal(t.isargs(args), t.isargs.SLOT);
	assert.equal(t.isargs((function () { 'use strict'; return arguments; })()), t.isargs.SLOT);
	assert.equal(t.isargs({ [Symbol.toStringTag]: 'Arguments' }), t.isargs.TAG);
	assert.equal(t.isargs([]), 0);
	assert.equal(t.isargs({ length: 0 }), 0);
});
test('isbox / tbox', () => {
	assert.equal(t.isbox(Object(1)), 29); //Number has no tag property
	assert.equal(t.isbox(new String('x')), 29);
	assert.equal(t.isbox(new Boolean(false)), 29);
	assert.equal(t.isbox(Object(1n)), 31); //BigInt.prototype has a tag property
	assert.equal(t.isbox(Object(Symbol())), 31); //so does Symbol.prototype
	assert.equal(t.isbox(F.box), 5);
	for (const v of [1, 'x', true, 1n, Symbol(), null, undefined, {}, []]) assert.equal(t.isbox(v), 0, String(v));
	assert.equal(t.isbox({ [Symbol.toStringTag]: 'Number' }), 2);
	assert.equal(t.isbox(Object.create(Number.prototype)), t.isbox.NAME | t.isbox.PROTO | t.isbox.OWN); //a chain costume: no [[NumberData]]
	assert.equal(t.tbox(Object(1)), 'number');
	assert.equal(t.tbox(Object('x')), 'string');
	assert.equal(t.tbox(Object(true)), 'boolean');
	assert.equal(t.tbox(Object(1n)), 'bigint');
	assert.equal(t.tbox(Object(Symbol())), 'symbol');
	assert.equal(t.tbox(F.box), 'number');
	assert.equal(t.tbox(1), undefined);
	assert.equal(t.tbox({}), undefined);
	assert.equal(U.isBoxedPrimitive(F.box), true);
});
test('isplain', () => {
	assert.equal(t.isplain({}), 11);
	assert.equal(t.isplain({ a: [1] }), 11);
	assert.equal(t.isplain(JSON.parse('{"a":1}')), 11);
	assert.equal(t.isplain(new Object()), 11);
	assert.equal(t.isplain(Object.create(null)), 4);
	assert.equal(t.isplain(F.obj), 3);
	assert.equal(t.isplain(Object.create(Object.create(null))), 0);
	assert.equal(t.isplain(new (class Point {})()), 0);
	assert.equal(t.isplain([]), 0);
	assert.equal(t.isplain(new Map()), 0);
	assert.equal(t.isplain(() => {}), 0);
	assert.equal(t.isplain(null), 0);
	assert.equal(t.isplain(1), 0);
	assert.equal(t.isplain(Math), 11); //a namespace object is plain by every witness: isplain does not consult the tag
});

//=== §3 functions ===
test('isasync / isgenfn / isagenfn', () => {
	assert.equal(t.isasync(async () => {}), 15);
	assert.equal(t.isasync(async function () {}), 15);
	assert.equal(t.isasync({ async m() {} }.m), 15);
	assert.equal(t.isasync(F.afn), 7); //no local prototype
	assert.equal(t.isasync(async function* () {}), 0); //an async generator is its own kind
	assert.equal(t.isasync(() => {}), 0);
	assert.equal(t.isasync(function asyncName() {}), 0); //'async' followed by a letter is a name
	assert.equal(t.isasync(function () { return Promise.resolve(); }), 0); //returning a promise is not being async
	assert.equal(t.isgenfn(function* () {}), 15);
	assert.equal(t.isgenfn(function *spaced() {}), 15);
	assert.equal(t.isgenfn({ *g() {} }.g), 15);
	assert.equal(t.isgenfn(F.gen), 7);
	assert.equal(t.isgenfn(async function* () {}), 0);
	assert.equal(t.isagenfn(async function* () {}), 15);
	assert.equal(t.isagenfn({ async *g() {} }.g), 15);
	assert.equal(t.isagenfn(F.agen), 7);
	assert.equal(t.isagenfn(function* () {}), 0);
	assert.equal(U.isAsyncFunction(F.afn), true);
	assert.equal(U.isGeneratorFunction(F.gen), true);
});
test('isclass / isarrow / isbound / isnative', () => {
	assert.equal(t.isclass(class {}), 3);
	assert.equal(t.isclass(class A extends Array {}), 3);
	assert.equal(t.isclass(F.cls), 3);
	assert.equal(t.isclass(Map), t.isclass.FIXED); //a native constructor: non-writable prototype, no class keyword to show
	assert.equal(t.isclass(function f() {}), 0);
	assert.equal(t.isclass(() => {}), 0);
	assert.equal(t.isclass(function* () {}), 0); //a generator function's prototype is writable and it is not a constructor
	assert.equal(t.isarrow(() => {}), 3);
	assert.equal(t.isarrow((x) => x), 3);
	assert.equal(t.isarrow(async (a, b = (1)) => a), 3); //parentheses in a default are counted
	assert.equal(t.isarrow(F.arrow), 3);
	assert.equal(t.isarrow(function () {}), 0);
	assert.equal(t.isarrow({ m() {} }.m), t.isarrow.NOCTOR); //a method is not a constructor either: the weak bit, not the strong one
	assert.equal(t.isarrow(async function () {}), t.isarrow.NOCTOR);
	assert.equal(t.isarrow(class {}), 0);
	assert.equal(t.isarrow(Math.max), t.isarrow.NOCTOR);
	const bound = function b() {}.bind(null);
	assert.equal(t.isbound(bound), 3);
	assert.equal(t.isbound((() => {}).bind(null)), 3);
	assert.equal(t.isbound(Math.max), t.isbound.SRC); //prints like one, is not named like one
	assert.equal(t.isbound(function () {}), 0);
	assert.equal(t.isbound(Object.defineProperty(function () {}, 'name', { value: 'bound x' })), t.isbound.NAME); //renamed, not bound
	assert.equal(t.isnative(Math.max), 1);
	assert.equal(t.isnative(Map), 1);
	assert.equal(t.isnative(bound), 0);
	assert.equal(t.isnative(function () {}), 0);
	assert.equal(t.isnative(new Proxy(function () {}, {})), 1); //the spec prints a Proxy as native; documented
});
test('tfn', () => {
	const f = t.tfn;
	assert.equal(f(function () {}), f.CTOR);
	assert.equal(f(() => {}), f.ARROW);
	assert.equal(f(async () => {}), f.ASYNC | f.ARROW);
	assert.equal(f(async function () {}), f.ASYNC);
	assert.equal(f(function* () {}), f.GEN);
	assert.equal(f(async function* () {}), f.ASYNC | f.GEN);
	assert.equal(f(class {}), f.CLASS | f.CTOR);
	assert.equal(f({ m() {} }.m), f.METHOD);
	assert.equal(f({ async m() {} }.m), f.ASYNC | f.METHOD);
	assert.equal(f({ *g() {} }.g), f.GEN | f.METHOD);
	assert.equal(f({ async *g() {} }.g), f.ASYNC | f.GEN | f.METHOD);
	assert.equal(f(Object.getOwnPropertyDescriptor({ get x() { return 1; } }, 'x').get), f.METHOD);
	assert.equal(f(function b() {}.bind(null)), f.BOUND | f.CTOR);
	assert.equal(f((() => {}).bind(null)), f.BOUND);
	assert.equal(f(Math.max), f.NATIVE);
	assert.equal(f(Map), f.NATIVE | f.CTOR);
	assert.equal(f(F.cls), f.CLASS | f.CTOR);
	assert.equal(f(F.afn), f.ASYNC | f.ARROW);
	assert.equal(f(5), 0);
	assert.equal(f(null), 0);
});

//=== §4 iteration ===
test('isiter / isaiter / isgen / isagen / isiterable', () => {
	for (const it of [[].values(), new Map().keys(), new Set().entries(), 'x'[Symbol.iterator](), ...(ITER ? [[1].values().map((x) => x)] : []), (function* () {})(), /x/g[Symbol.matchAll]('x')]) assert.equal(t.isiter(it), 15);
	assert.equal(t.isiter(F.it), 7); //no local %IteratorPrototype%
	assert.equal(t.isiter(F.genobj), 7);
	assert.equal(t.isiter({ next() {} }), t.isiter.DUCK);
	assert.equal(t.isiter({ next() {}, [Symbol.iterator]() { return this; } }), t.isiter.DUCK | t.isiter.SELF);
	assert.equal(t.isiter(new Map()), 0); //iterable, not an iterator
	assert.equal(t.isiter([]), 0);
	assert.equal(t.isiter({ [Symbol.toStringTag]: 'Array Iterator' }), t.isiter.TAG);
	if (ITER) assert.equal(t.isiter(Object.create(Iterator.prototype)), t.isiter.PROTO | t.isiter.TAG); //Iterator.prototype's tag accessor answers 'Iterator'
	const ag = (async function* () {})();
	assert.equal(t.isaiter(ag), 15);
	assert.equal(t.isaiter({ next() {}, [Symbol.asyncIterator]() { return this; } }), 3);
	assert.equal(t.isaiter([].values()), t.isaiter.DUCK); //a sync iterator has next, not the async protocol
	assert.equal(t.isgen((function* () {})()), 7);
	assert.equal(t.isgen(F.genobj), 3);
	assert.equal(t.isgen([].values()), 0); //an array iterator has next but no return/throw...
	assert.equal(t.isgen({ next() {}, return() {}, throw() {} }), t.isgen.DUCK);
	assert.equal(t.isagen(ag), 7);
	assert.equal(t.isagen((function* () {})()), t.isagen.DUCK); //a sync generator has next, return and throw too: the duck bit, nothing more
	assert.equal(t.isiterable([]), 1);
	assert.equal(t.isiterable('x'), 1);
	assert.equal(t.isiterable(new Map()), 1);
	assert.equal(t.isiterable(ag), 2);
	assert.equal(t.isiterable({ [Symbol.iterator]() {}, [Symbol.asyncIterator]() {} }), 3);
	assert.equal(t.isiterable({}), 0);
	assert.equal(t.isiterable(null), 0);
	assert.equal(t.isiterable(1), 0);
	assert.equal(U.isGeneratorObject(F.genobj), true);
});

//=== §5 accessors ===
test('tname / ttag', () => {
	assert.equal(t.tname([]), 'Array');
	assert.equal(t.tname(new Map()), 'Map');
	assert.equal(t.tname(F.map), 'Map');
	assert.equal(t.tname(new (class Point {})()), 'Point');
	assert.equal(t.tname(Object.create(null)), undefined);
	assert.equal(t.tname(null), undefined);
	assert.equal(t.tname(1), undefined); //a primitive is not asked to autobox
	assert.equal(t.tname({ constructor: 5 }), undefined);
	assert.equal(t.tname({ constructor: { name: 7 } }), undefined);
	assert.equal(t.ttag(new Map()), 'Map');
	assert.equal(t.ttag(new Uint8Array()), 'Uint8Array');
	assert.equal(t.ttag(Buffer.alloc(0)), 'Uint8Array'); //the slot, not the name
	assert.equal(t.ttag([]), undefined); //no property: Array's tag is builtin
	assert.equal(t.ttag(new Date()), undefined);
	assert.equal(t.ttag({ [Symbol.toStringTag]: 'X' }), 'X');
	assert.equal(t.ttag(Math), 'Math');
	assert.equal(t.ttag(1), undefined);
});
test('telem: the packed element type', () => {
	const e = t.telem;
	const unpack = (x) => ({ bits: x & 0xff, kind: (x >> 8) & 0xf, clamped: (x & e.CLAMPED) !== 0 });
	assert.deepEqual(unpack(e(new Uint8Array(1))), { bits: 8, kind: e.UINT, clamped: false });
	assert.deepEqual(unpack(e(new Uint8ClampedArray(1))), { bits: 8, kind: e.UINT, clamped: true });
	assert.deepEqual(unpack(e(new Int16Array(1))), { bits: 16, kind: e.INT, clamped: false });
	assert.deepEqual(unpack(e(new Float32Array(1))), { bits: 32, kind: e.FLOAT, clamped: false });
	assert.deepEqual(unpack(e(new Float64Array(1))), { bits: 64, kind: e.FLOAT, clamped: false });
	if (F16) assert.deepEqual(unpack(e(new Float16Array(1))), { bits: 16, kind: e.FLOAT, clamped: false });
	assert.deepEqual(unpack(e(new BigInt64Array(1))), { bits: 64, kind: e.BIGINT, clamped: false });
	assert.deepEqual(unpack(e(new BigUint64Array(1))), { bits: 64, kind: e.BIGUINT, clamped: false });
	assert.equal(e(new Uint8ClampedArray(1)), 0x1208);
	if (F16) assert.equal(e(new Float16Array(1)), 0x310);
	assert.equal(e(Buffer.alloc(1)), e(new Uint8Array(1))); //from the slot: a Buffer is Uint8
	assert.equal(e(new (class PixelArray extends Uint8ClampedArray {})(1)), 0x1208); //from the slot: the subclass name says nothing
	assert.equal(e(F.u8), 0x208);
	if (F16) assert.equal(e(F.f16), 0x310);
	assert.equal(e(new (class Float32Array {})()), 0x320); //from the name: a claim (istyped says 3)
	assert.equal(e({ [Symbol.toStringTag]: 'Int32Array' }), 0x120); //from the tag: a claim (istyped says 4)
	assert.equal(e(new (class Int128Array {})()), 0x180); //the shape of a kind that may come
	assert.equal(e([1]), 0);
	assert.equal(e(new DataView(new ArrayBuffer(1))), 0);
	assert.equal(e(1), 0);
	//BYTES_PER_ELEMENT follows from the width, for every real kind
	for (const C of TYPED) {
		assert.equal((e(new C(1)) & 0xff) / 8, C.BYTES_PER_ELEMENT, C.name);
	}
});

test('the async keyword in source text: minified arrows and methods, and async as a plain name', () => {
	//built from exact source strings, so a formatter cannot add the space the bug needed
	const fn = (src) => vm.runInNewContext(`(${src})`);
	const A = t.isasync.SRC, R = t.isarrow.SRC, G = t.isagenfn.SRC;
	for (const src of ['async()=>{}', 'async(a,b)=>a', 'async x=>x', 'async (x) => x', 'async function f(){}', '({async m(){}}).m'])
		assert.equal(t.isasync(fn(src)) & A, A, src);
	for (const src of ['({async(){}}).async', 'async=>1', 'async => 1', '({asyncThing(){}}).asyncThing', '(async)=>1', 'function async(){}'])
		assert.equal(t.isasync(fn(src)) & A, 0, src);
	for (const src of ['async()=>{}', 'async x=>x', 'async=>1', '(async)=>1']) assert.equal(t.isarrow(fn(src)) & R, R, src);
	assert.equal(t.isarrow(fn('({async(){}}).async')) & R, 0);
	assert.equal(t.isagenfn(fn('({async*m(){}}).m')) & G, G);
	assert.equal(t.isasync(fn('({async*m(){}}).m')) & A, 0); //an async generator, not an async function
});
