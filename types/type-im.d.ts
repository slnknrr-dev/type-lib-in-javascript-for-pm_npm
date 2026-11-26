// Type declarations for type-im. Hand-authored: the runtime is untyped ESM by design (a handful
// of witnesses, each guarded, each reported as a bit), so declarations are maintained here
// rather than emitted from JSDoc. Kept in lockstep with src/type-im.js.
//
// Every predicate returns a number: 0 when no witness said so, otherwise the bits of the
// witnesses that did. The bit constants live on the method itself: `t.ismap(v) & t.ismap.BRAND`.

/** A predicate: a function of any value returning the witness bits, carrying its own constants. */
export type Pred<B> = ((v: unknown) => number) & Readonly<B>;

/** The shape shared by Map, Set, WeakMap, WeakSet, Promise, Date, RegExp, Error, DataView. */
export interface SlotBits { NAME: 1; TAG: 2; DUCK: 4; BRAND: 8; PROTO: 16; OWN: 32 }
export interface ArrBits { NAME: 1; TAG: 2; BRAND: 4; PROTO: 8; OWN: 16 }
export interface TypedBits { SUFFIX: 1; SHAPE: 2; TAG: 4; BRAND: 8; PROTO: 16; OWN: 32 }
export interface BufBits extends SlotBits { SHARED: 64 }
export interface ArgsBits { TAG: 1; SLOT: 2 }
export interface BoxBits { NAME: 1; TAG: 2; BRAND: 4; PROTO: 8; OWN: 16 }
export interface PlainBits { NAME: 1; SHAPE: 2; NULL: 4; LOCAL: 8 }
export interface FnKindBits { NAME: 1; TAG: 2; SRC: 4; PROTO: 8 }
export interface ClassBits { SRC: 1; FIXED: 2 }
export interface ArrowBits { NOCTOR: 1; SRC: 2 }
export interface BoundBits { NAME: 1; SRC: 2 }
export interface NativeBits { SRC: 1 }
export interface IterBits { DUCK: 1; SELF: 2; TAG: 4; PROTO: 8 }
export interface GenBits { DUCK: 1; TAG: 2; PROTO: 4 }
export interface IterableBits { SYNC: 1; ASYNC: 2 }

/** Kind codes and the clamped flag of {@link typeim.telem}. */
export interface ElemBits { INT: 1; UINT: 2; FLOAT: 3; BIGINT: 4; BIGUINT: 5; CLAMPED: 4096 }
/** Flags of {@link typeim.tfn}. */
export interface FnBits { ASYNC: 1; GEN: 2; CLASS: 4; ARROW: 8; METHOD: 16; BOUND: 32; NATIVE: 64; CTOR: 128 }

/** The primitive inside a wrapper object. */
export type BoxKind = 'number' | 'string' | 'boolean' | 'symbol' | 'bigint';

/**
 * The engine. The default export is a ready-to-use singleton instance; this class is exported
 * for subclassing (see {@link _typeim}), `instanceof` checks, and the constants on its prototype.
 */
export declare class typeim {
	// -- 1. containers --
	/** An Array. 1 NAME · 2 TAG (a claim: real arrays have no tag property) · 4 BRAND `Array.isArray` · 8 PROTO · 16 OWN. */
	readonly isarr: Pred<ArrBits>;
	/** A typed array. 1 SUFFIX name ends with `Array` · 2 SHAPE name has a typed array's form · 4 TAG the tag has that form · 8 BRAND the `%TypedArray%` slot getter · 16 PROTO · 32 OWN the constructor of that very kind. */
	readonly istyped: Pred<TypedBits>;
	/** An ArrayBuffer or SharedArrayBuffer. 1 NAME · 2 TAG · 4 DUCK · 8 BRAND a `byteLength` getter accepts it · 16 PROTO · 32 OWN · 64 SHARED. */
	readonly isbuf: Pred<BufBits>;
	/** A DataView. 1 NAME · 2 TAG · 4 DUCK `getUint8` + `byteLength` · 8 BRAND · 16 PROTO · 32 OWN. */
	readonly isview: Pred<SlotBits>;
	/** A Map. DUCK: get, set, has, delete, numeric size. BRAND: `Map.prototype.has.call` does not throw. */
	readonly ismap: Pred<SlotBits>;
	/** A Set. DUCK: add, has, delete, numeric size. */
	readonly isset: Pred<SlotBits>;
	/** A WeakMap. DUCK: get, set, has, delete. */
	readonly isweakmap: Pred<SlotBits>;
	/** A WeakSet. DUCK: add, has, delete. */
	readonly isweakset: Pred<SlotBits>;

