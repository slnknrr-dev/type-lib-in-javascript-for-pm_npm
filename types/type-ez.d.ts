// Type declarations for type-ez. Hand-authored, like the engine's: the runtime is untyped ESM,
// and every function here is one call into @slnknrr/type-im with the bits collapsed to a
// boolean by the strongest witness, or a packed number unpacked into an object. Kept in
// lockstep with src/type-ez.js. The engine's own types are re-exported for convenience.

import type { BoxKind, ElemBits, FnBits } from '@slnknrr/type-im';

export type { BoxKind, ElemBits, FnBits };

/** Any typed array constructor, or its name. */
export type TypedArrayKindRef = string | (new (...args: any[]) => ArrayBufferView);

/** The element type of a typed array, unpacked from {@link https://www.npmjs.com/package/@slnknrr/type-im type-im}'s `telem`. */
export interface TypedArrayKind {
	kind: 'int' | 'uint' | 'float' | 'bigint' | 'biguint';
	/** Width in bits: 8, 16, 32, 64. */
	bits: number;
	clamped: boolean;
	bytesPerElement: number;
}

/** The kind of a function, unpacked from `tfn`. */
export interface FunctionKind {
	async: boolean;
	generator: boolean;
	class: boolean;
	arrow: boolean;
	/** A concise method or an accessor: no `function` keyword, no arrow. */
	method: boolean;
	bound: boolean;
	native: boolean;
	/** Has `[[Construct]]`. */
	constructible: boolean;
}

/** What {@link kindOf} can answer. */
export type Kind =
	| 'null' | 'undefined' | 'boolean' | 'number' | 'bigint' | 'string' | 'symbol'
	| 'function' | 'class' | 'generatorfunction' | 'asyncfunction' | 'asyncgeneratorfunction'
	| 'array' | 'typedarray' | 'arraybuffer' | 'dataview' | 'map' | 'set' | 'weakmap' | 'weakset'
	| 'promise' | 'date' | 'regexp' | 'error' | 'arguments' | 'boxed'
	| 'generator' | 'asyncgenerator' | 'iterator' | 'plain' | 'object';

// -- 1. containers: the brand decides --

/** An Array from any realm, subclasses included. */
export function isArray(v: unknown): v is unknown[];
/** A typed array of any kind, from any realm; a Buffer and a subclass are typed arrays. */
export function isTypedArray(v: unknown): v is ArrayBufferView;
/** A typed array of one kind, by the internal slot's name: `isTypedArrayOf(buffer, Uint8Array)`. */
export function isTypedArrayOf(v: unknown, kind: TypedArrayKindRef): boolean;
/** An ArrayBuffer, not a SharedArrayBuffer. */
export function isArrayBuffer(v: unknown): v is ArrayBuffer;
export function isSharedArrayBuffer(v: unknown): v is SharedArrayBuffer;
export function isAnyArrayBuffer(v: unknown): v is ArrayBufferLike;
export function isDataView(v: unknown): v is DataView;
export function isMap(v: unknown): v is Map<unknown, unknown>;
export function isSet(v: unknown): v is Set<unknown>;
export function isWeakMap(v: unknown): v is WeakMap<WeakKey, unknown>;
export function isWeakSet(v: unknown): v is WeakSet<WeakKey>;

// -- 2. values with a slot --

/** A genuine Promise: the host's brand where there is one, else the tag and this realm's chain. */
export function isPromise(v: unknown): v is Promise<unknown>;
/** Anything with a callable `then` — what `await` accepts. */
export function isThenable(v: unknown): v is PromiseLike<unknown>;
export function isDate(v: unknown): v is Date;
export function isRegExp(v: unknown): v is RegExp;
/** An Error with `[[ErrorData]]`: every native error and every subclass, from any realm. */
export function isError(v: unknown): v is Error;
export function isArguments(v: unknown): v is IArguments;
/** A wrapper object such as `new Number(1)`; never a primitive. */
export function isBoxedPrimitive(v: unknown): v is Number | String | Boolean | Symbol | BigInt;
/** An object literal, `Object.create(null)`, a parsed JSON object — from any realm, and not tagged. */
export function isPlainObject(v: unknown): v is Record<PropertyKey, unknown>;

// -- 3. functions: the intrinsic source text decides --

