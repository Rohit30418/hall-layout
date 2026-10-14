'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const avatar=require('../assets/js/route-avatar.js');
const hud=require('../assets/js/next-turn-hud.js');
const base=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');

test('actual route corners produce matching left/right turns with exact distances',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:170,y:80}]);
  const turns=hud.buildTurns(p);
  assert.deepEqual(turns.map(x=>x.type),['right','left']);
  assert.deepEqual(turns.map(x=>x.distance),[100,180]);
  let item=hud.atDistance(p,turns,88,1,'ACME Exhibitor');
  assert.equal(item.title,'Turn right');
  assert.equal(item.distanceText,'In 12 m');
  item=hud.atDistance(p,turns,99.5,1,'ACME Exhibitor');
  assert.equal(item.distanceText,'Now');
  item=hud.atDistance(p,turns,100,1,'ACME Exhibitor');
  assert.equal(item.title,'Turn left');
  assert.equal(item.distanceText,'In 80 m');
});

test('turn detection ignores duplicates and near-straight path jitter',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:100,y:0},{x:100,y:0},{x:120,y:1},{x:120,y:81}]);
  const turns=hud.buildTurns(p);
  assert.deepEqual(turns.map(x=>x.type),['right']);
  assert.ok(Math.abs(turns[0].distance-Math.hypot(20,1)-100)<0.00001);
});

test('sharp reversal becomes a U-turn, never a fictional left or right',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:70,y:0},{x:0,y:0}]);
  const turns=hud.buildTurns(p);
  assert.deepEqual(turns.map(x=>x.type),['uturn']);
  assert.equal(hud.atDistance(p,turns,50,1,'Stall 8').title,'Turn around');
});

test('distance converts from preview map units to estimated physical metres',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:100,y:0},{x:100,y:50}]);
  const turns=hud.buildTurns(p);
  const result=hud.atDistance(p,turns,76,0.5,'Company B');
  assert.equal(result.distanceText,'In 12 m');
  assert.equal(result.announcement,'Turn right in 12 metres');
});

test('straight-only routes show real destination, then arrival',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:100,y:0}]);
  const turns=hud.buildTurns(p);
  assert.equal(turns.length,0);
  const atStart=hud.atDistance(p,turns,0,1,'EBM-PAPST India');
  assert.equal(atStart.title,'Destination ahead');
  assert.equal(atStart.distanceText,'In 100 m');
  assert.equal(atStart.detail,'EBM-PAPST India');
  const end=hud.atDistance(p,turns,p.total,1,'EBM-PAPST India');
  assert.equal(end.title,'You have arrived');
  assert.equal(end.detail,'EBM-PAPST India');
});

test('new HUD is browser-independent and safe on null routes',()=>{
  assert.deepEqual(hud.buildTurns(null),[]);
  assert.equal(hud.atDistance(null,[],0,1,'Company'),null);
  const p=avatar.buildPath([{x:0,y:0},{x:20,y:0}]);
  assert.equal(hud.atDistance(p,[],NaN,0,'').distanceText,'In 20 m');
});

test('DOM overlay loads before app and cleans up on close, clear, pause and reset',()=>{
  const html=read('ViewhallLayout.html'),app=read('assets/js/app.js'),css=read('assets/css/next-turn-hud.css');
  assert.ok(html.includes('id="nextTurnHud"'));
  assert.ok(html.includes('id="nextTurnHudDistance"'));
  assert.ok(html.includes('id="nextTurnHudAnnounce"'));
  assert.ok(html.includes('next-turn-hud.css?v=turn-hud-v1'));
  assert.ok(html.includes('next-turn-hud.js?v=turn-hud-v1'));
  assert.ok(html.indexOf('next-turn-hud.js')<html.indexOf('app.js?v=turn-hud-v1'));
  assert.ok(css.includes('@media (max-width:768px)'));
  assert.ok(css.includes('pointer-events:none'));
  assert.ok(app.includes('window.HallNextTurnHud.buildTurns(walkPreviewPath)'));
  assert.ok(app.includes('function syncNextTurnHud(force = false)'));
  assert.ok(app.includes('syncNextTurnHud(force);'));
  assert.ok(app.includes('syncNextTurnHud(true);'));
  assert.ok(app.includes('nextTurnHudEvents = [];'));
  assert.ok(app.includes('navStepsData[navStepsData.length-1]'));
  assert.ok(app.includes('role')===false || !!html.includes('role="group"'));
});
