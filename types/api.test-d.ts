// Type-level test: exercises the public surface so `tsc --noEmit` fails if the declarations
// drift. Not executed at runtime; imports resolve ./type-ez.js -> ./type-ez.d.ts.
import ez, {
	isArray, isTypedArray, isTypedArrayOf, isArrayBuffer, isSharedArrayBuffer, isAnyArrayBuffer, isDataView, isMap, isSet,
	isPromise, isThenable, isDate, isRegExp, isError, isArguments, isBoxedPrimitive, isPlainObject,
	isAsyncFunction, isGeneratorFunction, isClass, isArrowFunction, isBoundFunction, isNativeFunction, isConstructor,
	isIterator, isAsyncIterator, isGenerator, isAsyncGenerator, isIterable, isAsyncIterable,
	constructorName, toStringTag, typedArrayKind, errorName, boxedType, functionKind, isPrimitive, kindOf,
} from './type-ez.js';
import type { TypedArrayKind, FunctionKind, Kind, TypeEz, BoxKind } from './type-ez.js';

// helper to assert a static type without runtime effect
declare function expect<T>(value: T): void;

const v: unknown = {};

// every predicate is a boolean, and a type guard where a type exists
expect<boolean>(isArray(v));
if (isArray(v)) expect<unknown[]>(v);
if (isTypedArray(v)) expect<ArrayBufferView>(v);
expect<boolean>(isTypedArrayOf(v, Uint8Array));
expect<boolean>(isTypedArrayOf(v, 'Float16Array'));
if (isArrayBuffer(v)) expect<ArrayBuffer>(v);
if (isSharedArrayBuffer(v)) expect<SharedArrayBuffer>(v);
expect<boolean>(isAnyArrayBuffer(v));
if (isDataView(v)) expect<DataView>(v);
if (isMap(v)) expect<Map<unknown, unknown>>(v);
if (isSet(v)) expect<Set<unknown>>(v);
if (isPromise(v)) expect<Promise<unknown>>(v);
if (isThenable(v)) expect<PromiseLike<unknown>>(v);
if (isDate(v)) expect<Date>(v);
if (isRegExp(v)) expect<RegExp>(v);
if (isError(v)) expect<string>(v.message);
if (isArguments(v)) expect<number>(v.length);
expect<boolean>(isBoxedPrimitive(v));
if (isPlainObject(v)) expect<Record<PropertyKey, unknown>>(v);
if (isAsyncFunction(v)) expect<Promise<unknown>>(v());
if (isGeneratorFunction(v)) expect<GeneratorFunction>(v);
expect<boolean>(isClass(v));
expect<boolean>(isArrowFunction(v));
expect<boolean>(isBoundFunction(v));
expect<boolean>(isNativeFunction(v));
if (isConstructor(v)) expect<unknown>(new v());
if (isIterator(v)) expect<IteratorResult<unknown>>(v.next());
if (isAsyncIterator(v)) expect<Promise<IteratorResult<unknown>>>(v.next());
if (isGenerator(v)) expect<Generator<unknown>>(v);
if (isAsyncGenerator(v)) expect<AsyncGenerator<unknown>>(v);
if (isIterable(v)) for (const x of v) expect<unknown>(x);
if (isAsyncIterable(v)) expect<AsyncIterable<unknown>>(v);
if (isPrimitive(v)) expect<null | undefined | boolean | number | bigint | string | symbol>(v);

// kinds
expect<string | undefined>(constructorName(v));
expect<string | undefined>(toStringTag(v));
expect<TypedArrayKind | undefined>(typedArrayKind(v));
const k = typedArrayKind(new Uint8ClampedArray(1));
if (k) { expect<'int' | 'uint' | 'float' | 'bigint' | 'biguint'>(k.kind); expect<number>(k.bytesPerElement); expect<boolean>(k.clamped); }
expect<string | undefined>(errorName(v));
expect<BoxKind | undefined>(boxedType(v));
expect<FunctionKind | undefined>(functionKind(v));
const fk = functionKind(() => {});
if (fk) expect<boolean>(fk.arrow && fk.constructible);
expect<Kind>(kindOf(v));
const kind: Kind = kindOf(1);
if (kind === 'typedarray') expect<'typedarray'>(kind);

// the default object is the same surface
expect<TypeEz>(ez);
expect<typeof isMap>(ez.isMap);
expect<boolean>(ez.isPromise(v));

// -- negative cases: these MUST error --
// @ts-expect-error a predicate returns a boolean, never the engine's bits
expect<number>(isMap(v));
// @ts-expect-error the default object is frozen
ez.isMap = isMap;
// @ts-expect-error kindOf answers from a closed set
expect<'thing'>(kindOf(v));
// @ts-expect-error isTypedArrayOf needs a constructor or a name
isTypedArrayOf(v, 8);
// @ts-expect-error the engine's names do not exist here
ez.ismap(v);
// @ts-expect-error a TypedArrayKind has no packed number
typedArrayKind(v)?.packed;
