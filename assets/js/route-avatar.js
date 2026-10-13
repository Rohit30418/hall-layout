/* Deterministic route preview sampler — no GPS, geolocation, or network calls.
   Route geometry belongs to the hall's existing walkability/pathfinder engine. */
(function(root) {
  'use strict';
  function buildPath(points) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const clean = [];
    for (const p of points) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      if (!clean.length || Math.hypot(p.x - clean[clean.length - 1].x, p.y - clean[clean.length - 1].y) > 0.00001) {
        clean.push({x:p.x,y:p.y, originalIndex:clean.length ? p._routeIndex ?? -1 : 0});
      }
    }
    if (clean.length < 2) return null;
    // Distances are recorded against original vertices, even across coincident
    // points, because each direction step stores original path indices.
    const cumulative = [0], vertices = [points[0]];
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i];
      const leg = Math.hypot(b.x - a.x, b.y - a.y);
      if (!Number.isFinite(leg)) return null;
      length += leg;
      cumulative.push(length);
      vertices.push({x:b.x,y:b.y});
    }
    if (length <= 0.00001) return null;
    return Object.freeze({points:vertices, cumulative, total:length});
  }
  function clamp(value, lo, hi) {
    return Math.max(lo,Math.min(hi,Number.isFinite(value) ? value : lo));
  }
  function sample(path, distance) {
    if (!path || !Number.isFinite(path.total) || path.total <= 0) return null;
    const d=clamp(distance,0,path.total), ps=path.points, ls=path.cumulative;
    let i=1;
    while (i<ls.length-1 && ls[i]<d) i++;
    // Skip zero-length legs and use the nearest forward direction.
    while (i<ls.length-1 && ls[i]-ls[i-1]<0.00001) i++;
    let a=ps[i-1],b=ps[i],len=ls[i]-ls[i-1];
    if (len<=0.00001) {
      for(let j=ls.length-1;j>=1;j--) if(ls[j]-ls[j-1]>0.00001) {
        a=ps[j-1];b=ps[j];len=ls[j]-ls[j-1];i=j;break;
      }
    }
    const t=len>0?clamp((d-ls[i-1])/len,0,1):0;
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
      heading:Math.atan2(b.y-a.y,b.x-a.x),segment:i-1,progress:d/path.total};
  }
  function durationFor(path) {
    // A 12-35s preview depending on geometry length; not real walking ETA.
    return path ? clamp(path.total/32,12,35) : 0;
  }
  function stepAtDistance(path,steps,distance) {
    if (!path || !Array.isArray(steps) || !steps.length) return 0;
    const d=clamp(distance,0,path.total);
    if (d>=path.total-0.00001) return steps.length-1;
    for(let i=0;i<steps.length;i++){
      const step=steps[i];
      if (!Number.isInteger(step.pathEndIndex)) continue;
      const end=path.cumulative[clamp(step.pathEndIndex,0,path.cumulative.length-1)];
      if (d<end-0.00001) return i;
    }
    return Math.max(0,steps.length-2);
  }
  const api=Object.freeze({buildPath,sample,durationFor,stepAtDistance});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.HallWalkPreview=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
