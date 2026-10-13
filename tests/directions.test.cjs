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
for (const name of ['routeObstaclePenalty','aStar2','clearStraightGridRun','simplifyGridCellsToWaypoints','normalizeRoutePoints','headingDeg','signedTurn','segLen','compressDirectionPoints','humanTurn','formatMeters','buildDirections']) vm.runInContext(extract(name),ctx);
vm.runInContext("function cellToWorld(c,r){return {x:c,y:r};} function estimateMetersPerUnit(){return 1;} function nearestStallLabel(){return null;} function destinationSideHint(){return 'straight ahead';} function capitalise(s){return s.charAt(0).toUpperCase()+s.slice(1);}",ctx);
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

// A clear horizontal aisle must not get staircase turns just to avoid walls
// that are ALREADY blocked with the required clearance.
const aCols=55,aRows=13,nearby=new Uint8Array(aCols*aRows);
for(let x=9;x<=20;x++)nearby[3*aCols+x]=1;
for(let x=28;x<=40;x++)nearby[5*aCols+x]=1;
const clearPath=[{x:3,y:4},...points(ctx.aStar2(3,4,50,4,nearby,aCols,aRows))];
const cleaned=points(ctx.simplifyGridCellsToWaypoints(clearPath,nearby,aCols,aRows));
assert.equal(cleaned.length,2,'unobstructed aisle is one straight segment');
assert.equal(cleaned[0].x,3);assert.equal(cleaned[0].y,4);
assert.equal(cleaned[1].x,50);assert.equal(cleaned[1].y,4);
const cleanSteps=points(ctx.buildDirections(cleaned,'10.13','10.03'));
assert.equal(cleanSteps.length,3);
assert.equal(cleanSteps[1].type,'straight');
assert.equal(cleanSteps[1].pathStartIndex,0);
assert.equal(cleanSteps[1].pathEndIndex,1);

// An actual blocked segment must preserve the detour and avoid diagonals.
const dogleg=[{x:2,y:4},{x:2,y:5},{x:3,y:5},{x:4,y:5},{x:5,y:5},{x:6,y:5},{x:6,y:4}];
const empty=new Uint8Array(100);
assert.equal(ctx.simplifyGridCellsToWaypoints(dogleg,empty,10,10).length,2);
const blocked=new Uint8Array(100);blocked[4*10+4]=1;
const safe=points(ctx.simplifyGridCellsToWaypoints(dogleg,blocked,10,10));
assert.ok(safe.length>=4);
assert.equal(ctx.clearStraightGridRun({x:2,y:4},{x:6,y:4},blocked,10,10),false);
for(let i=1;i<safe.length;i++) {
  assert.ok(safe[i-1].x===safe[i].x||safe[i-1].y===safe[i].y);
  assert.equal(ctx.clearStraightGridRun(safe[i-1],safe[i],blocked,10,10),true);
}

console.log('PASS: straight aisles, safe doglegs, direction steps and obstacles');
