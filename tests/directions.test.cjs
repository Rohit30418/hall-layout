const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(require('node:path').join(__dirname, '../assets/js/app.js'), 'utf8');
function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0);
  const brace = src.indexOf(') {', start) + 2;
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw Error('Invalid function: ' + name);
}
const ctx = { console, Math, Float64Array, Int32Array, Uint8Array };
vm.createContext(ctx);
for (const name of ['routeObstaclePenalty','aStar2','normalizeRoutePoints','headingDeg','signedTurn','segLen','compressDirectionPoints','humanTurn','formatMeters','buildDirections']) vm.runInContext(extract(name),ctx);
vm.runInContext("function estimateMetersPerUnit(){return 1;} function nearestStallLabel(){return null;} function destinationSideHint(){return 'straight ahead';} function capitalise(s){return s.charAt(0).toUpperCase()+s.slice(1);}",ctx);
function points(p){return JSON.parse(JSON.stringify(p));}
function turnCount(ps){let n=0;for(let i=2;i<ps.length;i++)if(Math.abs(ctx.signedTurn(ctx.headingDeg(ps[i-2],ps[i-1]),ctx.headingDeg(ps[i-1],ps[i])))>25)n++;return n;}
const zig=points(ctx.compressDirectionPoints([{x:0,y:0},{x:8,y:0},{x:8,y:2},{x:8,y:18},{x:30,y:18}]));
const steps=points(ctx.buildDirections(zig,'A','B'));
assert.equal(zig.length,4);
assert.equal(steps.length,zig.length+1);
assert.equal(steps[2].type,'right');
assert.equal(steps[2].pathStartIndex,1);
assert.equal(steps[2].pathEndIndex,2);
assert.equal(steps[3].type,'left');
assert.equal(ctx.normalizeRoutePoints([{x:0,y:0},{x:10,y:0},{x:5,y:0}]).length,3);
assert.equal(ctx.normalizeRoutePoints([{x:0,y:0},{x:5,y:0},{x:10,y:0}]).length,2);
const cols=30,rows=18,blank=new Uint8Array(cols*rows);
const straight=points(ctx.aStar2(2,2,22,2,blank,cols,rows));
assert.equal(straight.length,20);
assert.equal(turnCount([{x:2,y:2},...straight]),0);
const oneBend=points(ctx.aStar2(2,2,24,15,blank,cols,rows));
assert.equal(turnCount([{x:2,y:2},...oneBend]),1);
const maze=new Uint8Array(cols*rows);for(let y=0;y<15;y++)maze[y*cols+13]=1;
const detour=points(ctx.aStar2(2,3,24,3,maze,cols,rows));
assert.ok(detour.length>0);let prev={x:2,y:3};
for(const p of detour){assert.equal(maze[p.y*cols+p.x],0);assert.equal(Math.abs(p.x-prev.x)+Math.abs(p.y-prev.y),1);prev=p;}
assert.equal(prev.x,24);assert.equal(prev.y,3);
console.log('PASS: route geometry, direction indexing and obstacle tests');