	// -- 2. values with a slot --
	/** A Promise. DUCK: a callable `then` (a thenable). BRAND: `Promise.prototype.then.call` with two no-op handlers — the one witness with a side effect. */
	readonly isprom: Pred<SlotBits>;
	/** A Date. DUCK: getTime + toISOString. BRAND: `Date.prototype.getTime.call`. */
	readonly isdate: Pred<SlotBits>;
	/** A RegExp. DUCK: exec + test. BRAND: the `source` getter accepts it. */
	readonly isregex: Pred<SlotBits>;
	/** An Error. 1 NAME ends with `Error` · 2 TAG · 4 DUCK string message and name · 8 BRAND `Error.isError` (or the `[[ErrorData]]` builtin tag) · 16 PROTO · 32 OWN a native error class of this realm. */
	readonly iserr: Pred<SlotBits>;
	/** An arguments object. 1 TAG a claim · 2 SLOT the builtin tag with no tag property in the way. */
	readonly isargs: Pred<ArgsBits>;
	/** A wrapper object (`new Number(1)`, `Object('x')`). 1 NAME · 2 TAG · 4 BRAND a `valueOf` brand · 8 PROTO · 16 OWN. A primitive is 0. */
	readonly isbox: Pred<BoxBits>;
	/** A plain object. 1 NAME `Object` · 2 SHAPE plain by shape, any realm · 4 NULL no prototype · 8 LOCAL this realm's `Object.prototype`. */
	readonly isplain: Pred<PlainBits>;

	// -- 3. functions --
	/** An async function (not an async generator). 1 NAME · 2 TAG · 4 SRC the intrinsic source starts with `async` · 8 PROTO. */
	readonly isasync: Pred<FnKindBits>;
	/** A generator function. 1 NAME · 2 TAG · 4 SRC `function*` or `*name` · 8 PROTO. */
	readonly isgenfn: Pred<FnKindBits>;
	/** An async generator function. */
	readonly isagenfn: Pred<FnKindBits>;
	/** A class. 1 SRC the `class` keyword · 2 FIXED a constructor with a non-writable own `prototype` (classes and native constructors). */
	readonly isclass: Pred<ClassBits>;
	/** An arrow function. 1 NOCTOR no `[[Construct]]` (shared with methods, async and generator functions) · 2 SRC parameters then `=>`. */
	readonly isarrow: Pred<ArrowBits>;
	/** A bound function. 1 NAME starts with `bound ` · 2 SRC native syntax. */
	readonly isbound: Pred<BoundBits>;
	/** A native function. 1 SRC native syntax and not named `bound `. A function Proxy reads the same. */
	readonly isnative: Pred<NativeBits>;

	// -- 4. iteration --
	/** An iterator object. 1 DUCK `next` · 2 SELF `next` and `Symbol.iterator` · 4 TAG a built-in iterator's tag · 8 PROTO `%IteratorPrototype%`. */
	readonly isiter: Pred<IterBits>;
	/** An async iterator object. 1 DUCK · 2 SELF `next` and `Symbol.asyncIterator` · 4 TAG · 8 PROTO `%AsyncIteratorPrototype%`. */
	readonly isaiter: Pred<IterBits>;
	/** A generator object. 1 DUCK next, return, throw · 2 TAG `Generator` · 4 PROTO `%GeneratorPrototype%`. */
	readonly isgen: Pred<GenBits>;
	/** An async generator object. */
	readonly isagen: Pred<GenBits>;
	/** Iterable, on anything (a string is 1). 1 SYNC `Symbol.iterator` · 2 ASYNC `Symbol.asyncIterator`. */
	readonly isiterable: Pred<IterableBits>;

	// -- 5. accessors of kind --
	/** `constructor.name` as a string, or `undefined`. Never throws. */
	tname(v: unknown): string | undefined;
	/** `Symbol.toStringTag` as a string, or `undefined`. Never throws. */
	ttag(v: unknown): string | undefined;
	/** The element type of a typed array, packed: bits 0-7 the width in bits, bits 8-11 the kind, bit 12 clamped. 0 when nothing looks like one. */
	readonly telem: ((v: unknown) => number) & Readonly<ElemBits>;
	/** The error's kind: its constructor's name, for anything {@link iserr} sees; `undefined` otherwise. */
	terr(v: unknown): string | undefined;
	/** The primitive inside a wrapper object, by brand; `undefined` for anything else, primitives included. */
	tbox(v: unknown): BoxKind | undefined;
	/** The kind of a function as flags; 0 for a non-function. */
	readonly tfn: ((v: unknown) => number) & Readonly<FnBits>;
}

/**
 * Build a configured instance. No argument returns the default singleton. With `overrides`
 * (method name → function; `super.method()` reaches the original) returns a frozen instance of
 * a subclass, cached by the `overrides` object; an overriding predicate receives the base
 * predicate's bit constants. Create configurations once and keep them few.
 */
export function _typeim(overrides?: Partial<Record<keyof typeim, (...args: any[]) => any>>): typeim;

/** The ready-to-use singleton. */
declare const t: typeim;
export default t;
