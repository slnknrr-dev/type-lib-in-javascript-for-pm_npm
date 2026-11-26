// Type-level test: exercises the public surface so `tsc --noEmit` fails if the declarations
// drift. Not executed at runtime; imports resolve ./type-im.js -> ./type-im.d.ts.
import t, { typeim, _typeim } from './type-im.js';
import type { Pred, SlotBits, TypedBits, BoxKind, ElemBits, FnBits } from './type-im.js';

// helper to assert a static type without runtime effect
declare function expect<T>(value: T): void;

// every predicate takes anything and returns a number
expect<number>(t.isarr([]));
expect<number>(t.isarr('not even an object'));
expect<number>(t.istyped(new Uint8Array(1)));
expect<number>(t.isbuf(new ArrayBuffer(1)));
expect<number>(t.isview(null));
expect<number>(t.ismap(new Map()));
expect<number>(t.isset(undefined));
expect<number>(t.isweakmap(new WeakMap()));
expect<number>(t.isweakset(new WeakSet()));
expect<number>(t.isprom(Promise.resolve()));
expect<number>(t.isdate(new Date()));
expect<number>(t.isregex(/x/));
expect<number>(t.iserr(new TypeError('x')));
expect<number>(t.isargs(1));
expect<number>(t.isbox(Object(1)));
expect<number>(t.isplain({}));
expect<number>(t.isasync(async () => {}));
expect<number>(t.isgenfn(function* () {}));
expect<number>(t.isagenfn(async function* () {}));
expect<number>(t.isclass(class {}));
expect<number>(t.isarrow(() => {}));
expect<number>(t.isbound(Math.max.bind(null)));
expect<number>(t.isnative(Math.max));
expect<number>(t.isiter([].values()));
expect<number>(t.isaiter((async function* () {})()));
expect<number>(t.isgen((function* () {})()));
expect<number>(t.isagen((async function* () {})()));
expect<number>(t.isiterable('abc'));

// the constants live on the methods, with literal types
expect<8>(t.ismap.BRAND);
expect<32>(t.ismap.OWN);
expect<2>(t.istyped.SHAPE);
expect<64>(t.isbuf.SHARED);
expect<4>(t.isarr.BRAND);
expect<2>(t.isargs.SLOT);
expect<4>(t.isplain.NULL);
expect<1>(t.isclass.SRC);
expect<1>(t.isarrow.NOCTOR);
expect<1>(t.isnative.SRC);
expect<2>(t.isiter.SELF);
expect<2>(t.isiterable.ASYNC);
expect<4096>(t.telem.CLAMPED);
expect<5>(t.telem.BIGUINT);
expect<128>(t.tfn.CTOR);
expect<number>(t.ismap(new Map()) & t.ismap.BRAND);
expect<boolean>((t.isarr([]) & t.isarr.BRAND) !== 0);

// the accessors
expect<string | undefined>(t.tname([]));
expect<string | undefined>(t.ttag(new Map()));
expect<number>(t.telem(new Float32Array(1)));
expect<string | undefined>(t.terr(new RangeError('x')));
expect<BoxKind | undefined>(t.tbox(Object('x')));
expect<number>(t.tfn(() => {}));

// predicates are values too: pass them around, type them by their bits
const p: Pred<SlotBits> = t.ismap;
expect<number>(p(new Map()));
expect<8>(p.BRAND);
const tp: Pred<TypedBits> = t.istyped;
expect<1>(tp.SUFFIX);
const eb: ElemBits = t.telem;
const fb: FnBits = t.tfn;
expect<3>(eb.FLOAT);
expect<64>(fb.NATIVE);

// the class, the factory
expect<typeim>(t);
expect<typeim>(_typeim());
expect<typeim>(_typeim({ ismap(v: unknown) { return 0; } }));
expect<8>(typeim.prototype.ismap.BRAND);

// -- negative cases: these MUST error --
// @ts-expect-error a predicate returns a number, not a boolean
expect<boolean>(t.ismap(new Map()));
// @ts-expect-error BRAND is 8, not 4, on ismap
expect<4>(t.ismap.BRAND);
// @ts-expect-error isarr has no DUCK bit
t.isarr.DUCK;
// @ts-expect-error isnative has one bit only
t.isnative.UNBOUND;
// @ts-expect-error the constants are read-only
t.ismap.BRAND = 8;
// @ts-expect-error tbox is one of five names
expect<'object'>(t.tbox({}));
// @ts-expect-error an unknown method in overrides
_typeim({ nope() {} });
// @ts-expect-error a predicate takes exactly one argument
t.ismap(new Map(), true);
