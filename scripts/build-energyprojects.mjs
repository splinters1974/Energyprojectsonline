// Build the reviewed Claude/Astro prototype inside the protected /personal-projects/ route.
// The original Energy Projects holding page and other areas remain untouched.
// Source is pinned to a known commit to prevent unreviewed upstream changes being published.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const source = join(root, '.personal-astro-source');
const output = join(root, '_site');
const commit = 'fd2ad64a74d0aad0e5b15cd02e4533b9bbf2dfc6';
const prefix = '/personal-projects';
const gitUrl = 'https://github.com/splinters1974/personalsite.git';

function run(exe, args, cwd = root) {
  console.log('Running', exe, args.join(' '));
  execFileSync(exe, args, { cwd, stdio: 'inherit', env: { ...process.env, PUBLIC_PROTOTYPE: 'true' } });
}
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const excluded = new Set(['.git', '.netlify', '.personal-astro-source', '_site', 'node_modules', 'scripts', 'netlify', 'package.json', 'package-lock.json', 'netlify.toml', 'README.md', 'PERSONAL_SITE_INTEGRATION.md']);
for (const name of readdirSync(root)) {
  if (name.startsWith('.') || excluded.has(name)) continue;
  const entry = join(root, name);
  if (statSync(entry).isDirectory()) {
    // Only approved public site folders are copied to the published output.
    if (!['assets', 'work-projects', 'personal-projects', 'sandbox-area', 'bits-and-pieces', 'personalarea'].includes(name)) continue;
  } else if (!/\.(html|css|js|svg|png|webp|jpg|jpeg|txt|ico)$/.test(name)) continue;
  cpSync(entry, join(output, name), { recursive: true });
}
rmSync(source, { recursive: true, force: true });
run('git', ['clone', '--depth', '1', '--branch', 'claude/epic-volta-1jsih2', gitUrl, source]);
const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
if (actual !== commit) throw new Error('Claude working branch has moved: refusing to deploy unreviewed code. Expected ' + commit + ', got ' + actual);
run('npm', ['ci', '--no-audit', '--no-fund'], source);
run('npm', ['run', 'build:proto'], source);
const dist = join(source, 'dist');
if (!existsSync(join(dist, 'index.html'))) throw new Error('Missing Astro homepage output');
// The prototype's own sitemap/robots files are not suitable for a protected sub-site.
for (const relativeName of ['sitemap.xml', 'robots.txt']) rmSync(join(dist, relativeName), { force: true });
function rewrite(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { rewrite(path); continue; }
    if (!/\.(html|css|js)$/.test(path)) continue;
    let content = readFileSync(path, 'utf8');
    // Keep every link, asset and script inside /personal-projects/.
    content = content.replaceAll('https://martynsheridan.com/', 'https://energyprojects.online' + prefix + '/');
    content = content.replaceAll('https://martynsheridan.com', 'https://energyprojects.online' + prefix);
    content = content.replace(/(href|src|action|poster)="\/(?!\/)/g, '$1="' + prefix + '/');
    content = content.replace(/(href|src|action|poster)='\/(?!\/)/g, "$1='" + prefix + '/');
    content = content.replace(/url\((['"]?)\/(?!\/)/g, 'url($1' + prefix + '/');
    writeFileSync(path, content);
  }
}
rewrite(dist);
const target = join(output, 'personal-projects');
rmSync(target, { recursive: true, force: true });
cpSync(dist, target, { recursive: true });
if (!existsSync(join(target, 'about', 'index.html'))) throw new Error('About page missing after build');
for (const f of ['index.html', 'about/index.html', 'experience/index.html', 'projects/index.html', 'contact/index.html']) {
  const html = readFileSync(join(target, f), 'utf8');
  if (html.includes('href="/about/"') || html.includes('src="/theme.js"')) throw new Error('Unconverted root-relative link in ' + f);
}
console.log('Energy Projects and the protected Martyn Sheridan prototype prepared in', output);
