const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function between(start, end) {
  const i = html.indexOf(start), j = html.indexOf(end, i + start.length);
  assert.ok(i >= 0 && j > i, `missing ${start}`);
  return html.slice(i, j);
}
function line(start) {
  const i = html.indexOf(start);
  assert.ok(i >= 0, `missing ${start}`);
  return html.slice(i, html.indexOf('\n', i));
}

// These tests run the application's geometry functions with Three.js math only;
// the browser renderer and WebGL are not needed.
const geometrySource = `
const MM=0.001,SZ={x:'w',y:'h',z:'d'},AX=['x','y','z'];
const AXV={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
const r4=v=>Math.round(v*10000)/10000;
const nf=v=>String(+(+v).toFixed(2)).replace('.',',');
const PF=(w,sz)=>w+' '+sz+'px Arial';
const state={panels:[]};const BRD=()=>state.panels.filter(p=>!p.hw);
const ovl=(a0,a1,b0,b1)=>Math.min(a1,b1)-Math.max(a0,b0);
${between('function bbox(', '\n\n/* ---------- three setup')}
${line('function cornersLocal(')}
${line('const pCenter=')}
${line('const rotQ=')}
${between('function quatToRot(', '\nconst rTot=')}
${line('const rTot=')}
${line('function setRTot(')}
${line('function setRotation(')}
${line('function corners(')}
${between('function rotatedFeature(', '\nfunction bakeRot(')}
${between('function bakeRot(', '\nfunction finishRot(')}
${between('function boardOverlap(', '\nfunction checkProject(')}
${between('function drawViews(', '\n/* product sheet photos')}
const rect={id:1,name:'test',w:800,h:18,d:450,x:0,y:0,z:0,t:'y',mat:'birch',
  feat:[{id:1,a:'y',s:1,u0:50,u1:150,v0:100,v1:200,depth:5,
  poly:[[50,100],[150,100],[50,200]]}]};
const p=structuredClone(rect);p.rot={ax:'y',deg:180};bakeRot(p);
assert.deepEqual([p.feat[0].u0,p.feat[0].u1,p.feat[0].v0,p.feat[0].v1],[650,750,250,350]);
assert.deepEqual(p.feat[0].poly,[[750,350],[650,350],[750,250]]);
assert.equal(p.feat[0].s,1);
const q=structuredClone(rect);setRotation(q,new THREE.Quaternion().setFromAxisAngle(AXV.x,Math.PI/2));
assert.deepEqual([q.w,q.h,q.d,q.t],[800,450,18,'z']);
assert.deepEqual([q.feat[0].a,q.feat[0].s,q.feat[0].u0,q.feat[0].u1,q.feat[0].v0,q.feat[0].v1],
  ['z',1,50,150,250,350]);
setRotation(q,new THREE.Quaternion());
assert.deepEqual([q.w,q.h,q.d,q.t],[800,18,450,'y']);
assert.deepEqual([q.feat[0].a,q.feat[0].s,q.feat[0].u0,q.feat[0].u1,q.feat[0].v0,q.feat[0].v1],
  ['y',1,50,150,100,200]);
const a={w:100,h:20,d:100,x:0,y:0,z:0,t:'y',rot:{ax:'y',deg:45}},
  inside={w:20,h:20,d:20,x:40,y:0,z:40,t:'y'},
  outside={w:10,h:20,d:10,x:-15,y:0,z:-15,t:'y'};
assert(boardOverlap(a,inside));assert(!boardOverlap(a,outside));
const bb=bbox([a]);assert(Math.abs((bb.x1-bb.x0)-Math.SQRT2*100)<1e-7);
state.panels=[{...rect,rot:{ax:'y',deg:45}}];
const paths=[],labels=[];let current=[];
const g={save(){},restore(){},beginPath(){current=[]},moveTo(x,y){current.push([x,y])},
  lineTo(x,y){current.push([x,y])},closePath(){paths.push(current)},fill(){},stroke(){},
  fillText(s){labels.push(s)},translate(){},rotate(){}};
drawViews(g,0,0,300,150);assert.equal(paths.length,3);assert(paths[2].length>=4);
const top=paths[2];assert(new Set(top.map(v=>v[0].toFixed(4))).size>2);
assert(labels.includes(nf(bbox(state.panels).x1-bbox(state.panels).x0)+' mm'));
const worldCorners=(board,feature)=>{
  const [u,v]=AX.filter(axis=>axis!==feature.a),out=[];
  for(const uu of [feature.u0,feature.u1])for(const vv of [feature.v0,feature.v1]){
    const local={[feature.a]:feature.s>0?board[SZ[feature.a]]:0,[u]:uu,[v]:vv};
    const point=new THREE.Vector3(board.x+local.x,board.y+local.y,board.z+local.z);
    if(board.rot){const center=new THREE.Vector3(board.x+board.w/2,board.y+board.h/2,board.z+board.d/2);
      point.sub(center).applyQuaternion(rotQ(board)).add(center)}
    out.push(point.toArray().map(n=>n.toFixed(2)).join(','))}
  return out.sort()};
let faceCases=0;
for(const rotationAxis of AX)for(const degrees of [90,180,270]){
  const board={id:2,name:'all faces',w:120,h:15,d:80,x:300,y:300,z:300,t:'y',
    rot:{ax:rotationAxis,deg:degrees},feat:[]};
  for(const face of AX)for(const side of [-1,1]){
    const [u,v]=AX.filter(axis=>axis!==face);
    board.feat.push({id:board.feat.length+1,a:face,s:side,u0:4,u1:board[SZ[u]]-7,
      v0:3,v1:board[SZ[v]]-5,depth:2})}
  const before=board.feat.map(feature=>worldCorners(board,feature));
  bakeRot(board);
  board.feat.forEach((feature,i)=>assert.deepEqual(worldCorners(board,feature),before[i]));
  faceCases+=board.feat.length;
}
return {faceCases,pdfOutlines:paths.length,topVertices:top.length};
`;

