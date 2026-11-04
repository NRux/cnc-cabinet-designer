const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

// Exercise the real functions in the single-file app without booting WebGL or
// replacing its imports. This keeps the tests runnable with plain Node.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const moduleSource = html.split('<script type="module">')[1]?.split('</script>')[0];
assert.ok(moduleSource, 'inline application module exists');

function extractFunction(name) {
  const match = new RegExp(`\\bfunction\\s+${name}\\s*\\(`).exec(moduleSource);
  assert.ok(match, `function ${name} exists`);
  const start = match.index;
  let i = moduleSource.indexOf('{', start + match[0].length);
  assert.ok(i >= 0, `${name} has a body`);

  function quoted(at, quote) {
    let n = at + 1;
    while (n < moduleSource.length) {
      if (moduleSource[n] === '\\') { n += 2; continue; }
      if (moduleSource[n++] === quote) return n;
    }
    throw new Error(`unterminated ${quote} in ${name}`);
  }
  function regex(at) {
    let n = at + 1, inClass = false;
    while (n < moduleSource.length) {
      if (moduleSource[n] === '\\') { n += 2; continue; }
      if (moduleSource[n] === '[') inClass = true;
      if (moduleSource[n] === ']') inClass = false;
      if (moduleSource[n++] === '/' && !inClass) return n;
    }
    throw new Error(`unterminated regex in ${name}`);
  }
  function isRegexStart(at) {
    const before = moduleSource.slice(0, at).trimEnd();
    return /[=({[:,!?;]$/.test(before) || /\breturn$/.test(before);
  }
  function template(at) {
    let n = at + 1;
    while (n < moduleSource.length) {
      if (moduleSource[n] === '\\') { n += 2; continue; }
      if (moduleSource[n] === '`') return n + 1;
      if (moduleSource[n] === '$' && moduleSource[n + 1] === '{') { n = interpolation(n + 2); continue; }
      n++;
    }
    throw new Error(`unterminated template in ${name}`);
  }
  function interpolation(at) {
    let n = at, depth = 1;
    while (depth && n < moduleSource.length) {
      const c = moduleSource[n];
      if (c === '"' || c === "'") { n = quoted(n, c); continue; }
      if (c === '`') { n = template(n); continue; }
      if (c === '/' && moduleSource[n + 1] === '/') { n = moduleSource.indexOf('\n', n + 2) + 1; continue; }
      if (c === '/' && moduleSource[n + 1] === '*') { n = moduleSource.indexOf('*/', n + 2) + 2; continue; }
      if (c === '/' && isRegexStart(n)) { n = regex(n); continue; }
      if (c === '{') depth++;
      if (c === '}') depth--;
      n++;
    }
    if (depth) throw new Error(`unterminated interpolation in ${name}`);
    return n;
  }
  let depth = 0;
  while (i < moduleSource.length) {
    const c = moduleSource[i];
    if (c === '"' || c === "'") { i = quoted(i, c); continue; }
    if (c === '`') { i = template(i); continue; }
    if (c === '/' && moduleSource[i + 1] === '/') { i = moduleSource.indexOf('\n', i + 2) + 1; continue; }
    if (c === '/' && moduleSource[i + 1] === '*') { i = moduleSource.indexOf('*/', i + 2) + 2; continue; }
    if (c === '/' && isRegexStart(i)) { i = regex(i); continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return moduleSource.slice(start, i + 1);
    i++;
  }
  throw new Error(`unterminated function ${name}`);
}

function extractConst(name) {
  const match = new RegExp(`\\bconst\\s+${name}\\s*=`).exec(moduleSource);
  assert.ok(match, `const ${name} exists`);
  const end = moduleSource.indexOf(';', match.index);
  assert.ok(end >= 0, `const ${name} has a terminator`);
  return moduleSource.slice(match.index, end + 1);
}

function appFunctions(names, bindings = {}) {
  const context = vm.createContext({ ...bindings });
  vm.runInContext(names.map(name =>
    new RegExp(`\\bfunction\\s+${name}\\s*\\(`).test(moduleSource)
      ? extractFunction(name) : extractConst(name)).join('\n'), context, { timeout: 1000 });
  for (const name of names) context[name] = vm.runInContext(name, context);
  return context;
}

function sourceIsSingleRubyStringAssignment(line) {
  const start = line.indexOf("g.name='");
  if (start < 0) return false;
  let at = start + "g.name='".length;
  while (at < line.length) {
    if (line[at] === '\\') { at += 2; continue; }
    if (line[at] === "'") return line.slice(at + 1).trim() === '';
    at++;
  }
  return false;
}

test('imported layer IDs cannot create markup in the layer renderer', () => {
  const payload = 'x"><img src=x onerror="globalThis.auditMarker=1">';
  const panels = [
    { id: 1, name: 'Grouped', grp: payload, hid: false },
    { id: payload, name: 'Loose', hid: false },
  ];
  const app = appFunctions(['esc', 'lyrRow', 'layersHTML'], {
    state: { panels, prods: [] }, isSel: () => false,
    grpName: () => 'Group', grpMembers: () => [panels[0]], dimsTxt: () => '100×100',
  });
  const rendered = app.layersHTML();
  assert.doesNotMatch(rendered, /<img\b/i);
  assert.match(rendered, /&lt;img/i);
});

test('group breadcrumbs escape imported group IDs', () => {
  const payload = 'g"><img src=x onerror="globalThis.auditMarker=1">';
  const panel = { id: 1, grp: payload };
  const app = appFunctions(['esc', 'crumbHTML'], {
    state: { tool: 'select' }, selIds: () => [1], selGrp: () => null,
    selProdFull: () => null, panelById: () => panel, grpName: () => 'Group',
  });
  const rendered = app.crumbHTML();
  assert.doesNotMatch(rendered, /<img\b/i);
  assert.match(rendered, /&lt;img/i);
});

test('SketchUp Ruby export keeps imported names inside comments and strings', () => {
  const panel = { id: 1, name: "A\\'; AUDIT_MARKER = true; #", x: 0, y: 0, z: 0,
    w: 100, h: 18, d: 100, t: 'y', mat: 'birch',
    feat: [{ id: 1, a: 'y', s: 1, u0: 10, u1: 30, v0: 10, v1: 30,
      depth: 5, c: 1 }] };
  const app = appFunctions(['toRuby'], {
    state: { name: 'Project\nAUDIT_MARKER = true' },
    r4: x => x, BRD: () => [panel], thick: () => 18,
    MATS: { birch: { short: 'Birch' }, oiled: { short: 'Oil' }, black: { short: 'Black' } },
    AX: ['x', 'y', 'z'], SZ: { x: 'w', y: 'h', z: 'd' },
  });
  const ruby = app.toRuby();
  const lines = ruby.split('\n');
  assert.match(lines[1], /^# SketchUp/);
  assert.ok(lines.some(line => sourceIsSingleRubyStringAssignment(line)),
    'the part name is one Ruby string assignment');
  assert.match(ruby, /f\.pushpull\(-5\.mm\)/,
    'a circular pocket produces a complete Ruby pushpull call');
});

test('CSV export neutralizes formula-leading imported names', () => {
  const app = appFunctions(['toCSV'], {
    partsList: () => [{ no: 1, names: ['=1+1'], L: 100, W: 50, T: 18,
      qty: 1, mat: 'birch', cn: '' }],
    MATS: { birch: { name: 'Birch' } },
  });
  const csv = app.toCSV();
  const nameCell = csv.split('\r\n')[1].split(';')[1].replace(/^"|"$/g, '');
  assert.match(nameCell, /^[\t']/);
});

test('nesting honors long grain and includes oversized parts in totals', () => {
  const part = { no: 1, L: 100, W: 50, T: 18, mat: 'birch', qty: 1, grain: 'L' };
  const app = appFunctions(['pack', 'nestAll', 'nestSummary'], {
    state: { grainNest: true }, partsList: () => [part], getSheet: () => [80, 120],
    sheetStats: () => ({ cut: 0, waste: [] }),
  });
  const groups = app.nestAll();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].over.length, 1, 'rotating against the grain must not place the part');
  const totals = app.nestSummary();
  assert.equal(totals.cnt, 1);
  assert.equal(totals.over, 1);
  assert.equal(totals.partA, 0.005);
});

test('DXF includes hinge bores, edge machining, and face sides', () => {
  const part = { no: 1, L: 300, W: 400, T: 18, qty: 1, mat: 'birch', cr: 0,
    fe: [{ x0: 20, x1: 40, y0: 20, y1: 40, depth: 5, thr: false, s: -1 }],
    cups: [{ x: 50, y: 80, dia: 35, dep: 12, s: 1 }],
    ed: [{ x0: 30, x1: 150, y0: 4, y1: 9, depth: 6, thr: false, long: true, s: 1 }],
  };
  const line = (x, y, w, h, layer) => [[x, y, x + w, y + h, layer]];
  const app = appFunctions(['detailsDXF'], {
    partsList: () => [part], rectL: line, rrL: line,
    circL: (x, y, r, layer) => [[x, y, x + r, y, layer]],
    dxf: (lines, texts) => ({ lines, texts }), tr: { birch: 'Birch' }, r4: x => x,
  });
  const result = app.detailsDXF();
  const layers = result.lines.map(row => row[4]);
  assert.ok(layers.includes('HINGE_FRONT'));
  assert.ok(layers.some(layer => /^EDGE_(CUT|POCKET)_/.test(layer)));
  assert.ok(layers.includes('POCKET_BACK'));
});

const validPanel = () => ({ id: 1, name: 'Side', x: 0, y: 0, z: 0,
  w: 100, h: 300, d: 18, t: 'z', mat: 'birch' });

test('project validation rejects malformed and duplicate panels', () => {
  const app = appFunctions(['validateProject', 'parseProjectText'], {
    isRecord: v => v !== null && typeof v === 'object' && !Array.isArray(v),
    finite: v => typeof v === 'number' && Number.isFinite(v),
    axis: v => ['x', 'y', 'z'].includes(v),
    vec3: v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
    MAX_PROJECT_PANELS: 1200, MAX_PROJECT_BYTES: 16 * 1024 * 1024,
    SHEETS: { '1525x1525': [1525, 1525] },
  });
  const project = { app: 'cnc-cabinet-designer', version: 3, panels: [validPanel()] };
  assert.equal(app.parseProjectText(JSON.stringify(project)).panels.length, 1);
  assert.throws(() => app.parseProjectText(JSON.stringify({ ...project, panels: [null] })));
  assert.throws(() => app.parseProjectText(JSON.stringify({ ...project, panels: [validPanel(), validPanel()] })));
  assert.throws(() => app.parseProjectText(JSON.stringify({ ...project, panels: [{ ...validPanel(), w: -4 }] })));
});

test('project JSON export includes all persisted design data', () => {
  const state = { name: 'Saved', panels: [validPanel()], guides: [{ p: [0, 0, 0], d: [1, 0, 0] }],
    sheet: '1525x1525', sheetW: 1500, sheetH: 1200, units: 'mm', prods: [], grpn: {},
    dims: [[[0, 0, 0], [1, 1, 1]]], notes: [{ p: [0, 0, 0], t: 'Note' }],
    rates: { birch: 12 }, grainNest: true, slideGap: 12, conf: { j: [] },
    flines: [], lines: [[[0, 0, 0], [1, 0, 0]]], holeBig: true };
  const app = appFunctions(['projectData', 'projJSON'], { state, nextId: 7 });
  const exported = JSON.parse(app.projJSON());
  const stored = app.projectData();
  for (const key of Object.keys(stored)) assert.deepEqual(exported[key], stored[key], `missing ${key}`);
  assert.equal(exported.version, 3);
  const validator = appFunctions(['validateProject', 'parseProjectText'], {
    isRecord: v => v !== null && typeof v === 'object' && !Array.isArray(v),
    finite: v => typeof v === 'number' && Number.isFinite(v),
    axis: v => ['x', 'y', 'z'].includes(v),
    vec3: v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
    MAX_PROJECT_PANELS: 1200, MAX_PROJECT_BYTES: 16 * 1024 * 1024,
    SHEETS: { '1525x1525': [1525, 1525] },
  });
  assert.equal(validator.parseProjectText(app.projJSON()).panels.length, 1);
});

test('failed browser storage writes are visible to the user', () => {
  const status = { textContent: '' }, notices = [];
  const app = appFunctions(['save'], {
    tidy: () => {}, projectData: () => ({ panels: [] }), MAX_PROJECT_BYTES: 1000,
    localStorage: { setItem: () => { throw new Error('quota'); } },
    $: () => status, toast: text => notices.push(text), saveFailed: false,
    savedProjectCorrupt: false,
  });
  assert.equal(app.save(), false);
  assert.match(status.textContent, /NOT SAVED/i);
  assert.ok(notices.length);
});

test('undo snapshots restore project metadata and the next panel ID', () => {
  const state = { name: 'Original', panels: [validPanel()], guides: [], notes: [], dims: [] };
  const noop = () => {};
  const app = appFunctions(['projectData', 'setProjectData', 'snap', 'unsnap'], {
    state, nextId: 10, buildGuides: noop, dimRebuild: noop, noteLabels: noop,
    lineBuild: noop, confDraw: noop, flineAll: noop,
  });
  const before = app.snap();
  state.name = 'Imported'; state.panels = []; app.nextId = 2;
  app.unsnap(before);
  assert.equal(state.name, 'Original');
  assert.equal(state.panels[0].id, 1);
  assert.equal(app.nextId, 10);
});

test('opening a project replaces products and fastener marks, and honors cancellation', () => {
  const oldProduct = { id: 7, type: 'shelf', P: {}, x: 0, y: 0, z: 0 };
  const state = { name: 'Old', panels: [validPanel()], prods: [oldProduct], conf: { j: [{ a: 1 }] },
    guides: [], notes: [], dims: [] };
  let allowed = false, undoCalls = 0;
  const noop = () => {};
  const app = appFunctions(['setProjectData', 'loadProject'], {
    state, nextId: 8, validateProject: noop, confirmProjectReplace: () => allowed,
    pushUndo: () => { undoCalls++; }, rebuildAll: noop, buildGuides: noop,
    dimRebuild: noop, noteLabels: noop, lineBuild: noop, confDraw: noop,
    save: noop, renderInsp: noop, toast: noop, setView: noop, fitView: noop,
    isoId: null,
  });
  const incoming = { name: 'New', panels: [{ ...validPanel(), id: 2 }] };
  assert.equal(app.loadProject(incoming), false);
  assert.equal(state.name, 'Old');
  assert.equal(undoCalls, 0);
  allowed = true;
  assert.equal(app.loadProject(incoming), true);
  assert.equal(state.name, 'New');
  assert.equal(state.panels[0].id, 2);
  assert.deepEqual(Array.from(state.prods), []);
  assert.equal(state.conf, null);
  assert.equal(app.nextId, 3);
  assert.equal(undoCalls, 1);
});

test('orthogonal rotation carries machining bounds and polygon points with the board', () => {
  const app = appFunctions(['rotatedFeature'], { AX: ['x', 'y', 'z'], r4: x => Math.round(x * 1e4) / 1e4 });
  const original = { id: 2, a: 'y', s: 1, u0: 50, u1: 150, v0: 100, v1: 200,
    depth: 6, poly: [[50, 100], [150, 100], [150, 200]] };
  const size = { x: 800, y: 18, z: 450 };
  const halfTurn = app.rotatedFeature(original,
    { x: 'x', y: 'y', z: 'z' }, { x: -1, y: 1, z: -1 }, size);
  assert.deepEqual([halfTurn.a, halfTurn.s, halfTurn.u0, halfTurn.u1, halfTurn.v0, halfTurn.v1],
    ['y', 1, 650, 750, 250, 350]);
  assert.deepEqual(Array.from(halfTurn.poly[0]), [750, 350]);

  const quarterTurn = app.rotatedFeature(original,
    { x: 'x', y: 'z', z: 'y' }, { x: 1, y: 1, z: -1 }, size);
  assert.deepEqual([quarterTurn.a, quarterTurn.s, quarterTurn.u0, quarterTurn.u1, quarterTurn.v0, quarterTurn.v1],
    ['z', 1, 50, 150, 250, 350]);
  assert.deepEqual(Array.from(original.poly[0]), [50, 100], 'source feature must remain unchanged');
});

test('vendored imports are local, pinned, and match installed packages', () => {
  const importmap = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1] || 'null');
  assert.ok(importmap?.imports);
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must be exactly pinned`);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
  }
  for (const target of Object.values(importmap.imports)) {
    assert.match(target, /^\.\/vendor\//);
    assert.ok(fs.existsSync(path.resolve(root, target)), `missing local import ${target}`);
  }
  const vendor = path.join(root, 'vendor'), installed = path.join(root, 'node_modules');
  function compareTree(directory) {
    for (const ent of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, ent.name);
      if (ent.isDirectory()) { compareTree(file); continue; }
      const relative = path.relative(vendor, file);
      assert.ok(fs.existsSync(path.join(installed, relative)), `missing package source ${relative}`);
      assert.deepEqual(fs.readFileSync(file), fs.readFileSync(path.join(installed, relative)),
        `${relative} differs from its pinned package`);
    }
  }
  if (fs.existsSync(installed)) compareTree(vendor);
});

test('CSP hashes match the inline import map and application module', () => {
  const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
  assert.ok(policy, 'CSP meta tag is present');
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self'/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
  for (const type of ['importmap', 'module']) {
    const code = html.match(new RegExp(`<script type="${type}">([\\s\\S]*?)<\\/script>`))?.[1];
    assert.ok(code, `${type} script is present`);
    const hash = createHash('sha256').update(code).digest('base64');
    assert.ok(policy.includes(`'sha256-${hash}'`), `${type} CSP hash is stale`);
  }
});
