import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules');
const target = path.join(root, 'vendor');
const entries = {
  three: ['build/three.module.js'],
  'three-mesh-bvh': ['build/index.module.js'],
  'three-bvh-csg': ['build/index.module.js'],
  'three-gpu-pathtracer': ['build/index.module.js'],
};
const threeAddons = [
  'controls/OrbitControls.js',
  'geometries/RoundedBoxGeometry.js',
  'loaders/OBJLoader.js',
  'loaders/ColladaLoader.js',
  'loaders/GLTFLoader.js',
  'loaders/STLLoader.js',
  'loaders/FBXLoader.js',
  'postprocessing/Pass.js',
];

await rm(target, { recursive: true, force: true });
let count = 0;
async function copy(packageName, relative) {
  const from = path.join(source, packageName, relative);
  const to = path.join(target, packageName, relative);
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  count++;
}
for (const [name, files] of Object.entries(entries)) {
  for (const file of files) await copy(name, file);
  await copy(name, 'LICENSE');
}

const jsmRoot = path.join(source, 'three', 'examples', 'jsm');
const pending = [...threeAddons];
const seen = new Set();
while (pending.length) {
  const relative = pending.pop();
  if (seen.has(relative)) continue;
  seen.add(relative);
  const file = path.join(jsmRoot, relative);
  const code = await readFile(file, 'utf8');
  await copy('three', path.join('examples/jsm', relative));
  for (const match of code.matchAll(/\b(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const resolved = path.relative(jsmRoot, path.resolve(path.dirname(file), specifier));
    if (resolved.startsWith('..') || path.isAbsolute(resolved)) {
      throw new Error(`Import escapes three/examples/jsm: ${relative} -> ${specifier}`);
    }
    pending.push(resolved);
  }
}
console.log(`Copied ${count} pinned dependency files to vendor/`);
