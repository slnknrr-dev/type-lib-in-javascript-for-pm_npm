//-------------------
// release helper for .github/workflows/release.yml (not published: lives outside `files`)
//-------------------
// one repository = one library family, one branch = one npm package:
//   branch `main`      -> tag v<version>
//   branch `<name>`    -> tag <name>@<version>   (<name> = package name without the scope)
//
//   node .github/scripts/release.mjs check          validate the tag against package.json and its branch
//   node .github/scripts/release.mjs links <ref>    rewrite relative links in *.md to absolute GitHub URLs at <ref>
//
// npmjs.com renders README files without a repository context, so a relative link there is a dead link.
// `links` runs on the CI checkout right before `npm pack`: the repository keeps relative links,
// the tarball gets absolute ones, pinned to the released tag.

import { readFileSync, writeFileSync, appendFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative, resolve, posix, sep } from 'node:path';

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const env = process.env;

const fail = msg => {
	console.error(`::error::${msg}`);
	process.exit(1);
};

const output = (key, value) => {
	console.log(`${key}=${value}`);
	if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

//owner/repo from package.json `repository`; must agree with the repository the workflow runs in
const slug = () => {
	const url = typeof pkg.repository == 'string' ? pkg.repository : pkg.repository?.url ?? '';
	const m = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(url);
	if (!m) fail(`package.json repository is not a GitHub URL: ${url || '(empty)'}`);
	if (env.GITHUB_REPOSITORY && env.GITHUB_REPOSITORY.toLowerCase() != m[1].toLowerCase())
		fail(`package.json repository (${m[1]}) differs from the workflow repository (${env.GITHUB_REPOSITORY})`);
	return m[1];
};

const short = pkg.name.replace(/^@[^/]+\//, '');

//-------------------
// check
//-------------------
const check = () => {
	const repo = slug();
	const tag = env.GITHUB_REF_TYPE == 'tag' ? env.GITHUB_REF_NAME : '';

	if (!tag) {
		//manual run: pack only, links pinned to the commit
		output('publish', 'false');
		output('ref', env.GITHUB_SHA || git('rev-parse', 'HEAD'));
		output('repo', repo);
		return;
	}

	const m = /^(?:v|([a-z0-9][a-z0-9._-]*)@)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
	if (!m) fail(`tag ${tag}: expected v<version> (branch main) or <package>@<version> (branch <package>)`);
	const [, name, version] = m;
	const branch = name ?? 'main';

	if (name && name != short) fail(`tag ${tag} names ${name}, but this branch holds ${pkg.name}`);
	if (version != pkg.version) fail(`tag ${tag} says ${version}, package.json says ${pkg.version}`);

	//the tagged commit must belong to the package's branch
	const sha = env.GITHUB_SHA || git('rev-parse', 'HEAD');
	try {
		git('merge-base', '--is-ancestor', sha, `origin/${branch}`);
	} catch {
		fail(`tag ${tag} points to ${sha.slice(0, 7)}, which is not on branch ${branch}`);
	}

	//release notes start from the previous release of the same package, not of a sibling branch
	const prefix = name ? `${name}@` : 'v';
	const prev = git('tag', '--list', `${prefix}*`, '--sort=-v:refname', '--merged', sha)
		.split('\n')
		.filter(t => t && t != tag && /^\d/.test(t.slice(prefix.length)))[0] ?? '';

	output('publish', 'true');
	output('ref', tag);
	output('repo', repo);
	output('branch', branch);
	output('prev', prev);
	output('dist_tag', version.includes('-') ? 'next' : 'latest');
};

//-------------------
// links
//-------------------
const SKIP_DIRS = new Set(['node_modules', '.git', '.github']);
const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp)$/i;

const markdownFiles = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
	const p = join(dir, e.name);
	if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : markdownFiles(p);
	return /\.md$/i.test(e.name) ? [p] : [];
});

//relative target -> absolute URL, or null when the target is not a repository path
const absolute = (target, file, { repo, ref, image }) => {
	if (!target || target.startsWith('#') || target.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null;

	const cut = target.search(/[?#]/);
	const path = cut < 0 ? target : target.slice(0, cut);
	const tail = cut < 0 ? '' : target.slice(cut);
	if (!path) return null;

	const plain = decodeURIComponent(path);
	const disk = plain.startsWith('/') ? join(ROOT, plain) : resolve(dirname(file), plain);
	const rel = relative(ROOT, disk).split(sep).join(posix.sep);
	if (rel.startsWith('..')) throw new Error(`${relative(ROOT, file)}: link ${target} leaves the package`);
	if (!existsSync(disk)) throw new Error(`${relative(ROOT, file)}: link ${target} points to a missing file`);

	const enc = rel.split('/').map(encodeURIComponent).join('/');
	if (statSync(disk).isDirectory()) return `https://github.com/${repo}/tree/${ref}/${enc}${tail}`;
	if (image || IMAGE.test(rel)) return `https://raw.githubusercontent.com/${repo}/${ref}/${enc}${tail}`;
	return `https://github.com/${repo}/blob/${ref}/${enc}${tail}`;
};

//is the `](` at index i closing an image, i.e. does its matching `[` follow a `!`?
const isImage = (line, i) => {
	for (let depth = 0, j = i - 1; j >= 0; j--) {
		if (line[j] == ']') depth++;
		else if (line[j] == '[') {
			if (depth) depth--;
			else return line[j - 1] == '!';
		}
	}
	return false;
};

//rewrite one line of prose; inline code spans are left as they are
const rewriteLine = (line, file, ctx) => line.split(/(`+[^`]*`+)/).map((part, n) => {
	if (n % 2) return part;

	//[text](target "title") and ![alt](target)
	part = part.replace(/\]\((\s*<?)([^)\s>]+)/g, (m, lead, target, at) => {
		const url = absolute(target, file, { ...ctx, image: isImage(part, at) });
		return url ? `](${lead}${url}` : m;
	});

	//<img src="..."> and <a href="...">
	part = part.replace(/\b(src|href)=(["'])([^"']+)\2/gi, (m, attr, q, target) => {
		const url = absolute(target, file, { ...ctx, image: attr.toLowerCase() == 'src' });
		return url ? `${attr}=${q}${url}${q}` : m;
	});

	return part;
}).join('');

const rewrite = (text, file, ctx) => {
	let fence = null;
	return text.split('\n').map(line => {
		const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
		if (f) {
			if (!fence) fence = f[1];
			else if (f[1][0] == fence[0] && f[1].length >= fence.length) fence = null;
			return line;
		}
		if (fence) return line;

		//[id]: target  (reference definition)
		const d = /^(\s{0,3}\[[^\]]+\]:\s*<?)(\S+?)(>?(?:\s.*)?)$/.exec(line);
		if (d) {
			const url = absolute(d[2], file, ctx);
			return url ? d[1] + url + d[3] : line;
		}

		return rewriteLine(line, file, ctx);
	}).join('\n');
};

const links = ref => {
	if (!ref) fail('usage: release.mjs links <ref>');
	const ctx = { repo: slug(), ref };
	for (const file of markdownFiles(ROOT)) {
		const before = readFileSync(file, 'utf8');
		let after;
		try { after = rewrite(before, file, ctx) } catch (e) { fail(e.message) }
		if (after != before) {
			writeFileSync(file, after);
			console.log(`links: ${relative(ROOT, file)}`);
		}
	}
};

const [cmd, arg] = process.argv.slice(2);
if (cmd == 'check') check();
else if (cmd == 'links') links(arg);
else fail('usage: release.mjs check | links <ref>');
