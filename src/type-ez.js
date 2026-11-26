//=== CONVENTIONS ===
//
//1. WHAT THIS IS. type-ez is the friendly face of type-im: the same witnesses, no logic of its
//   own. Every function here is one call into the type-im singleton plus a translation of the
//   bits into what a JavaScript programmer expects from a type-check library: a boolean under a
//   familiar name, an object where the engine packs a number. This file IS the boundary.
//
//2. WHAT CHANGES AT THE BOUNDARY.
//   - a boolean, decided by the STRONGEST witness the kind has. Where the platform has an
//     internal slot, that is the brand and nothing else counts: a costume is false, a duck is
//     false, a subclass is true, a value from another realm is true. Where there is no slot —
//     the function kinds — the intrinsic source text decides; for iterators and generators the
//     protocol together with the tag.
//   - isPromise: the engine's brand is the host's (Node, Deno, Bun), and pure JavaScript has
//     none without a side effect. So type-ez checks ONCE, at load, whether the host has one and
//     falls back to tag + this realm's chain where it has not — what `instanceof Promise` gives.
//   - packed numbers become objects: typedArrayKind is { kind, bits, clamped, bytesPerElement },
//     functionKind is { async, generator, class, arrow, method, bound, native, constructible }.
//   - undefined stays undefined where the engine has nothing to say (constructorName of a
//     null-prototype object, errorName of a non-error).
//
//3. NO STATE, NO CONFIGURATION. Everything goes through the default type-im instance. A
//   configured engine (_typeim(overrides)) is a type-im concern: import type-im directly.
//
//4. COMPOSITIONS. Functions marked "composition" are built from type-im methods only. kindOf
//   asks the predicates in a fixed order and names the first that answers with its strongest
//   witness; primitives are named by typeof, which is honest about them.
//
//5. NOTHING THROWS. The engine never does, so neither does anything here.

import t from '@slnknrr/type-im';

//the strongest witness of each predicate, as a mask: the brand where a slot exists
const B = {
	arr: t.isarr.BRAND, typed: t.istyped.BRAND, buf: t.isbuf.BRAND, view: t.isview.BRAND,
	map: t.ismap.BRAND, set: t.isset.BRAND, weakmap: t.isweakmap.BRAND, weakset: t.isweakset.BRAND,
	date: t.isdate.BRAND, regex: t.isregex.BRAND, err: t.iserr.BRAND, args: t.isargs.SLOT, box: t.isbox.BRAND,
};
//does this host expose a [[PromiseState]] check? Decided once: the engine lights BRAND on a
//genuine promise exactly when it has one.
const PROMISE_BRAND = (t.isprom(Promise.resolve()) & t.isprom.BRAND) !== 0;
const KIND_NAME = { [t.telem.INT]: 'int', [t.telem.UINT]: 'uint', [t.telem.FLOAT]: 'float', [t.telem.BIGINT]: 'bigint', [t.telem.BIGUINT]: 'biguint' };


//=========================================================================
//=== 1. CONTAINERS — the brand decides
//=========================================================================

//an Array, from any realm; a subclass too. Array.isArray, in other words — kept for symmetry.
export function isArray(v) { return (t.isarr(v) & B.arr) !== 0; }
//a typed array of any kind, from any realm; a Buffer and a subclass are typed arrays
export function isTypedArray(v) { return (t.istyped(v) & B.typed) !== 0; }
//composition: a typed array of one kind. `kind` — a constructor (Uint8Array) or its name
//('Uint8Array'); the comparison is by the internal slot's name, so a Buffer is a Uint8Array and
//a Float16Array from another realm is a Float16Array.
export function isTypedArrayOf(v, kind) {
	if ((t.istyped(v) & B.typed) === 0) return false;
	const name = typeof kind === 'function' ? kind.name : kind;
	return typeof name === 'string' && t.ttag(v) === name;
}
//an ArrayBuffer, not a SharedArrayBuffer
export function isArrayBuffer(v) { const x = t.isbuf(v); return (x & B.buf) !== 0 && (x & t.isbuf.SHARED) === 0; }
//a SharedArrayBuffer
export function isSharedArrayBuffer(v) { const x = t.isbuf(v); return (x & (B.buf | t.isbuf.SHARED)) === (B.buf | t.isbuf.SHARED); }
//composition: either
export function isAnyArrayBuffer(v) { return (t.isbuf(v) & B.buf) !== 0; }
export function isDataView(v) { return (t.isview(v) & B.view) !== 0; }
export function isMap(v) { return (t.ismap(v) & B.map) !== 0; }
export function isSet(v) { return (t.isset(v) & B.set) !== 0; }
export function isWeakMap(v) { return (t.isweakmap(v) & B.weakmap) !== 0; }
export function isWeakSet(v) { return (t.isweakset(v) & B.weakset) !== 0; }


