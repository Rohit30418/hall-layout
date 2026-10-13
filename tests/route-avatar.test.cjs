'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const avatar=require('../assets/js/route-avatar.js');

const EPS=1e-6;
function near(value,target){assert.ok(Math.abs(value-target)<EPS,String(value)+' should match '+String(target));}
test('walker follows routed polyline and rotates exactly at a 90 degree corner',()=>{
  const path=avatar.buildPath([{x:0,y:0},{x:0,y:10},{x:20,y:10}]);
  assert.ok(path);
  near(path.total,30);
  const a=avatar.sample(path,5);
  near(a.x,0);near(a.y,5);near(a.heading,Math.PI/2);
  const b=avatar.sample(path,15);
  near(b.x,5);near(b.y,10);near(b.heading,0);
  const c=avatar.sample(path,30);
  near(c.x,20);near(c.y,10);near(c.progress,1);
});
test('preview progress clamps at start/end and does not wrap through a stall',()=>{
  const p=avatar.buildPath([{x:3,y:5},{x:3,y:25},{x:9,y:25}]);
  const before=avatar.sample(p,-400);
  near(before.x,3);near(before.y,5);
  const after=avatar.sample(p,999999);
  near(after.x,9);near(after.y,25);
  near(after.progress,1);
  near(avatar.sample(p,NaN).progress,0);
});
test('zero-length and non-finite routes are rejected safely',()=>{
  assert.equal(avatar.buildPath(null),null);
  assert.equal(avatar.buildPath([]),null);
  assert.equal(avatar.buildPath([{x:1,y:2},{x:1,y:2}]),null);
  assert.equal(avatar.buildPath([{x:0,y:0},{x:Infinity,y:0}]),null);
  assert.equal(avatar.buildPath([{x:0,y:0},{x:NaN,y:0}]),null);
  assert.equal(avatar.sample(null,3),null);
});
test('repeated consecutive vertices do not produce NaN or wrong turns',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:0,y:0},{x:10,y:0},{x:10,y:0},{x:10,y:8}]);
  near(p.total,18);
  const a=avatar.sample(p,4);
  near(a.x,4);near(a.y,0);near(a.heading,0);
  const end=avatar.sample(p,18);
  near(end.x,10);near(end.y,8);
  assert.ok(Number.isFinite(end.heading));
});
test('preview selects matching direction on multi-turn and merged route sections',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:0,y:2},{x:0,y:20},{x:10,y:20}]);
  const steps=[
    {pathStartIndex:0,pathEndIndex:2},
    {pathStartIndex:2,pathEndIndex:3},
    {pathStartIndex:3,pathEndIndex:3}
  ];
  assert.equal(avatar.stepAtDistance(p,steps,1),0);
  assert.equal(avatar.stepAtDistance(p,steps,19),0);
  assert.equal(avatar.stepAtDistance(p,steps,22),1);
  assert.equal(avatar.stepAtDistance(p,steps,p.total),2);
});
test('preview duration bounded for very short and very long hall routes',()=>{
  const small=avatar.buildPath([{x:0,y:0},{x:1,y:0}]);
  const large=avatar.buildPath([{x:0,y:0},{x:5000,y:0}]);
  assert.equal(avatar.durationFor(small),12);
  assert.equal(avatar.durationFor(large),35);
});
test('preview UI remains optional, voice remains, and both map modes use same route',()=>{
  const base=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(base,'ViewhallLayout.html'),'utf8');
  const app=fs.readFileSync(path.join(base,'assets/js/app.js'),'utf8');
  const css=fs.readFileSync(path.join(base,'assets/css/navigation-polish.css'),'utf8');
  assert.ok(html.includes('id="btnWalkPreview"'));
  assert.ok(html.includes('id="btnWalkRestart"'));
  assert.ok(html.includes('id="walkPreviewProgress"'));
  assert.ok(html.includes('id="btnVoiceGuide"'));
  assert.ok(!html.includes('id="btnPrevStep"'));
  assert.ok(!html.includes('id="btnNextStep"'));
  assert.ok(html.indexOf('route-avatar.js?v=walk-preview-v7')<html.indexOf('app.js?v=avatar-mascot-v8'));
  assert.ok(css.includes('#nav-drawer .walk-preview-play'));
  assert.ok(app.includes('function drawWalkPreviewAvatar2d()'));
  assert.ok(app.includes('function updateWalkPreviewAvatar3(now)'));
  assert.ok(app.includes('advanceWalkPreview(performance.now())'));
  assert.ok(app.includes("if (currentView === '3d') advanceWalkPreview(now)"));
  assert.ok(app.includes('prepareWalkPreview(pts)'));
  assert.ok(app.includes('prepareWalkPreview(worldPts)'));
  assert.ok(app.includes('function toggleWalkPreview()'));
  assert.ok(app.includes('function restartWalkPreview()'));
  assert.ok(app.includes('clearWalkPreview();'));
  assert.ok(app.includes('pauseWalkPreview();'));
});


test('2D mascot has depth and keeps body upright through turns',()=>{
  const base=path.join(__dirname,'..');
  const app=fs.readFileSync(path.join(base,'assets/js/app.js'),'utf8');
  const start=app.indexOf('function drawWalkPreviewAvatar2d() {');
  const end=app.indexOf('function updateWalkPreviewAvatar3(now)',start);
  assert.ok(start>=0 && end>start);
  const code=app.slice(start,end);
  assert.ok(code.includes('ctx.createLinearGradient('));
  assert.ok(code.includes('ctx.createRadialGradient('));
  assert.ok(code.includes('ctx.ellipse('));
  assert.ok(code.includes('ctx.scale(0.82, 0.82)'));
  assert.ok(code.includes('ctx.rotate(pos.heading)'), 'small direction marker tracks route');
  assert.ok(!code.includes('ctx.rotate(pos.heading+Math.PI/2)'), 'person stays upright on turns');
  assert.ok(!code.includes('ctx.arc(0,0,21'), 'large old halo removed');
  assert.ok(code.includes('walkPreviewPlaying'), 'limbs animate during playback');
});
