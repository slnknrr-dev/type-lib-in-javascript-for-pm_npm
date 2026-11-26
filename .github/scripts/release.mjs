//-------------------
// release helper for .github/workflows/release.yml (not published: lives outside `files`)
//-------------------
// one repository = one library family, one branch = one npm package.
// A release is a version bump: a push whose package.json version is not on npm yet gets published,
// then tagged  v<version> (branch main)  or  <package>@<version> (branch <package>).
//
//   node .github/scripts/release.mjs check          is this push a release? (branch ↔ package, npm registry)
//   node .github/scripts/release.mjs links <ref>    rewrite relative links in *.md to absolute GitHub URLs at <ref>
//
// npmjs.com renders README files without a repository context, so a relative link there is a dead link.
// `links` runs on the CI checkout right before `npm pack`: the repository keeps relative links,
// the tarball gets absolute ones, pinned to the release tag.
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
//is pkg.name@pkg.version on the registry? 404 is a clear no; any other failure stops the release
const published = () => {
	try {
		execFileSync('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform == 'win32' });
		return true;
	} catch (e) {
		if (/E404|404 Not Found/.test(String(e.stderr) + String(e.stdout))) return false;
		fail(`npm view ${pkg.name}@${pkg.version} failed: ${String(e.stderr).trim()}`);
	}
};

const check = () => {
	const repo = slug();
	const branch = env.GITHUB_REF_NAME || git('branch', '--show-current');
	const sha = env.GITHUB_SHA || git('rev-parse', 'HEAD');
	output('repo', repo);

	//only the package's own branch releases it: main, or the branch named after the package
	if (branch != 'main' && branch != short) {
		console.log(`branch ${branch} is not the release branch of ${pkg.name} (main or ${short}): nothing to publish`);
		output('publish', 'false');
		output('ref', sha);
		return;
	}
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) fail(`package.json version is not semver: ${pkg.version}`);

	const prefix = branch == 'main' ? 'v' : `${short}@`;
	const tag = prefix + pkg.version;

	if (published()) {
		console.log(`${pkg.name}@${pkg.version} is already on npm: nothing to publish`);
		output('publish', 'false');
		output('ref', sha);
		return;
	}
	//a tag pushed by hand before the release is reused: gh release create attaches to it
	if (git('tag', '--list', tag)) console.log(`tag ${tag} already exists: the release will use it`);

	//release notes start from the previous release of the same package, not of a sibling branch
	const prev = git('tag', '--list', `${prefix}*`, '--sort=-v:refname', '--merged', sha)
		.split('\n')
		.filter(t => t && t != tag && /^\d/.test(t.slice(prefix.length)))[0] ?? '';

	console.log(`release: ${pkg.name}@${pkg.version} as ${tag}${prev ? ` (notes since ${prev})` : ''}`);
	output('publish', 'true');
	output('ref', tag);
	output('tag', tag);
	output('prev', prev);
	output('dist_tag', pkg.version.includes('-') ? 'next' : 'latest');
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