//=========================================================================
//=== 2. VALUES WITH A SLOT
//=========================================================================

//a genuine Promise: the host's brand where there is one, else the tag and this realm's chain
export function isPromise(v) {
	const x = t.isprom(v);
	return PROMISE_BRAND ? (x & t.isprom.BRAND) !== 0 : (x & (t.isprom.TAG | t.isprom.PROTO)) === (t.isprom.TAG | t.isprom.PROTO);
}
//composition: anything with a callable then — what `await` accepts. A Promise is a thenable too.
export function isThenable(v) { return (t.isprom(v) & t.isprom.DUCK) !== 0; }
export function isDate(v) { return (t.isdate(v) & B.date) !== 0; }
export function isRegExp(v) { return (t.isregex(v) & B.regex) !== 0; }
//an Error with [[ErrorData]]: every native error and every subclass, from any realm
export function isError(v) { return (t.iserr(v) & B.err) !== 0; }
export function isArguments(v) { return (t.isargs(v) & B.args) !== 0; }
//a wrapper object: new Number(1), Object('x'); never a primitive
export function isBoxedPrimitive(v) { return (t.isbox(v) & B.box) !== 0; }
//a plain object: an object literal or Object.create(null), from any realm, and not tagged —
//Math and an object with a toStringTag are not plain, as lodash agrees
export function isPlainObject(v) {
	return (t.isplain(v) & (t.isplain.NULL | t.isplain.LOCAL | t.isplain.SHAPE)) !== 0 && t.ttag(v) === undefined;
}


//=========================================================================
//=== 3. FUNCTIONS — the intrinsic source text decides; there is no slot to ask
//=========================================================================

export function isAsyncFunction(v) { return (t.isasync(v) & t.isasync.SRC) !== 0; }
export function isGeneratorFunction(v) { return (t.isgenfn(v) & t.isgenfn.SRC) !== 0; }
export function isAsyncGeneratorFunction(v) { return (t.isagenfn(v) & t.isagenfn.SRC) !== 0; }
//class syntax. A native constructor such as Map is a constructor, not a class: see isConstructor
export function isClass(v) { return (t.isclass(v) & t.isclass.SRC) !== 0; }
export function isArrowFunction(v) { return (t.isarrow(v) & t.isarrow.SRC) !== 0; }
//a bound function: named 'bound …' AND printed as native code — either alone is something else
export function isBoundFunction(v) { return (t.isbound(v) & (t.isbound.NAME | t.isbound.SRC)) === (t.isbound.NAME | t.isbound.SRC); }
export function isNativeFunction(v) { return (t.isnative(v) & t.isnative.SRC) !== 0; }
//composition: has [[Construct]] — `new` would not throw for that reason. Classes, ordinary
//functions, native constructors, bound constructors: true. Arrows, methods, async and
//generator functions, Math.max: false.
export function isConstructor(v) { return (t.tfn(v) & t.tfn.CTOR) !== 0; }


//=========================================================================
//=== 4. ITERATION — the protocol, confirmed by the tag or the chain where one exists
//=========================================================================

//an iterator: anything with a callable next — the protocol itself, user objects included
export function isIterator(v) { return (t.isiter(v) & t.isiter.DUCK) !== 0; }
export function isAsyncIterator(v) { return (t.isaiter(v) & t.isaiter.DUCK) !== 0; }
//a generator object: the protocol and either the tag or this realm's %GeneratorPrototype% —
//a generator from another realm carries the tag
export function isGenerator(v) { const x = t.isgen(v); return (x & t.isgen.DUCK) !== 0 && (x & (t.isgen.TAG | t.isgen.PROTO)) !== 0; }
export function isAsyncGenerator(v) { const x = t.isagen(v); return (x & t.isagen.DUCK) !== 0 && (x & (t.isagen.TAG | t.isagen.PROTO)) !== 0; }
//iterable: a callable Symbol.iterator — strings included
export function isIterable(v) { return (t.isiterable(v) & t.isiterable.SYNC) !== 0; }
export function isAsyncIterable(v) { return (t.isiterable(v) & t.isiterable.ASYNC) !== 0; }