export function isAsyncFunction(v: unknown): v is (...args: any[]) => Promise<unknown>;
export function isGeneratorFunction(v: unknown): v is GeneratorFunction;
export function isAsyncGeneratorFunction(v: unknown): v is AsyncGeneratorFunction;
/** Class syntax. A native constructor is not a class: see {@link isConstructor}. */
export function isClass(v: unknown): v is abstract new (...args: any[]) => unknown;
export function isArrowFunction(v: unknown): v is (...args: any[]) => unknown;
export function isBoundFunction(v: unknown): v is (...args: any[]) => unknown;
export function isNativeFunction(v: unknown): v is (...args: any[]) => unknown;
/** Has `[[Construct]]`: classes, ordinary functions, native and bound constructors. */
export function isConstructor(v: unknown): v is new (...args: any[]) => unknown;

// -- 4. iteration --

/** Anything with a callable `next` — the protocol itself. */
export function isIterator(v: unknown): v is Iterator<unknown>;
export function isAsyncIterator(v: unknown): v is AsyncIterator<unknown>;
/** A generator object, from any realm. */
export function isGenerator(v: unknown): v is Generator<unknown>;
export function isAsyncGenerator(v: unknown): v is AsyncGenerator<unknown>;
/** A callable `Symbol.iterator` — strings included. */
export function isIterable(v: unknown): v is Iterable<unknown>;
export function isAsyncIterable(v: unknown): v is AsyncIterable<unknown>;

// -- 5. kinds --

/** `constructor.name`, or `undefined`. Never throws, never autoboxes a primitive. */
export function constructorName(v: unknown): string | undefined;
/** `Symbol.toStringTag`, or `undefined`. */
export function toStringTag(v: unknown): string | undefined;
/** The element type of a typed array, or `undefined`. From the internal slot when there is one. */
export function typedArrayKind(v: unknown): TypedArrayKind | undefined;
/** The error's constructor name, or `undefined`. */
export function errorName(v: unknown): string | undefined;
/** The primitive inside a wrapper object, or `undefined`. */
export function boxedType(v: unknown): BoxKind | undefined;
/** The kind of a function, or `undefined` for a non-function. */
export function functionKind(v: unknown): FunctionKind | undefined;

// -- 6. everyday questions --

/** Not an object and not a function. */
export function isPrimitive(v: unknown): v is null | undefined | boolean | number | bigint | string | symbol;
/** One name for what a value is. */
export function kindOf(v: unknown): Kind;

/** Every function above, on one frozen object. */
export interface TypeEz {
	readonly isArray: typeof isArray;
	readonly isTypedArray: typeof isTypedArray;
	readonly isTypedArrayOf: typeof isTypedArrayOf;
	readonly isArrayBuffer: typeof isArrayBuffer;
	readonly isSharedArrayBuffer: typeof isSharedArrayBuffer;
	readonly isAnyArrayBuffer: typeof isAnyArrayBuffer;
	readonly isDataView: typeof isDataView;
	readonly isMap: typeof isMap;
	readonly isSet: typeof isSet;
	readonly isWeakMap: typeof isWeakMap;
	readonly isWeakSet: typeof isWeakSet;
	readonly isPromise: typeof isPromise;
	readonly isThenable: typeof isThenable;
	readonly isDate: typeof isDate;
	readonly isRegExp: typeof isRegExp;
	readonly isError: typeof isError;
	readonly isArguments: typeof isArguments;
	readonly isBoxedPrimitive: typeof isBoxedPrimitive;
	readonly isPlainObject: typeof isPlainObject;
	readonly isAsyncFunction: typeof isAsyncFunction;
	readonly isGeneratorFunction: typeof isGeneratorFunction;
	readonly isAsyncGeneratorFunction: typeof isAsyncGeneratorFunction;
	readonly isClass: typeof isClass;
	readonly isArrowFunction: typeof isArrowFunction;
	readonly isBoundFunction: typeof isBoundFunction;
	readonly isNativeFunction: typeof isNativeFunction;
	readonly isConstructor: typeof isConstructor;
	readonly isIterator: typeof isIterator;
	readonly isAsyncIterator: typeof isAsyncIterator;
	readonly isGenerator: typeof isGenerator;
	readonly isAsyncGenerator: typeof isAsyncGenerator;
	readonly isIterable: typeof isIterable;
	readonly isAsyncIterable: typeof isAsyncIterable;
	readonly constructorName: typeof constructorName;
	readonly toStringTag: typeof toStringTag;
	readonly typedArrayKind: typeof typedArrayKind;
	readonly errorName: typeof errorName;
	readonly boxedType: typeof boxedType;
	readonly functionKind: typeof functionKind;
	readonly isPrimitive: typeof isPrimitive;
	readonly kindOf: typeof kindOf;
}

declare const ez: TypeEz;
export default ez;
