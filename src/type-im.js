//=== LIBRARY-WIDE CONVENTIONS ===
//
//1. PHILOSOPHY. type-im answers "what is this value?" where the language's own answers lie.
//   typeof says 'object' for null and 'function' for a class. instanceof says false for an
//   array from another realm (an iframe, a vm context, a worker's message). Symbol.toStringTag
//   is a public property anyone can set. constructor.name disappears under minification and
//   can be renamed. Duck typing is fooled by construction. Each of these WITNESSES lies in its
//   own way — and each is right most of the time. So a predicate here does not pick one and
//   collapse the answer to a boolean: it asks every witness it has and reports what each said,
//   as bits in one small integer. The caller decides whom to trust, and can see who lied.
//
//2. THE HACK IS THE METHOD. The cheapest witnesses are textual: the constructor's name, the
//   toStringTag, the source text Function.prototype.toString returns. Reading them char by char
//   — never a regex, never a split — costs a handful of comparisons and no allocation, works
//   across realms because a name is a name everywhere, and survives the future: a parser that
//   knows the SHAPE of a typed array's name recognizes Float16Array (ES2025) and whatever comes
//   next without an update. That is not sloppiness; it is a witness with a known failure mode,
//   which is exactly why it is a bit and not the verdict.
//
//3. THE BRAND IS THE TRUTH WHERE ONE EXISTS. Array.isArray, the %TypedArray% toStringTag
//   getter (it reads the internal [[TypedArrayName]] slot), Map.prototype.has.call (throws on
//   anything without [[MapData]]), Date.prototype.getTime.call, Error.isError, the byteLength
//   getters of ArrayBuffer and DataView, the valueOf brands of the wrapper objects,
//   Reflect.construct(String, [], f) for "has [[Construct]]" without ever calling f. These check
//   internal slots: unforgeable, cross-realm. Where the platform has one, it is the top bit.
//   Where it has none (async functions, generators, arrows, native code, iterators), the
//   intrinsic source text or the prototype chain is the strongest witness available, and the
//   README says so. One slot is reachable only with a side effect — [[PromiseState]], which
//   pure JavaScript can test only by registering a reaction — so for Promise the brand is the
//   host's (Node's util.types.isPromise, through process.getBuiltinModule) where the host has
//   one, and 0 where it has not. A witness that cannot be consulted stays silent; it never guesses.
//
//4. EVERY PREDICATE HAS ITS OWN BITS, in increasing strength, documented next to it and
//   exported as constants ON THE METHOD: t.ismap(v) & t.ismap.BRAND. Zero always means "no
//   witness said so", so if (t.ismap(v)) reads as usual. The recurring witnesses keep their
//   names across predicates — NAME (constructor.name), TAG (Symbol.toStringTag), DUCK (the
//   protocol the language itself would use), BRAND (an internal slot), PROTO (in the prototype
//   chain of this realm's constructor), OWN (this realm's constructor exactly) — but their
//   positions and presence follow what each kind can actually witness.
//
//5. REALMS. PROTO and OWN are about THIS realm: a genuine Map from another realm has BRAND but
//   neither, which is precisely the case where instanceof would have lied to you. A subclass
//   has BRAND and PROTO but not OWN. A local, unextended, genuine value has them all.
//
//6. NOTHING THROWS, NOTHING IS MUTATED, NO JOB IS ENQUEUED. A witness that cannot be consulted
//   — a revoked Proxy throws on Array.isArray, a getter may throw, a null-prototype object has
//   no constructor — contributes 0, never an exception. No predicate calls the value, registers
//   a promise reaction, invokes user code on purpose, or coerces anything. The only user code a
//   predicate can reach is a getter on the value itself (constructor, Symbol.toStringTag, then,
//   size), the same one any property read would reach.
//
//7. ACCESSORS OF KIND. The textual witnesses know more than yes/no: which typed array (kind and
//   bit width), which error, which kind of function, which wrapper. telem, terr, tfn and tbox
//   hand that out — as a packed integer where the family's habit is numbers (telem, tfn) and as
//   a string where the answer IS a name (terr, tbox, tname, ttag).
//
//8. THE CLASS IS A VTABLE, AND THE METHODS DETACH. Every internal call goes through
//   this._helper(...), so a method replaced in a configured instance (_typeim(overrides)) is
//   replaced everywhere it is used. The constructor then binds every public method to its
//   instance and puts it on the instance as an own property, constants included: t.ismap is a
//   value you can hand to filter(), store, or destructure, and it still dispatches through its
//   instance. Configurations must be few and long-lived: create them at module load.

//=========================================================================
//=== INTRINSICS OF THIS REALM, captured once. Everything below compares against these, never
//=== against whatever a global name resolves to at call time.
//=========================================================================

const G = globalThis;
const OBJ_TO_STRING = Object.prototype.toString;
const IS_PROTO_OF = Object.prototype.isPrototypeOf;
const FN_SOURCE = Function.prototype.toString;
const getter = (proto, key) => Object.getOwnPropertyDescriptor(proto, key)?.get;