//=========================================================================
//=== 5. KINDS — the engine's accessors, unpacked
//=========================================================================

//constructor.name, or undefined; never throws, never autoboxes a primitive
export function constructorName(v) { return t.tname(v); }
//Symbol.toStringTag, or undefined
export function toStringTag(v) { return t.ttag(v); }
//the element type of a typed array: { kind, bits, clamped, bytesPerElement }, or undefined.
//From the internal slot when there is one (a Buffer answers uint 8), else what the tag or the
//name claims — use isTypedArray to know which.
export function typedArrayKind(v) {
	const e = t.telem(v);
	if (e === 0) return undefined;
	const bits = e & 0xff;
	return { kind: KIND_NAME[(e >> 8) & 0xf], bits, clamped: (e & t.telem.CLAMPED) !== 0, bytesPerElement: bits / 8 };
}
//the error's constructor name for anything that looks like an error, or undefined
export function errorName(v) { return t.terr(v); }
//'number' | 'string' | 'boolean' | 'symbol' | 'bigint' for a wrapper object, or undefined
export function boxedType(v) { return t.tbox(v); }
//the kind of a function as booleans, or undefined for a non-function
export function functionKind(v) {
	if (typeof v !== 'function') return undefined;
	const f = t.tfn(v), F = t.tfn;
	return {
		async: (f & F.ASYNC) !== 0, generator: (f & F.GEN) !== 0, class: (f & F.CLASS) !== 0, arrow: (f & F.ARROW) !== 0,
		method: (f & F.METHOD) !== 0, bound: (f & F.BOUND) !== 0, native: (f & F.NATIVE) !== 0, constructible: (f & F.CTOR) !== 0,
	};
}


//=========================================================================
//=== 6. EVERYDAY QUESTIONS — compositions
//=========================================================================

//not an object and not a function: typeof is honest about these
export function isPrimitive(v) { return v === null || (typeof v !== 'object' && typeof v !== 'function'); }
//one name for what a value is. Primitives by typeof ('null' for null); objects by the first
//predicate whose strongest witness answers, most specific first; 'object' when none does.
export function kindOf(v) {
	if (v === null) return 'null';
	const type = typeof v;
	if (type !== 'object' && type !== 'function') return type;
	if (type === 'function') {
		const f = t.tfn(v), F = t.tfn;
		if (f & F.CLASS) return 'class';
		if (f & F.GEN) return f & F.ASYNC ? 'asyncgeneratorfunction' : 'generatorfunction';
		if (f & F.ASYNC) return 'asyncfunction';
		return 'function';
	}
	if (isArray(v)) return 'array';
	if (isTypedArray(v)) return 'typedarray';
	if (isAnyArrayBuffer(v)) return 'arraybuffer';
	if (isDataView(v)) return 'dataview';
	if (isMap(v)) return 'map';
	if (isSet(v)) return 'set';
	if (isWeakMap(v)) return 'weakmap';
	if (isWeakSet(v)) return 'weakset';
	if (isPromise(v)) return 'promise';
	if (isDate(v)) return 'date';
	if (isRegExp(v)) return 'regexp';
	if (isError(v)) return 'error';
	if (isArguments(v)) return 'arguments';
	if (isBoxedPrimitive(v)) return 'boxed';
	if (isGenerator(v)) return 'generator';
	if (isAsyncGenerator(v)) return 'asyncgenerator';
	if (isIterator(v)) return 'iterator';
	if (isPlainObject(v)) return 'plain';
	return 'object';
}


//=========================================================================
//=== DEFAULT EXPORT — every function above, frozen. `import ez from '@slnknrr/type-ez'`.
//=========================================================================

const ez = Object.freeze({
	//1
	isArray, isTypedArray, isTypedArrayOf, isArrayBuffer, isSharedArrayBuffer, isAnyArrayBuffer, isDataView, isMap, isSet, isWeakMap, isWeakSet,
	//2
	isPromise, isThenable, isDate, isRegExp, isError, isArguments, isBoxedPrimitive, isPlainObject,
	//3
	isAsyncFunction, isGeneratorFunction, isAsyncGeneratorFunction, isClass, isArrowFunction, isBoundFunction, isNativeFunction, isConstructor,
	//4
	isIterator, isAsyncIterator, isGenerator, isAsyncGenerator, isIterable, isAsyncIterable,
	//5
	constructorName, toStringTag, typedArrayKind, errorName, boxedType, functionKind,
	//6
	isPrimitive, kindOf,
});

export default ez;
