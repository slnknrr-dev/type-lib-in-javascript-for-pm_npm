// Indicative microbenchmarks. `npm run bench`. Absolute numbers are machine-specific;
// what is portable is the SHAPE of the result.
//
// type-im is NOT trying to out-run Array.isArray or a single instanceof — those are one
// internal check each and they win, as they should: a predicate here consults five or six
// witnesses and reports them all. type-im wins where the usual idiom is a chain of instanceof
// against every typed array constructor, an Object.prototype.toString call that builds a
// string per check, or a regex over a constructor name — and where the usual idiom is simply
// wrong (another realm). These are the cases below, plus two honest "native wins" lines.
import t from '../src/type-im.js';
import { types as U } from 'node:util';

let sink = 0; // defeats dead-code elimination

function opsPerSec(fn) {
	for (let i = 0; i < 200; i++) sink += fn() | 0; // warmup / JIT
	let n = 1;
	for (;;) {
		const t0 = process.hrtime.bigint();
		for (let i = 0; i < n; i++) sink += fn() | 0;
		const dt = Number(process.hrtime.bigint() - t0) / 1e9;
		if (dt > 0.25) return n / dt;
		n *= 2;
	}
}

const fmt = (x) => x >= 1e6 ? (x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(0) + 'k' : x.toFixed(0);
const pad = (x, w) => String(x).padStart(w);

function run(cases) {
	console.log(`type-im bench — node ${process.version}\n`);
	console.log(`${'case'.padEnd(40)}${pad('type-im', 9)}${pad('native', 9)}${pad('speedup', 10)}  the usual way`);
	console.log('-'.repeat(104));
	for (const c of cases) {
		const a = opsPerSec(c.typeim);
		const b = opsPerSec(c.native);
		const r = a / b;
		console.log(`${c.name.padEnd(40)}${pad(fmt(a) + '/s', 9)}${pad(fmt(b) + '/s', 9)}${pad(r.toFixed(r >= 1 ? 1 : 2) + 'x', 10)}  ${c.note}`);
	}
	console.log('-'.repeat(104));
	console.log('higher speedup = type-im faster. Results vary by machine and V8 version.');
}

// --- inputs ---
const KINDS = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array];
const f64 = new Float64Array(4);          // the last in the chain: instanceof pays for all eleven
const mixed = [new Map(), new Set(), [1, 2], new Uint8Array(2), Promise.resolve(1), new Date(), /x/, { a: 1 }, new Error('x'), 'str', 42, null];
const objToString = Object.prototype.toString;
const typedName = /^(?:Int|Uint|Float|BigInt|BigUint)(?:8|16|32|64)(?:Clamped)?Array$/;
const lodashPlain = (v) => { // lodash's isPlainObject, essentially
	if (typeof v !== 'object' || v === null || objToString.call(v) !== '[object Object]') return false;
	const proto = Object.getPrototypeOf(v);
	if (proto === null) return true;
	const Ctor = Object.prototype.hasOwnProperty.call(proto, 'constructor') && proto.constructor;
	return typeof Ctor === 'function' && Ctor instanceof Ctor && Function.prototype.toString.call(Ctor) === Function.prototype.toString.call(Object);
};

run([
	{
		name: 'which typed array? (kind + width)',
		note: 'telem   vs   11× instanceof, then BYTES_PER_ELEMENT',
		typeim: () => t.telem(f64),
		native: () => { for (const K of KINDS) if (f64 instanceof K) return K.BYTES_PER_ELEMENT * 8; return 0; },
	},
	{
		name: 'is it a typed array, and which?',
		note: 'istyped + telem   vs   toString + a regex on the tag',
		typeim: () => (t.istyped(f64) & t.istyped.BRAND) ? t.telem(f64) : 0,
		native: () => { const s = objToString.call(f64).slice(8, -1); return typedName.test(s) ? 1 : 0; },
	},
	{
		name: 'classify a mixed list of 12 values',
		note: 'ismap|isset|isarr|istyped|isprom   vs   5× Object.prototype.toString',
		typeim: () => { let k = 0; for (const v of mixed) { if (t.ismap(v) & 8) k += 1; else if (t.isset(v) & 8) k += 2; else if (t.isarr(v) & 4) k += 3; else if (t.istyped(v) & 8) k += 4; else if (t.isprom(v) & 8) k += 5; } return k; },
		native: () => { let k = 0; for (const v of mixed) { const s = objToString.call(v); if (s === '[object Map]') k += 1; else if (s === '[object Set]') k += 2; else if (s === '[object Array]') k += 3; else if (typedName.test(s.slice(8, -1))) k += 4; else if (s === '[object Promise]') k += 5; } return k; },
	},
	{
		name: 'plain object?',
		note: 'isplain   vs   lodash-style isPlainObject (toString + Function source)',
		typeim: () => t.isplain(mixed[7]) & t.isplain.LOCAL,
		native: () => lodashPlain(mixed[7]) ? 1 : 0,
	},
	{
		name: 'is it a Map? (with the brand)',
		note: 'ismap   vs   util.types.isMap (native, wins)',
		typeim: () => t.ismap(mixed[0]) & t.ismap.BRAND,
		native: () => U.isMap(mixed[0]) ? 1 : 0,
	},
	{
		name: 'is it an array?',
		note: 'isarr   vs   Array.isArray (one check, wins)',
		typeim: () => t.isarr(mixed[2]) & t.isarr.BRAND,
		native: () => Array.isArray(mixed[2]) ? 1 : 0,
	},
	{
		name: 'kind of a function',
		note: 'tfn   vs   toString tag + Reflect.construct + source regexes',
		typeim: () => t.tfn(lodashPlain),
		native: () => { const f = lodashPlain; const tag = objToString.call(f); let r = tag === '[object AsyncFunction]' ? 1 : 0; const s = Function.prototype.toString.call(f); if (/^class[\s{]/.test(s)) r |= 4; if (/^(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/.test(s)) r |= 8; try { Reflect.construct(String, [], f); r |= 128; } catch { /* not a constructor */ } return r; },
	},
]);

if (sink === Number.MIN_SAFE_INTEGER) console.log(sink); // keep sink live