const TYPED = Object.getPrototypeOf(Uint8Array); //%TypedArray%
const TYPED_TAG = getter(TYPED.prototype, Symbol.toStringTag); //reads [[TypedArrayName]]: the brand AND the kind
const AB_LEN = getter(ArrayBuffer.prototype, 'byteLength');
const SAB = typeof G.SharedArrayBuffer === 'function' ? G.SharedArrayBuffer : null;
const SAB_LEN = SAB ? getter(SAB.prototype, 'byteLength') : null;
const DV_LEN = getter(DataView.prototype, 'byteLength');
const RE_SOURCE = getter(RegExp.prototype, 'source');
const MAP_HAS = Map.prototype.has, SET_HAS = Set.prototype.has, WMAP_HAS = WeakMap.prototype.has, WSET_HAS = WeakSet.prototype.has;
const GET_TIME = Date.prototype.getTime;
//the host's internal-slot checks, where the host exposes them (Node, Deno and Bun through
//process.getBuiltinModule; a browser has none). Only the Promise brand needs one: every other
//slot has a pure-JavaScript check without side effects.
const HOST_TYPES = (() => { try { return G.process?.getBuiltinModule?.('node:util')?.types ?? null; } catch { return null; } })();
const host = (name) => HOST_TYPES !== null && typeof HOST_TYPES[name] === 'function' ? HOST_TYPES[name] : null;
const IS_PROMISE = host('isPromise');
const H_MAP = host('isMap'), H_SET = host('isSet'), H_WMAP = host('isWeakMap'), H_WSET = host('isWeakSet');
const H_AB = host('isArrayBuffer'), H_SAB = host('isSharedArrayBuffer'), H_DV = host('isDataView'), H_DATE = host('isDate'), H_RE = host('isRegExp');
const H_BOX = Object.freeze({ number: host('isNumberObject'), string: host('isStringObject'), boolean: host('isBooleanObject'), symbol: host('isSymbolObject'), bigint: host('isBigIntObject') });
const IS_ERROR = typeof Error.isError === 'function' ? Error.isError : null;
const BOX = Object.freeze({ //wrapper brands: thisNumberValue and friends throw on anything else
	number: [Number, Number.prototype.valueOf], string: [String, String.prototype.valueOf], boolean: [Boolean, Boolean.prototype.valueOf],
	symbol: [Symbol, Symbol.prototype.valueOf], bigint: [BigInt, BigInt.prototype.valueOf],
});
const NATIVE_ERRORS = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'AggregateError', 'SuppressedError']
	.map((n) => G[n]).filter((c) => typeof c === 'function'));
const ASYNC_FN_PROTO = Object.getPrototypeOf(async function () {});
const GEN_FN_PROTO = Object.getPrototypeOf(function* () {});
const AGEN_FN_PROTO = Object.getPrototypeOf(async function* () {});
const GEN_PROTO = Object.getPrototypeOf(Object.getPrototypeOf((function* () {})())); //%GeneratorPrototype%
const AGEN_PROTO = Object.getPrototypeOf(Object.getPrototypeOf((async function* () {})())); //%AsyncGeneratorPrototype%
const ITER_PROTO = Object.getPrototypeOf(GEN_PROTO); //%IteratorPrototype% (=== Iterator.prototype where the global exists)
const AITER_PROTO = Object.getPrototypeOf(AGEN_PROTO); //%AsyncIteratorPrototype%

//typed-array element kinds for telem (point 7)
const K_INT = 1, K_UINT = 2, K_FLOAT = 3, K_BIGINT = 4, K_BIGUINT = 5, F_CLAMPED = 0x1000;

class typeim {

	//every public method becomes an own, bound, frozen property carrying its bit constants
	//(point 8), so `const { ismap } = t` and `list.filter(t.isprom)` work and t.ismap.BRAND holds
	constructor() {
		for (const k of PUBLIC) {
			const fn = this[k].bind(this);
			if (BITS[k] !== undefined) Object.assign(fn, BITS[k]);
			Object.defineProperty(this, k, { value: Object.freeze(fn), enumerable: true, writable: false, configurable: false });
		}
	}

	//=========================================================================
	//=== 0. INFRASTRUCTURE: the witnesses. Each returns a plain value and never throws (point 6).
	//=========================================================================

	//--- 0.1 is it even an object? ---

	//an object or a function: the only things the class-like predicates consider
	_obj(v) { return v !== null && (typeof v === 'object' || typeof v === 'function'); }

	//--- 0.2 the textual witnesses (point 2) ---

	//constructor.name as a string, or undefined: a null-prototype object has none, a Proxy may
	//throw, someone may have set constructor to a non-function or name to a non-string.
	_name(v) {
		if (!this._obj(v)) return undefined;
		try {
			const c = v.constructor;
			if (typeof c !== 'function') return undefined;
			const n = c.name;
			return typeof n === 'string' ? n : undefined;
		} catch { return undefined; }
	}
	//Symbol.toStringTag as a PROPERTY (own or inherited), or undefined. For a typed array the
	//property is %TypedArray%'s accessor and returns the internal slot; for Map, Promise,
	//ArrayBuffer it is a data property on the prototype; for Array, Date, RegExp, Error and the
	//wrappers there is none — Object.prototype.toString derives their tag from the slot instead,
	//so a tag property on one of those is always a claim made by someone else.
	_tag(v) {
		if (!this._obj(v)) return undefined;
		try {
			const t = v[Symbol.toStringTag];
			return typeof t === 'string' ? t : undefined;
		} catch { return undefined; }
	}
	//the builtin tag, [object X] -> X, only when no toStringTag property is in the way: that is
	//the internal slot speaking (Array, Arguments, Function, Error, Boolean, Number, String,
	//Date, RegExp). Used where no cheaper brand exists; it allocates one short string.
	_slotTag(v) {
		if (!this._obj(v)) return undefined;
		try {
			if (Symbol.toStringTag in v) return undefined;
			const s = OBJ_TO_STRING.call(v);
			return s.slice(8, -1);
		} catch { return undefined; }
	}
	//the intrinsic source text of a function: what Function.prototype.toString says, not what
	//fn.toString says. Bound functions, native functions and function Proxies all read
	//"function () { [native code] }".
	_src(v) {
		if (typeof v !== 'function') return undefined;
		try { return FN_SOURCE.call(v); } catch { return undefined; }
	}
	//does the function have [[Construct]]? For a function with source text the answer is exact
	//from the syntax that made it: classes and `function` functions are constructors; arrows,
	//methods, accessors, async and generator functions are not. For the rest — natives, bound
	//functions, function Proxies, which all print as native code — Reflect.construct(String, [],
	//f) asks the slot: it checks IsConstructor on newTarget and never calls f (it builds a String
	//wrapper with f.prototype as its prototype, or throws). The exception is the price of asking,
	//and it is paid only there.
	_ctor(v) {
		if (typeof v !== 'function') return false;
		const s = this._src(v);
		if (s === undefined || this._nativeSrc(s)) { try { Reflect.construct(String, [], v); return true; } catch { return false; } }
		if (this._classSrc(s)) return true;
		if (this._afterAsync(s) > 0 || this._genSrc(s) || this._arrowSrc(s)) return false;
		return this._starts(s, 'function'); //the keyword: an ordinary function; anything else is a method or an accessor
	}