test('rotations preserve all face features and rotated views/checks use world geometry', async () => {
  const THREE = await import('three');
  const result = new Function('THREE', 'assert', geometrySource)(THREE, assert);
  assert.equal(result.faceCases, 54);
  assert.equal(result.pdfOutlines, 3);
  assert.ok(result.topVertices >= 4);
});

test('grouped board survives a circular through-cut in the app CSG evaluator', async () => {
  const THREE = await import('three');
  const CSG = await import('three-bvh-csg');
  const source = `const MM=0.001,SZ={x:'w',y:'h',z:'d'},AX=['x','y','z'];
    const hashOff=()=>0;
    ${between('function makeGeo(', '\nconst isSel=')}
    ${between('function cylGeo(', '\nfunction pocketGeo(')}
    ${between('function pocketGeo(', '\nfunction innerMat(')}
    return {makeGeo,pocketGeo}`;
  const { makeGeo, pocketGeo } = new Function('THREE', source)(THREE);
  const attributes = html.match(/csgEval\.attributes\s*=\s*\[([^\]]+)\]/)?.[1]
    .matchAll(/'([^']+)'/g);
  assert.ok(attributes, 'app CSG attribute selection exists');
  const evaluator = new CSG.Evaluator();
  evaluator.attributes = Array.from(attributes, match => match[1]);
  const useGroups = html.match(/csgEval\.useGroups\s*=\s*(true|false)/)?.[1];
  if (useGroups != null) evaluator.useGroups = useGroups === 'true';

  const material = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
  for (const [id, width] of [[1, 100], [2, 120]]) {
    const board = { id, w: width, h: 18, d: 100, t: 'y' };
    const hole = { id: 1, a: 'y', s: 1, u0: 20, u1: 55,
      v0: 20, v1: 55, depth: 18, c: 1 };
    const base = makeGeo(board), cutter = pocketGeo(board, hole);
    assert.equal(base.groups.length, 2, 'cabinet boards use separate face/edge groups');
    const a = new CSG.Brush(base, material), b = new CSG.Brush(cutter, material);
    a.updateMatrixWorld(); b.updateMatrixWorld();
    const result = evaluator.evaluate(a, b, CSG.SUBTRACTION);
    assert.ok(result.geometry.attributes.position.count > 36,
      'the machined board has faces after subtraction');
    assert.ok(result.geometry.attributes.normal.count > 0);
  }
});
