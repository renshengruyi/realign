// Turns Vite's single-file build into the body-only page the Artifact tool publishes.
// The Artifact skeleton supplies <!doctype>, <html>, <head>, charset and viewport,
// so this keeps the title first (it must sit in the first 8 KB), then the meta tag,
// the font stylesheet, the inlined CSS, the mount point and the inlined script.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const pick = (re, label) => {
  const m = html.match(re);
  if (!m) throw new Error(`build-artifact: missing ${label}`);
  return m[0];
};

const title = pick(/<title>[\s\S]*?<\/title>/, 'title');
const meta = pick(/<meta name="claude:viewport-fit-sides"[^>]*>/, 'viewport-fit-sides meta');
const font = pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, 'font link');
const styles = html.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? [];
const scripts = html.match(/<script type="module"[^>]*>[\s\S]*?<\/script>/g) ?? [];
if (scripts.length !== 1) throw new Error(`build-artifact: expected one inline module script, found ${scripts.length}`);
const script = scripts[0].replace(/<script type="module"[^>]*>/, '<script type="module">');

const out = [title, meta, font, ...styles, '<div id="app"></div>', script].join('\n');
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/realign.html', out);
console.log(`artifact/realign.html  ${(out.length / 1024).toFixed(1)} KB`);