	//--- 0.3 the structural witnesses ---

	//is `proto` in the prototype chain of v? Object.prototype.isPrototypeOf, the intrinsic — not
	//instanceof, whose Symbol.hasInstance can be replaced.
	_proto(proto, v) {
		try { return IS_PROTO_OF.call(proto, v); } catch { return false; }
	}
	//is v's constructor exactly `ctor`?
	_own(ctor, v) {
		try { return v.constructor === ctor; } catch { return false; }
	}
	//an internal-slot check with no side effects. `hostFn` — the host's check where it has one
	//(Node's util.types: never throws); `probe` — the pure-JavaScript check, a method or getter
	//that THROWS on a missing slot. An exception costs microseconds, and in a classification the
	//negative case is the common one, so the probe is asked only when the value is plausible: a
	//cheaper witness already spoke (`some`), or the object hides its prototype — the one way to
	//silence every cheap witness while keeping the slot. Pure-JavaScript blind spot, stated: a
	//Map whose prototype was replaced by a plain object reads 0 in a browser and 8 in Node.
	_slot(hostFn, probe, v, some) {
		if (hostFn !== null) { try { return hostFn(v); } catch { return false; } }
		if (!some && !this._bare(v)) return false;
		try { probe.call(v); return true; } catch { return false; }
	}
	//no prototype at all
	_bare(v) { try { return Object.getPrototypeOf(v) === null; } catch { return false; } }
	//a property is a function
	_fn(v, key) {
		try { return typeof v[key] === 'function'; } catch { return false; }
	}
	//a property is a number
	_num(v, key) {
		try { return typeof v[key] === 'number'; } catch { return false; }
	}

	//--- 0.4 the char-code parsers (point 2). A name is read by charCodeAt; no regex, no split. ---

