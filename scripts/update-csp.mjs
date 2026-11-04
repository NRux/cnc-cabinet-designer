import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'index.html');
let html = await readFile(file, 'utf8');
const hash = type => {
  const match = html.match(new RegExp(`<script type="${type}">([\\s\\S]*?)<\\/script>`));
  if (!match) throw new Error(`Missing ${type} script`);
  return `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`;
};
const policy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  `script-src 'self' ${hash('importmap')} ${hash('module')}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join('; ');
const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
if (/<meta http-equiv="Content-Security-Policy"[^>]*>/.test(html)) {
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, tag);
} else {
  html = html.replace(/(<meta charset="utf-8">)/, `$1\n${tag}`);
}
await writeFile(file, html);
console.log('Updated inline script hashes in Content Security Policy');
