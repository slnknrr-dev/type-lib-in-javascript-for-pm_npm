# @slnknrr/type-ez

[![npm](https://img.shields.io/npm/v/@slnknrr/type-ez?logo=npm&label=npm)](https://www.npmjs.com/package/@slnknrr/type-ez)
[![tests](https://github.com/slnknrr-dev/type-lib-in-javascript-for-pm_npm/actions/workflows/test.yml/badge.svg?branch=type-ez)](https://github.com/slnknrr-dev/type-lib-in-javascript-for-pm_npm/actions/workflows/test.yml?query=branch%3Atype-ez)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE.md)
[![stars](https://img.shields.io/github/stars/slnknrr-dev/type-lib-in-javascript-for-pm_npm?style=flat&logo=github&label=stars)](https://github.com/slnknrr-dev/type-lib-in-javascript-for-pm_npm/stargazers)
[![GitHub](https://img.shields.io/badge/GitHub-slnknrr--dev-181717?logo=github)](https://github.com/slnknrr-dev)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-slnknrr-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/slnknrr)
[![PayPal](https://img.shields.io/badge/PayPal-slnknrrdev-00457C?logo=paypal&logoColor=white)](https://paypal.me/slnknrrdev)

**The friendly face of [`@slnknrr/type-im`](https://www.npmjs.com/package/@slnknrr/type-im): the same cross-realm, forgery-aware type witnesses behind familiar names and plain booleans.**

`type-im` is precise and terse: `ismap` returns `63`, `15`, `30` or `2` and expects you to read the bits — which witness said yes, whether the value came from another realm, whether it is a subclass or a costume. That is the right contract for an engine. It is not the contract you want in application code, where a type check should read like `isMap(v)` and return `true`.

`type-ez` is that layer — and nothing more. Every function is one call into the engine plus a decision: **the strongest witness the kind has**, collapsed to a boolean. No logic of its own, no state, no configuration.

```js
import { isMap, isTypedArray, isTypedArrayOf, isPromise, isThenable, isPlainObject, isAsyncFunction, kindOf, typedArrayKind } from '@slnknrr/type-ez';

isMap(mapFromAnIframe);                 // true  — instanceof says false, and lies
isMap({ [Symbol.toStringTag]: 'Map' }); // false — the tag is a costume
isTypedArray(Buffer.alloc(8));          // true  — a Uint8Array by its internal slot
isTypedArrayOf(Buffer.alloc(8), Uint8Array); // true — the kind, by the slot's name, across realms
isPromise(thenable);                    // false; isThenable(thenable) — true, and that is what `await` cares about
isPlainObject(JSON.parse(text));        // true; isPlainObject(Math) — false, as lodash agrees
isAsyncFunction(async () => {});        // true  — from the intrinsic source text, minified or not
kindOf(new Float32Array(2));            // 'typedarray'
typedArrayKind(new Float32Array(2));    // { kind: 'float', bits: 32, clamped: false, bytesPerElement: 4 }
```

---

## What changes at the boundary

Four rules. Everything else is the engine's behavior, unchanged.

| | `type-im` | `type-ez` |
|---|---|---|
| Result | the bits of every witness that said yes | `boolean` — decided by the **strongest witness the kind has**: the internal-slot brand where one exists; the intrinsic source text for function kinds; the protocol plus the tag for iterators and generators |
| What a costume, a duck, a subclass, another realm look like | four different bit patterns | costume `false` · duck `false` (except `isThenable`, whose whole point is the duck) · subclass `true` · another realm `true` |
| `isprom`'s brand | the host's, `0` in a browser | `isPromise` checks once, at load, whether the host has a brand and falls back to the tag and this realm's chain where it has not — what `instanceof Promise` gives |
| Packed numbers (`telem`, `tfn`) | `0x1208`, `9` | objects: `{ kind, bits, clamped, bytesPerElement }`, `{ async, generator, class, arrow, method, bound, native, constructible }` |

`undefined` stays `undefined` where the engine has nothing to say. Nothing throws: not on a revoked Proxy, not on a throwing getter, not on `null`.

## What it is NOT

- **Not a second engine.** Every witness lives in `type-im`. If you need to know *why* — which witness said yes, whether a value is a subclass or from another realm — read the bits there; `type-ez` always uses the default instance.
- **Not a schema validator.** No shapes, no coercion, no messages about your payload.
- **Not for primitives.** `typeof` is honest about them. `isPrimitive` and `kindOf` are here for convenience; the rest starts where `typeof` stops.
- **Not a `Proxy` detector.** The specification makes a Proxy indistinguishable from its target; a Proxy of an array is an array here too.

---

## Install

```sh
npm install @slnknrr/type-ez
```

```js
import ez from '@slnknrr/type-ez';                        // one frozen object with every function
import { isMap, kindOf } from '@slnknrr/type-ez';         // or named imports — tree-shakeable
```

Requirements: **Node ≥ 20**, ESM only. `@slnknrr/type-im` ≥ 1.0.0 is the single dependency and is installed with the package. Works in any browser; in Node, Deno and Bun the host's `util.types` sharpens the brands where pure JavaScript would have to throw an exception to find out.

---

## API

41 functions: 27 wrappers, one per engine predicate, 6 accessors of kind, and 8 compositions (marked **+**). The `type-im` column names the engine method and the witness that decides.

### 1 · Containers — the brand decides
| Function | type-im | `true` for |
|---|---|---|
| `isArray(v)` | `isarr` · BRAND | an Array from any realm, subclasses included (`Array.isArray`, kept for symmetry) |
| `isTypedArray(v)` | `istyped` · BRAND | any typed array from any realm; a `Buffer` and a subclass are typed arrays |
| **+** `isTypedArrayOf(v, kind)` | `istyped`, `ttag` | a typed array of one kind — `kind` is a constructor or its name — compared by the internal slot's name: `isTypedArrayOf(buffer, Uint8Array)` is `true`, and so is a `Float16Array` from another realm |
| `isArrayBuffer(v)` / `isSharedArrayBuffer(v)` | `isbuf` · BRAND, SHARED | one or the other |
| **+** `isAnyArrayBuffer(v)` | `isbuf` · BRAND | either |
| `isDataView(v)` | `isview` · BRAND | |
| `isMap` / `isSet` / `isWeakMap` / `isWeakSet` `(v)` | `ismap` … · BRAND | the real thing, from anywhere; a Map is not a WeakMap even though it could be used as one |

### 2 · Values with a slot
| Function | type-im | `true` for |
|---|---|---|
| `isPromise(v)` | `isprom` · BRAND, or TAG + PROTO without a host brand | a genuine Promise, from any realm; never a thenable |
| **+** `isThenable(v)` | `isprom` · DUCK | anything with a callable `then` — what `await` accepts; a Promise too |
| `isDate(v)` | `isdate` · BRAND | a Date, valid or invalid |
| `isRegExp(v)` | `isregex` · BRAND | |
| `isError(v)` | `iserr` · BRAND | anything with `[[ErrorData]]`: every native error, every subclass, from any realm; not `{ message, name }` |
| `isArguments(v)` | `isargs` · SLOT | an arguments object |
| `isBoxedPrimitive(v)` | `isbox` · BRAND | `new Number(1)`, `Object('x')`, `Object(1n)`, `Object(Symbol())`; never a primitive |
| `isPlainObject(v)` | `isplain` · NULL \| LOCAL \| SHAPE, and `ttag` | an object literal, `Object.create(null)`, a parsed JSON object — from any realm — with no `toStringTag`; `Math` and class instances are not plain |

### 3 · Functions — the intrinsic source text decides
| Function | type-im | `true` for |
|---|---|---|
| `isAsyncFunction(v)` | `isasync` · SRC | `async` functions, arrows and methods; not an async generator |
| `isGeneratorFunction(v)` | `isgenfn` · SRC | `function*` and `*method` |
| `isAsyncGeneratorFunction(v)` | `isagenfn` · SRC | |
| `isClass(v)` | `isclass` · SRC | class syntax. `Map` is a constructor, not a class |
| `isArrowFunction(v)` | `isarrow` · SRC | |
| `isBoundFunction(v)` | `isbound` · NAME + SRC | `f.bind(x)`: named `bound …` *and* printed as native code — a renamed function is not |
| `isNativeFunction(v)` | `isnative` · SRC | `Math.max`, `Map`; a function Proxy prints the same way and passes |
| **+** `isConstructor(v)` | `tfn` · CTOR | has `[[Construct]]`: classes, ordinary functions, native and bound constructors; not arrows, methods, async or generator functions |

### 4 · Iteration
| Function | type-im | `true` for |
|---|---|---|
| `isIterator(v)` / `isAsyncIterator(v)` | `isiter` / `isaiter` · DUCK | anything with a callable `next` — the protocol is the contract, user objects included |
| `isGenerator(v)` / `isAsyncGenerator(v)` | `isgen` / `isagen` · DUCK and (TAG or PROTO) | a generator object, from any realm; not a bare `{ next, return, throw }` |
| `isIterable(v)` | `isiterable` · SYNC | a callable `Symbol.iterator` — strings included |
| **+** `isAsyncIterable(v)` | `isiterable` · ASYNC | |

### 5 · Kinds — the engine's accessors, unpacked
| Function | type-im | Returns |
|---|---|---|
| `constructorName(v)` | `tname` | `constructor.name`, or `undefined`; never autoboxes a primitive |
| `toStringTag(v)` | `ttag` | `Symbol.toStringTag`, or `undefined`. `toStringTag(Buffer.alloc(0))` → `'Uint8Array'` |
| `typedArrayKind(v)` | `telem` | `{ kind: 'int' \| 'uint' \| 'float' \| 'bigint' \| 'biguint', bits, clamped, bytesPerElement }`, or `undefined`. From the internal slot when there is one, else what the tag or the name claims — `isTypedArray` says which |
| `errorName(v)` | `terr` | `'TypeError'`, `'MyValidationError'`, or `undefined` |
| `boxedType(v)` | `tbox` | `'number' \| 'string' \| 'boolean' \| 'symbol' \| 'bigint'`, or `undefined` |
| `functionKind(v)` | `tfn` | `{ async, generator, class, arrow, method, bound, native, constructible }`, or `undefined` for a non-function |

### 6 · Everyday questions
| Function | Built on | Returns |
|---|---|---|
| **+** `isPrimitive(v)` | `typeof` | not an object and not a function |
| **+** `kindOf(v)` | every predicate, in order | one name: `'null' 'undefined' 'boolean' 'number' 'bigint' 'string' 'symbol'` · `'function' 'class' 'generatorfunction' 'asyncfunction' 'asyncgeneratorfunction'` · `'array' 'typedarray' 'arraybuffer' 'dataview' 'map' 'set' 'weakmap' 'weakset' 'promise' 'date' 'regexp' 'error' 'arguments' 'boxed' 'generator' 'asyncgenerator' 'iterator' 'plain'` · `'object'` when nothing more specific answers |

```js
kindOf(null);                      // 'null'
kindOf(Buffer.alloc(1));           // 'typedarray'
kindOf(mapFromAnIframe);           // 'map'
kindOf({ then() {} });             // 'plain' — a thenable is a plain object with a method
kindOf(Object.create(Map.prototype)); // 'object' — instanceof would have said Map
kindOf(class {});                  // 'class'
```

---

## TypeScript

Declarations ship with the package; nothing to install from `@types`. Every predicate is a type guard where a type exists (`isMap(v)` narrows to `Map<unknown, unknown>`, `isPromise` to `Promise<unknown>`, `isConstructor` to `new (...args) => unknown`). Exported types: `TypedArrayKind`, `FunctionKind`, `Kind`, `TypedArrayKindRef`, `TypeEz`, and the engine's `BoxKind`, `ElemBits`, `FnBits`.

```ts
import { isMap, kindOf, typedArrayKind } from '@slnknrr/type-ez';
import type { Kind } from '@slnknrr/type-ez';

if (isMap(v)) v.get('x');          // v: Map<unknown, unknown>
const k: Kind = kindOf(v);         // a closed union
typedArrayKind(v)?.bytesPerElement // number | undefined
```

`types/type-ez.d.ts` is written by hand and checked against `types/api.test-d.ts` with `npm run types`.

---

## When to reach for `type-im` instead

- You want to know *which* witness said yes — to tell a subclass from the base class, a value from another realm from a local one, a costume from the real thing.
- You want the bits as a signal for a heuristic or a state machine instead of a boolean.
- You want a configured engine (`_typeim(overrides)`).

Both packages can be used side by side; `type-ez` never shadows anything in the engine.

---

## Scripts

| Command | Does |
|---|---|
| `npm test` | behavioral suite (`node --test`, zero dev dependencies) — against a second realm and Node's `util.types` |
| `npm run types` | type-check the shipped declarations (`tsc --noEmit`) |

---

## Links

- Source: [github.com/slnknrr-dev/type-lib-in-javascript-for-pm_npm/tree/type-ez](https://github.com/slnknrr-dev/type-lib-in-javascript-for-pm_npm/tree/type-ez)
- npm: [https://www.npmjs.com/package/@slnknrr/type-ez](https://www.npmjs.com/package/@slnknrr/type-ez)
- The engine: [@slnknrr/type-im](https://www.npmjs.com/package/@slnknrr/type-im)

## Repository layout

Every `@slnknrr` library family lives in one GitHub repository, and **every npm package is a branch** of it — with its own README, tests and releases. A release is a version bump: when a push to the package's branch carries a `package.json` version that is not on npm yet, CI tests it, publishes it to npm and tags it `<package>@<version>` (`v<version>` on a `main` branch).

This package is the `type-ez` branch of [`slnknrr-dev/type-lib-in-javascript-for-pm_npm`](https://github.com/slnknrr-dev/type-lib-in-javascript-for-pm_npm); its releases are tagged `type-ez@<version>`.

| Branch | npm package | Role |
|---|---|---|
| [`type-im`](https://github.com/slnknrr-dev/type-lib-in-javascript-for-pm_npm/tree/type-im) | [`@slnknrr/type-im`](https://www.npmjs.com/package/@slnknrr/type-im) | the engine |
| [`type-ez`](https://github.com/slnknrr-dev/type-lib-in-javascript-for-pm_npm/tree/type-ez) | [`@slnknrr/type-ez`](https://www.npmjs.com/package/@slnknrr/type-ez) | **this package** — the friendly wrapper over type-im |

All families:

| Family | Repository | Branches → packages |
|---|---|---|
| arrays | [`arr-lib-in-javascript-for-pm_npm`](https://github.com/slnknrr-dev/arr-lib-in-javascript-for-pm_npm) | [`arr-im`](https://github.com/slnknrr-dev/arr-lib-in-javascript-for-pm_npm/tree/arr-im) → [`@slnknrr/arr-im`](https://www.npmjs.com/package/@slnknrr/arr-im) |
| bytes | [`buf-lib-in-javascript-for-pm_npm`](https://github.com/slnknrr-dev/buf-lib-in-javascript-for-pm_npm) | [`buf-im`](https://github.com/slnknrr-dev/buf-lib-in-javascript-for-pm_npm/tree/buf-im) → [`@slnknrr/buf-im`](https://www.npmjs.com/package/@slnknrr/buf-im) |
| identifiers | [`id-lib-in-javascript-for-pm_npm`](https://github.com/slnknrr-dev/id-lib-in-javascript-for-pm_npm) | [`main`](https://github.com/slnknrr-dev/id-lib-in-javascript-for-pm_npm/tree/main) → [`@slnknrr/id`](https://www.npmjs.com/package/@slnknrr/id) |
| numbers as text | [`num-lib-in-javascript-for-pm_npm`](https://github.com/slnknrr-dev/num-lib-in-javascript-for-pm_npm) | [`num-im`](https://github.com/slnknrr-dev/num-lib-in-javascript-for-pm_npm/tree/num-im) → [`@slnknrr/num-im`](https://www.npmjs.com/package/@slnknrr/num-im) · [`num-ez`](https://github.com/slnknrr-dev/num-lib-in-javascript-for-pm_npm/tree/num-ez) → [`@slnknrr/num-ez`](https://www.npmjs.com/package/@slnknrr/num-ez) |
| random data | [`rnd-lib-in-javascript-for-pm_npm`](https://github.com/slnknrr-dev/rnd-lib-in-javascript-for-pm_npm) | [`rnd-im`](https://github.com/slnknrr-dev/rnd-lib-in-javascript-for-pm_npm/tree/rnd-im) → [`@slnknrr/rnd-im`](https://www.npmjs.com/package/@slnknrr/rnd-im) · [`rnd-ez`](https://github.com/slnknrr-dev/rnd-lib-in-javascript-for-pm_npm/tree/rnd-ez) → [`@slnknrr/rnd-ez`](https://www.npmjs.com/package/@slnknrr/rnd-ez) |
| strings | [`str-lib-in-javascript-for-pm_npm`](https://github.com/slnknrr-dev/str-lib-in-javascript-for-pm_npm) | [`str-im`](https://github.com/slnknrr-dev/str-lib-in-javascript-for-pm_npm/tree/str-im) → [`@slnknrr/str-im`](https://www.npmjs.com/package/@slnknrr/str-im) · [`str-ez`](https://github.com/slnknrr-dev/str-lib-in-javascript-for-pm_npm/tree/str-ez) → [`@slnknrr/str-ez`](https://www.npmjs.com/package/@slnknrr/str-ez) |
| types | [`type-lib-in-javascript-for-pm_npm`](https://github.com/slnknrr-dev/type-lib-in-javascript-for-pm_npm) | [`type-im`](https://github.com/slnknrr-dev/type-lib-in-javascript-for-pm_npm/tree/type-im) → [`@slnknrr/type-im`](https://www.npmjs.com/package/@slnknrr/type-im) · [`type-ez`](https://github.com/slnknrr-dev/type-lib-in-javascript-for-pm_npm/tree/type-ez) → [`@slnknrr/type-ez`](https://www.npmjs.com/package/@slnknrr/type-ez) |

## Author

Yury Slinkin (Юрий Слинкин)

- Email: [slnknrr.dev@gmail.com](mailto:slnknrr.dev@gmail.com)
- GitHub: [github.com/slnknrr-dev](https://github.com/slnknrr-dev)
- Ko-fi: [ko-fi.com/slnknrr](https://ko-fi.com/slnknrr)
- PayPal: [paypal.me/slnknrrdev](https://paypal.me/slnknrrdev)

## License

MIT © 2026 Yury Slinkin <slnknrr.dev@gmail.com>. See [LICENSE.md](LICENSE.md).