	//does `s` end with the ASCII word `suffix`?
	_ends(s, suffix) {
		const n = s.length, m = suffix.length;
		if (n < m) return false;
		for (let i = 0; i < m; i++) if (s.charCodeAt(n - m + i) !== suffix.charCodeAt(i)) return false;
		return true;
	}
	//does `s` start with the ASCII word `prefix`?
	_starts(s, prefix) {
		const m = prefix.length;
		if (s.length < m) return false;
		for (let i = 0; i < m; i++) if (s.charCodeAt(i) !== prefix.charCodeAt(i)) return false;
		return true;
	}
	//the SHAPE of a typed array's name: (Int | Uint | Float | BigInt | BigUint) <power of two >= 8>
	//[Clamped] Array. Returns the packed element descriptor of telem, or 0. This is the hack the
	//library is named for: it knows the form, not the list, so Float16Array passes today and
	//Int128Array will pass the day it ships.
	_tshape(s) {
		if (typeof s !== 'string' || s.length < 9 || !this._ends(s, 'Array')) return 0; //Int8Array is the shortest
		let i, kind;
		switch (s.charCodeAt(0)) {
			case 73: if (!this._starts(s, 'Int')) return 0; i = 3; kind = K_INT; break; //I
			case 85: if (!this._starts(s, 'Uint')) return 0; i = 4; kind = K_UINT; break; //U
			case 70: if (!this._starts(s, 'Float')) return 0; i = 5; kind = K_FLOAT; break; //F
			case 66: //B: BigInt or BigUint
				if (this._starts(s, 'BigInt')) { i = 6; kind = K_BIGINT; }
				else if (this._starts(s, 'BigUint')) { i = 7; kind = K_BIGUINT; }
				else return 0;
				break;
			default: return 0;
		}
		const end = s.length - 5; //where 'Array' begins
		let bits = 0;
		for (; i < end; i++) {
			const c = s.charCodeAt(i);
			if (c < 48 || c > 57) break;
			bits = bits * 10 + c - 48;
			if (bits > 4096) return 0;
		}
		if (bits < 8 || (bits & (bits - 1)) !== 0) return 0;
		let flags = 0;
		if (i !== end) { //something between the digits and 'Array': only 'Clamped' is a typed array
			if (end - i !== 7 || !this._starts(s.slice(i, end), 'Clamped')) return 0;
			flags = F_CLAMPED;
		}
		return bits | (kind << 8) | flags;
	}
	//after the 'async' keyword: the index where the rest of a function's source begins, or 0 when
	//the source does not start with the keyword. 'async' is also an ordinary name, so:
	//  async function f(){} · async x => x · async m(){} · async*m(){} · async()=>{} — the keyword;
	//  asyncThing(){} · async(){} (a method named async) · async => 1 (a parameter named async) — not.
	_afterAsync(s) {
		if (!this._starts(s, 'async')) return 0;
		const n = s.length;
		let i = 5;
		if (i >= n) return 0;
		if (s.charCodeAt(i) === 42) return i; //async*m(){} — an async generator method
		while (i < n && this._ws(s.charCodeAt(i))) i++;
		if (i >= n) return 0;
		const c = s.charCodeAt(i);
		if (c === 40) return this._parensArrow(s, i) ? i : 0; //async(...) => — an arrow; async(){} — a method named async
		if (i === 5) return 0; //'asyncThing' is a name, not the keyword
		if (c === 61 && i + 1 < n && s.charCodeAt(i + 1) === 62) return 0; //async => 1 — a parameter named async
		return i;
	}
	//balanced '(' … ')' starting at i, then optional whitespace, then '=>'
	_parensArrow(s, i) {
		const n = s.length;
		let depth = 0;
		for (; i < n; i++) {
			const c = s.charCodeAt(i);
			if (c === 40) depth++;
			else if (c === 41 && --depth === 0) { i++; break; }
		}
		if (depth !== 0) return false;
		while (i < n && this._ws(s.charCodeAt(i))) i++;
		return i + 1 < n && s.charCodeAt(i) === 61 && s.charCodeAt(i + 1) === 62; //=>
	}
	_ws(c) { return c === 32 || c === 9 || c === 10 || c === 13; }
	//is the source text an arrow function? After an optional 'async': either '(' ... matching
	//')' or a bare identifier, then '=>'. Balanced parentheses are counted; a default value
	//holding a string with a parenthesis in it is the known blind spot of this heuristic.
	_arrowSrc(s) {
		let i = this._afterAsync(s);
		const n = s.length;
		if (i >= n) return false;
		let c = s.charCodeAt(i);
		if (c === 40) return this._parensArrow(s, i); //(
		if (!(c === 36 || c === 95 || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c > 127)) return false; //identifier start
		while (i < n) { c = s.charCodeAt(i); if (c === 36 || c === 95 || (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c > 127) i++; else break; }
		while (i < n && this._ws(s.charCodeAt(i))) i++;
		return i + 1 < n && s.charCodeAt(i) === 61 && s.charCodeAt(i + 1) === 62; //=>
	}
	//is the source text a generator? 'function' then '*' (with any whitespace), or a method '*name'
	_genSrc(s) {
		let i = 0;
		if (this._starts(s, 'function')) { i = 8; while (i < s.length && this._ws(s.charCodeAt(i))) i++; }
		return i < s.length && s.charCodeAt(i) === 42; //*
	}
	//native function syntax: 'function name() { [native code] }' — natives, bound functions, function Proxies
	_nativeSrc(s) { return this._ends(s, '{ [native code] }'); }
	//the keyword 'class' followed by whitespace, '{' or the end
	_classSrc(s) {
		if (!this._starts(s, 'class')) return false;
		if (s.length === 5) return true;
		const c = s.charCodeAt(5);
		return this._ws(c) || c === 123;
	}


	//=========================================================================
	//=== 1. CONTAINERS
	//=========================================================================

	//an Array. 1 NAME 'Array' · 2 TAG claims 'Array' (real arrays have no tag property, so this
	//bit is a costume detector) · 4 BRAND Array.isArray · 8 PROTO Array.prototype of this realm
	//in the chain · 16 OWN constructor is this realm's Array.
	isarr(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		if (this._name(v) === 'Array') r |= 1;
		if (this._tag(v) === 'Array') r |= 2;
		try { if (Array.isArray(v)) r |= 4; } catch { /* revoked Proxy */ }
		if (this._proto(Array.prototype, v)) r |= 8;
		if (this._own(Array, v)) r |= 16;
		return r;
	}
	//a typed array. 1 SUFFIX the name ends with 'Array' · 2 SHAPE the name has a typed array's
	//form (see _tshape) · 4 TAG the toStringTag has that form (for a real one it IS the slot;
	//for a fake it is a claim) · 8 BRAND the %TypedArray% getter returns a name · 16 PROTO
	//%TypedArray%.prototype of this realm in the chain · 32 OWN constructor is this realm's
	//constructor of that very kind. A Buffer is 28: a Uint8Array by slot, tag and chain, whose
	//name says nothing. A class named Float32Array that is not a view is 3: a costume.
	istyped(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		const name = this._name(v);
		if (name !== undefined) {
			if (this._ends(name, 'Array')) r |= 1;
			if (this._tshape(name)) r |= 2;
		}
		if (this._tshape(this._tag(v))) r |= 4;
		let slot;
		try { slot = TYPED_TAG.call(v); } catch { slot = undefined; }
		if (slot !== undefined) r |= 8;
		if (this._proto(TYPED.prototype, v)) r |= 16;
		//OWN: this realm's constructor of the kind the slot names — or, without a slot, the kind
		//the name claims (a chain costume like Object.create(Uint8Array.prototype) lights it)
		const kind = slot !== undefined ? slot : (name !== undefined && this._tshape(name) ? name : undefined);
		if (kind !== undefined) { const ctor = G[kind]; if (typeof ctor === 'function' && this._own(ctor, v)) r |= 32; }
		return r;
	}
	//an ArrayBuffer or a SharedArrayBuffer. 1 NAME · 2 TAG (a data property on both prototypes,
	//so real ones have it) · 4 DUCK byteLength and slice, and not a view · 8 BRAND the byteLength
	//getter of either accepts it · 16 PROTO · 32 OWN · 64 SHARED it is the shared kind.
	isbuf(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		const name = this._name(v), tag = this._tag(v);
		if (name === 'ArrayBuffer' || name === 'SharedArrayBuffer') r |= 1;
		if (tag === 'ArrayBuffer' || tag === 'SharedArrayBuffer') r |= 2;
		if (this._num(v, 'byteLength') && this._fn(v, 'slice') && !ArrayBuffer.isView(v)) r |= 4;
		if (this._proto(ArrayBuffer.prototype, v) || (SAB !== null && this._proto(SAB.prototype, v))) r |= 16;
		if (this._own(ArrayBuffer, v) || (SAB !== null && this._own(SAB, v))) r |= 32;
		if (this._slot(H_AB, AB_LEN, v, r !== 0)) r |= 8;
		else if (SAB_LEN !== null && this._slot(H_SAB, SAB_LEN, v, r !== 0)) r |= 8 | 64;
		return r;
	}
	//a DataView. 1 NAME · 2 TAG · 4 DUCK getUint8 and byteLength · 8 BRAND the DataView
	//byteLength getter · 16 PROTO · 32 OWN.
	isview(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		if (this._name(v) === 'DataView') r |= 1;
		if (this._tag(v) === 'DataView') r |= 2;
		if (this._fn(v, 'getUint8') && this._num(v, 'byteLength')) r |= 4;
		if (this._proto(DataView.prototype, v)) r |= 16;
		if (this._own(DataView, v)) r |= 32;
		if (this._slot(H_DV, DV_LEN, v, r !== 0)) r |= 8;
		return r;
	}
	//the keyed collections share one shape: 1 NAME · 2 TAG (a data property, real ones have it)
	//· 4 DUCK the methods the language would call · 8 BRAND X.prototype.has.call does not throw
	//(RequireInternalSlot) · 16 PROTO · 32 OWN.
	_coll(v, name, ctor, hostFn, has, duck) {
		if (!this._obj(v)) return 0;
		let r = 0;
		if (this._name(v) === name) r |= 1;
		if (this._tag(v) === name) r |= 2;
		if (duck(v)) r |= 4;
		if (this._proto(ctor.prototype, v)) r |= 16;
		if (this._own(ctor, v)) r |= 32;
		if (this._slot(hostFn, has, v, r !== 0)) r |= 8;
		return r;
	}
	//a Map: DUCK is get, set, has, delete and a numeric size
	ismap(v) { return this._coll(v, 'Map', Map, H_MAP, MAP_HAS, (x) => this._fn(x, 'get') && this._fn(x, 'set') && this._fn(x, 'has') && this._fn(x, 'delete') && this._num(x, 'size')); }
	//a Set: DUCK is add, has, delete and a numeric size
	isset(v) { return this._coll(v, 'Set', Set, H_SET, SET_HAS, (x) => this._fn(x, 'add') && this._fn(x, 'has') && this._fn(x, 'delete') && this._num(x, 'size')); }
	//a WeakMap: DUCK is get, set, has, delete (a Map ducks as one too — it can be used as one)
	isweakmap(v) { return this._coll(v, 'WeakMap', WeakMap, H_WMAP, WMAP_HAS, (x) => this._fn(x, 'get') && this._fn(x, 'set') && this._fn(x, 'has') && this._fn(x, 'delete')); }
	//a WeakSet: DUCK is add, has, delete
	isweakset(v) { return this._coll(v, 'WeakSet', WeakSet, H_WSET, WSET_HAS, (x) => this._fn(x, 'add') && this._fn(x, 'has') && this._fn(x, 'delete')); }


	//=========================================================================
	//=== 2. VALUES WITH A SLOT: Promise, Date, RegExp, Error, arguments, wrappers, plain objects
	//=========================================================================

	//a Promise. 1 NAME · 2 TAG (a data property) · 4 DUCK a callable then — the one witness
	//`await` itself uses, so a thenable is 4 and works · 8 BRAND the host's [[PromiseState]]
	//check (util.types.isPromise) — lit only where the host has one; pure JavaScript can test
	//that slot only by registering a reaction, which a type predicate must not do, so in a
	//browser the strongest witnesses are TAG, PROTO and OWN · 16 PROTO · 32 OWN.
	isprom(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		if (this._name(v) === 'Promise') r |= 1;
		if (this._tag(v) === 'Promise') r |= 2;
		if (this._fn(v, 'then')) r |= 4;
		if (IS_PROMISE !== null) { try { if (IS_PROMISE(v)) r |= 8; } catch { /* a revoked Proxy */ } }
		if (this._proto(Promise.prototype, v)) r |= 16;
		if (this._own(Promise, v)) r |= 32;
		return r;
	}
	//a Date. 1 NAME · 2 TAG claims 'Date' (real dates have no tag property: a costume detector)
	//· 4 DUCK getTime and toISOString · 8 BRAND Date.prototype.getTime.call · 16 PROTO · 32 OWN.
	isdate(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		if (this._name(v) === 'Date') r |= 1;
		if (this._tag(v) === 'Date') r |= 2;
		if (this._fn(v, 'getTime') && this._fn(v, 'toISOString')) r |= 4;
		if (this._proto(Date.prototype, v)) r |= 16;
		if (this._own(Date, v)) r |= 32;
		if (this._slot(H_DATE, GET_TIME, v, r !== 0)) r |= 8;
		return r;
	}
	//a RegExp. 1 NAME · 2 TAG claims 'RegExp' (costume detector) · 4 DUCK exec and test · 8 BRAND
	//the RegExp source getter accepts it (it requires [[OriginalSource]]) · 16 PROTO · 32 OWN.
	isregex(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		if (this._name(v) === 'RegExp') r |= 1;
		if (this._tag(v) === 'RegExp') r |= 2;
		if (this._fn(v, 'exec') && this._fn(v, 'test')) r |= 4;
		if (this._proto(RegExp.prototype, v)) r |= 16;
		if (this._own(RegExp, v)) r |= 32;
		if (v !== RegExp.prototype && this._slot(H_RE, RE_SOURCE, v, r !== 0)) r |= 8;
		return r;
	}
	//an Error. 1 NAME the constructor's name ends with 'Error' (TypeError, MyValidationError)
	//· 2 TAG claims 'Error' (costume detector) · 4 DUCK string message and name · 8 BRAND
	//Error.isError, or the [[ErrorData]] builtin tag where the platform lacks it · 16 PROTO
	//Error.prototype of this realm in the chain · 32 OWN constructor is one of this realm's
	//native error classes (Error, TypeError, RangeError, ...): not a user subclass.
	iserr(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		const name = this._name(v);
		if (name !== undefined && this._ends(name, 'Error')) r |= 1;
		if (this._tag(v) === 'Error') r |= 2;
		try { if (typeof v.message === 'string' && typeof v.name === 'string') r |= 4; } catch { /* getter threw */ }
		let real = false;
		if (IS_ERROR !== null) { try { real = IS_ERROR(v); } catch { real = false; } }
		else real = this._slotTag(v) === 'Error';
		if (real) r |= 8;
		if (this._proto(Error.prototype, v)) r |= 16;
		try { if (NATIVE_ERRORS.has(v.constructor)) r |= 32; } catch { /* getter threw */ }
		return r;
	}
	//an arguments object. 1 TAG claims 'Arguments' (a property: a costume) · 2 SLOT the builtin
	//tag is Arguments with no tag property in the way — the [[ParameterMap]] slot speaking. The
	//only kind with no name and no protocol: it is what Object.prototype.toString is for.
	isargs(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		if (this._tag(v) === 'Arguments') r |= 1;
		if (this._slotTag(v) === 'Arguments') r |= 2;
		return r;
	}
	//a wrapper object: new Number(1), Object('x'), Object(Symbol()), Object(1n). A primitive is
	//0 — typeof is honest about those. 1 NAME Number/String/Boolean/Symbol/BigInt · 2 TAG claims
	//one of them (costume detector) · 4 BRAND the matching valueOf brand accepts it · 8 PROTO
	//the matching prototype of this realm in the chain · 16 OWN its constructor exactly.
	isbox(v) {
		if (typeof v !== 'object' || v === null) return 0;
		let r = 0;
		const name = this._name(v), tag = this._tag(v);
		if (name === 'Number' || name === 'String' || name === 'Boolean' || name === 'Symbol' || name === 'BigInt') r |= 1;
		if (tag === 'Number' || tag === 'String' || tag === 'Boolean' || tag === 'Symbol' || tag === 'BigInt') r |= 2;
		//PROTO and OWN by the kind the name or tag claims, so that a chain costume shows; the
		//brand then confirms or denies, and tells the kind itself
		const claim = name !== undefined && name.toLowerCase() in BOX ? name.toLowerCase() : tag !== undefined && tag.toLowerCase() in BOX ? tag.toLowerCase() : undefined;
		if (claim !== undefined) {
			const [ctor] = BOX[claim];
			if (this._proto(ctor.prototype, v)) r |= 8;
			if (this._own(ctor, v)) r |= 16;
		}
		if (this._box(v, r !== 0) !== undefined) r |= 4;
		return r;
	}
	//the kind of wrapper by brand, or undefined; `some` — a cheaper witness already spoke
	_box(v, some) {
		for (const kind in BOX) if (this._slot(H_BOX[kind], BOX[kind][1], v, some)) return kind;
		return undefined;
	}
	//a plain object: an object literal, Object.create(null), a JSON.parse result — also one from
	//another realm. 1 NAME 'Object' · 2 SHAPE the prototype has a null prototype and a
	//constructor named Object: plain by shape, whatever the realm · 4 NULL no prototype at all
	//(a dictionary) · 8 LOCAL the prototype is this realm's Object.prototype. A class instance
	//is 0; a foreign-realm literal is 3; a local literal is 11.
	isplain(v) {
		if (typeof v !== 'object' || v === null) return 0;
		let r = 0;
		let proto;
		try { proto = Object.getPrototypeOf(v); } catch { return 0; }
		if (proto === null) return 4;
		if (this._name(v) === 'Object') r |= 1;
		try {
			const c = proto.constructor;
			if (Object.getPrototypeOf(proto) === null && typeof c === 'function' && c.name === 'Object' && c.prototype === proto) r |= 2;
		} catch { /* a throwing getter is not plain */ }
		if (proto === Object.prototype) r |= 8;
		return r;
	}


	//=========================================================================
	//=== 3. FUNCTIONS. typeof says 'function' for all of them; the source text and the
	//=== [[Construct]] check say which. No internal slot is reachable for these kinds, so the
	//=== intrinsic source text (unforgeable for a genuine function) is the strongest witness.
	//=========================================================================

	//an async function (not an async generator). 1 NAME constructor.name 'AsyncFunction' · 2 TAG
	//'AsyncFunction' · 4 SRC the source starts with the async keyword and is not a generator ·
	//8 PROTO %AsyncFunction.prototype% of this realm in the chain.
	isasync(v) {
		if (typeof v !== 'function') return 0;
		let r = 0;
		if (this._name(v) === 'AsyncFunction') r |= 1;
		if (this._tag(v) === 'AsyncFunction') r |= 2;
		const s = this._src(v);
		if (s !== undefined) { const i = this._afterAsync(s); if (i > 0 && !this._genSrc(s.slice(i))) r |= 4; }
		if (this._proto(ASYNC_FN_PROTO, v)) r |= 8;
		return r;
	}
	//a generator function. 1 NAME 'GeneratorFunction' · 2 TAG · 4 SRC 'function*' or a '*name'
	//method · 8 PROTO %GeneratorFunction.prototype% in the chain.
	isgenfn(v) {
		if (typeof v !== 'function') return 0;
		let r = 0;
		if (this._name(v) === 'GeneratorFunction') r |= 1;
		if (this._tag(v) === 'GeneratorFunction') r |= 2;
		const s = this._src(v);
		if (s !== undefined && this._afterAsync(s) === 0 && this._genSrc(s)) r |= 4;
		if (this._proto(GEN_FN_PROTO, v)) r |= 8;
		return r;
	}
	//an async generator function. 1 NAME 'AsyncGeneratorFunction' · 2 TAG · 4 SRC async then a
	//generator · 8 PROTO %AsyncGeneratorFunction.prototype% in the chain.
	isagenfn(v) {
		if (typeof v !== 'function') return 0;
		let r = 0;
		if (this._name(v) === 'AsyncGeneratorFunction') r |= 1;
		if (this._tag(v) === 'AsyncGeneratorFunction') r |= 2;
		const s = this._src(v);
		if (s !== undefined) { const i = this._afterAsync(s); if (i > 0 && this._genSrc(s.slice(i))) r |= 4; }
		if (this._proto(AGEN_FN_PROTO, v)) r |= 8;
		return r;
	}
	//a class. 1 SRC the source starts with the class keyword · 2 FIXED it is a constructor whose
	//own prototype property is non-writable — what class syntax and the native constructors
	//produce, and ordinary functions never do. A class is 3; Map is 2; function f() {} is 0.
	isclass(v) {
		if (typeof v !== 'function') return 0;
		let r = 0;
		const s = this._src(v);
		if (s !== undefined && this._classSrc(s)) r |= 1;
		try {
			const d = Object.getOwnPropertyDescriptor(v, 'prototype');
			if (d !== undefined && d.writable === false && this._ctor(v)) r |= 2;
		} catch { /* Proxy trap threw */ }
		return r;
	}
	//an arrow function. 1 NOCTOR it has no [[Construct]] (arrows never do; neither do methods,
	//async and generator functions) · 2 SRC the source is parameters then '=>'.
	isarrow(v) {
		if (typeof v !== 'function') return 0;
		let r = 0;
		if (!this._ctor(v)) r |= 1;
		const s = this._src(v);
		if (s !== undefined && this._arrowSrc(s)) r |= 2;
		return r;
	}
	//a bound function. 1 NAME its name starts with 'bound ' · 2 SRC native syntax — a bound
	//function has no source of its own. Both together are a bound function; 2 alone is a native
	//or a Proxy; 1 alone is a function someone renamed.
	isbound(v) {
		if (typeof v !== 'function') return 0;
		let r = 0;
		try { const n = v.name; if (typeof n === 'string' && this._starts(n, 'bound ')) r |= 1; } catch { /* getter threw */ }
		const s = this._src(v);
		if (s !== undefined && this._nativeSrc(s)) r |= 2;
		return r;
	}
	//a native function. One witness: 1 SRC native syntax and a name that does not start with
	//'bound ' — the only thing that tells a native from a bound function, which prints the same
	//way. A Proxy over a function prints the same way too and cannot be told apart (the spec
	//says so); it reads as native here.
	isnative(v) {
		if (typeof v !== 'function') return 0;
		const s = this._src(v);
		if (s === undefined || !this._nativeSrc(s)) return 0;
		try { const n = v.name; if (typeof n === 'string' && this._starts(n, 'bound ')) return 0; } catch { /* getter threw */ }
		return 1;
	}


	//=========================================================================
	//=== 4. ITERATION PROTOCOLS
	//=========================================================================

	//an iterator object. 1 DUCK a callable next — the protocol · 2 SELF an iterator that is
	//iterable itself (next AND Symbol.iterator), as every built-in iterator is; a mere iterable
	//such as a Map has neither bit · 4 TAG a built-in iterator's tag: '... Iterator', 'Iterator
	//Helper', 'Generator' · 8 PROTO %IteratorPrototype% of this realm in the chain.
	isiter(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		if (this._fn(v, 'next')) { r |= 1; if (this._fn(v, Symbol.iterator)) r |= 2; }
		const tag = this._tag(v);
		if (tag !== undefined && (this._ends(tag, ' Iterator') || tag === 'Iterator Helper' || tag === 'Generator' || tag === 'Iterator')) r |= 4;
		if (this._proto(ITER_PROTO, v)) r |= 8;
		return r;
	}
	//an async iterator object. 1 DUCK next · 2 SELF next AND Symbol.asyncIterator · 4 TAG
	//'AsyncGenerator' or an '... AsyncIterator' tag · 8 PROTO %AsyncIteratorPrototype% in the chain.
	isaiter(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		if (this._fn(v, 'next')) { r |= 1; if (this._fn(v, Symbol.asyncIterator)) r |= 2; }
		const tag = this._tag(v);
		if (tag !== undefined && (tag === 'AsyncGenerator' || this._ends(tag, 'AsyncIterator') || this._ends(tag, 'Async Iterator'))) r |= 4;
		if (this._proto(AITER_PROTO, v)) r |= 8;
		return r;
	}
	//a generator object (what calling a generator function returns). 1 DUCK next, return and
	//throw · 2 TAG 'Generator' · 4 PROTO %GeneratorPrototype% of this realm in the chain.
	isgen(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		if (this._fn(v, 'next') && this._fn(v, 'return') && this._fn(v, 'throw')) r |= 1;
		if (this._tag(v) === 'Generator') r |= 2;
		if (this._proto(GEN_PROTO, v)) r |= 4;
		return r;
	}
	//an async generator object. 1 DUCK next, return and throw · 2 TAG 'AsyncGenerator' · 4 PROTO
	//%AsyncGeneratorPrototype% in the chain.
	isagen(v) {
		if (!this._obj(v)) return 0;
		let r = 0;
		if (this._fn(v, 'next') && this._fn(v, 'return') && this._fn(v, 'throw')) r |= 1;
		if (this._tag(v) === 'AsyncGenerator') r |= 2;
		if (this._proto(AGEN_PROTO, v)) r |= 4;
		return r;
	}
	//iterable: the protocols themselves, on anything — a string is 1. 1 SYNC a callable
	//Symbol.iterator · 2 ASYNC a callable Symbol.asyncIterator.
	isiterable(v) {
		if (v == null) return 0;
		let r = 0;
		try { if (typeof v[Symbol.iterator] === 'function') r |= 1; } catch { /* getter threw */ }
		try { if (typeof v[Symbol.asyncIterator] === 'function') r |= 2; } catch { /* getter threw */ }
		return r;
	}


	//=========================================================================
	//=== 5. ACCESSORS OF KIND (point 7): what the witnesses know beyond yes / no.
	//=========================================================================

	//constructor.name as a string, or undefined — the lexical witness, exposed
	tname(v) { return this._name(v); }
	//Symbol.toStringTag as a string, or undefined — the tag witness, exposed
	ttag(v) { return this._tag(v); }
	//the element type of a typed array, packed: bits 0-7 the width in bits (8, 16, 32, 64),
	//bits 8-11 the kind (1 Int, 2 Uint, 3 Float, 4 BigInt, 5 BigUint), bit 12 clamped. Read from
	//the internal slot when there is one — a Buffer and a subclass answer as Uint8 — otherwise
	//from the tag, otherwise from the name (a claim, then; istyped says which). 0 when nothing
	//looks like a typed array. Uint8ClampedArray is 0x1208; Float16Array is 0x310.
	telem(v) {
		if (!this._obj(v)) return 0;
		let slot;
		try { slot = TYPED_TAG.call(v); } catch { slot = undefined; }
		return this._tshape(slot) || this._tshape(this._tag(v)) || this._tshape(this._name(v));
	}
	//the error's kind: the constructor's name, for anything iserr sees at all — 'TypeError',
	//'MyValidationError'; undefined otherwise
	terr(v) { return this.iserr(v) !== 0 ? this._name(v) : undefined; }
	//the primitive inside a wrapper object, by brand: 'number' | 'string' | 'boolean' | 'symbol'
	//| 'bigint', or undefined (also for a primitive itself: typeof answers those)
	tbox(v) {
		if (typeof v !== 'object' || v === null) return undefined;
		const name = this._name(v), tag = this._tag(v);
		const some = (name !== undefined && name.toLowerCase() in BOX) || (tag !== undefined && tag.toLowerCase() in BOX) || this._proto(Number.prototype, v) || this._proto(String.prototype, v) || this._proto(Boolean.prototype, v) || this._proto(Symbol.prototype, v) || this._proto(BigInt.prototype, v);
		return this._box(v, some);
	}
	//the kind of a function, as flags: 1 ASYNC · 2 GEN · 4 CLASS · 8 ARROW · 16 METHOD (a concise
	//method or accessor: no 'function' keyword, no arrow) · 32 BOUND · 64 NATIVE · 128 CTOR (has
	//[[Construct]]). 0 for a non-function. function f() {} is 128; async () => {} is 9;
	//class {} is 132; Math.max is 64; f.bind(null) is 96 + 128 when f is a constructor.
	tfn(v) {
		if (typeof v !== 'function') return 0;
		let r = 0;
		const s = this._src(v);
		if (s !== undefined) {
			if (this._nativeSrc(s)) {
				r |= 64;
				try { const n = v.name; if (typeof n === 'string' && this._starts(n, 'bound ')) r = (r & ~64) | 32; } catch { /* getter threw */ }
			} else if (this._classSrc(s)) r |= 4;
			else {
				const i = this._afterAsync(s);
				if (i > 0) r |= 1;
				const rest = i > 0 ? s.slice(i) : s;
				if (this._genSrc(rest)) r |= 2;
				if (this._arrowSrc(s)) r |= 8;
				else if (!this._starts(rest, 'function')) r |= 16;
			}
		}
		if (this._ctor(v)) r |= 128;
		return r;
	}
}

//every public method, for the binding constructor (point 8)
const PUBLIC = Object.getOwnPropertyNames(typeim.prototype).filter((k) => k !== 'constructor' && k.charCodeAt(0) !== 95); //not '_'

//the bits of every predicate, as constants on the method itself (point 4): t.ismap.BRAND
const BITS = {
	isarr: { NAME: 1, TAG: 2, BRAND: 4, PROTO: 8, OWN: 16 },
	istyped: { SUFFIX: 1, SHAPE: 2, TAG: 4, BRAND: 8, PROTO: 16, OWN: 32 },
	isbuf: { NAME: 1, TAG: 2, DUCK: 4, BRAND: 8, PROTO: 16, OWN: 32, SHARED: 64 },
	isview: { NAME: 1, TAG: 2, DUCK: 4, BRAND: 8, PROTO: 16, OWN: 32 },
	ismap: { NAME: 1, TAG: 2, DUCK: 4, BRAND: 8, PROTO: 16, OWN: 32 },
	isset: { NAME: 1, TAG: 2, DUCK: 4, BRAND: 8, PROTO: 16, OWN: 32 },
	isweakmap: { NAME: 1, TAG: 2, DUCK: 4, BRAND: 8, PROTO: 16, OWN: 32 },
	isweakset: { NAME: 1, TAG: 2, DUCK: 4, BRAND: 8, PROTO: 16, OWN: 32 },
	isprom: { NAME: 1, TAG: 2, DUCK: 4, BRAND: 8, PROTO: 16, OWN: 32 },
	isdate: { NAME: 1, TAG: 2, DUCK: 4, BRAND: 8, PROTO: 16, OWN: 32 },
	isregex: { NAME: 1, TAG: 2, DUCK: 4, BRAND: 8, PROTO: 16, OWN: 32 },
	iserr: { NAME: 1, TAG: 2, DUCK: 4, BRAND: 8, PROTO: 16, OWN: 32 },
	isargs: { TAG: 1, SLOT: 2 },
	isbox: { NAME: 1, TAG: 2, BRAND: 4, PROTO: 8, OWN: 16 },
	isplain: { NAME: 1, SHAPE: 2, NULL: 4, LOCAL: 8 },
	isasync: { NAME: 1, TAG: 2, SRC: 4, PROTO: 8 },
	isgenfn: { NAME: 1, TAG: 2, SRC: 4, PROTO: 8 },
	isagenfn: { NAME: 1, TAG: 2, SRC: 4, PROTO: 8 },
	isclass: { SRC: 1, FIXED: 2 },
	isarrow: { NOCTOR: 1, SRC: 2 },
	isbound: { NAME: 1, SRC: 2 },
	isnative: { SRC: 1 },
	isiter: { DUCK: 1, SELF: 2, TAG: 4, PROTO: 8 },
	isaiter: { DUCK: 1, SELF: 2, TAG: 4, PROTO: 8 },
	isgen: { DUCK: 1, TAG: 2, PROTO: 4 },
	isagen: { DUCK: 1, TAG: 2, PROTO: 4 },
	isiterable: { SYNC: 1, ASYNC: 2 },
	telem: { INT: K_INT, UINT: K_UINT, FLOAT: K_FLOAT, BIGINT: K_BIGINT, BIGUINT: K_BIGUINT, CLAMPED: F_CLAMPED },
	tfn: { ASYNC: 1, GEN: 2, CLASS: 4, ARROW: 8, METHOD: 16, BOUND: 32, NATIVE: 64, CTOR: 128 },
};
for (const k of Object.keys(BITS)) Object.freeze(Object.assign(typeim.prototype[k], BITS[k]));

//registry of factory configurations (point 8): the same overrides object -> the same instance
const CONFIGS = new WeakMap();

//THE FACTORY. No argument — the base singleton. With overrides — a frozen instance of a
//subclass, cached by the object, with the listed methods replaced; super.method() reaches the
//original. The bound copy of an overriding predicate receives the base predicate's bit
//constants, so inst.ismap.BRAND keeps working. An unknown name or a non-function is a TypeError.
export function _typeim(overrides) {
	if (!overrides || Object.keys(overrides).length === 0) return SINGLETON;
	const hit = CONFIGS.get(overrides);
	if (hit) return hit;
	for (const k of Object.keys(overrides)) {
		if (typeof overrides[k] !== 'function') throw new TypeError(`type-im: overrides.${k} must be a function`);
		if (!(k in typeim.prototype)) throw new TypeError(`type-im: unknown method '${k}' in overrides`);
	}
	//super.method() inside an object-literal method resolves through the literal's own prototype:
	//point it at typeim.prototype, then install the methods on a subclass, whose constructor
	//binds them like any other.
	Object.setPrototypeOf(overrides, typeim.prototype);
	class configured extends typeim {}
	for (const k of Object.keys(overrides)) Object.defineProperty(configured.prototype, k, { value: overrides[k], writable: true, configurable: true });
	const inst = Object.freeze(new configured());
	CONFIGS.set(overrides, inst);
	return inst;
}

//the default instance (singleton). An ordinary user needs no new: the default export is a ready
//instance, the class is a named export for instanceof and the constants on its prototype.
const SINGLETON = new typeim();
export default SINGLETON;
export { typeim };
