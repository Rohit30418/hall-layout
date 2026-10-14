'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const avatar=require('../assets/js/route-avatar.js');
const hud=require('../assets/js/next-turn-hud.js');
const base=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');

test('real route corners produce matching left/right directions without metres',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:170,y:80}]);
  const turns=hud.buildTurns(p);
  assert.deepEqual(turns.map(x=>x.type),['right','left']);
  assert.deepEqual(turns.map(x=>x.distance),[100,180]);
  let item=hud.atDistance(p,turns,88,'ACME Exhibitor');
  assert.equal(item.title,'Turn right ahead');
  assert.equal(item.phase,'ahead');
  item=hud.atDistance(p,turns,99.5,'ACME Exhibitor');
  assert.equal(item.title,'Turn right now');
  assert.equal(item.phase,'now');
  item=hud.atDistance(p,turns,100,'ACME Exhibitor');
  assert.equal(item.title,'Turn left ahead');
  assert.equal(item.phase,'ahead');
});

test('turn detection ignores duplicate vertices and near-straight jitter',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:100,y:0},{x:100,y:0},{x:120,y:1},{x:120,y:81}]);
  const turns=hud.buildTurns(p);
  assert.deepEqual(turns.map(x=>x.type),['right']);
  assert.ok(Math.abs(turns[0].distance-Math.hypot(20,1)-100)<0.00001);
});

test('U-turn is never misreported as left or right',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:70,y:0},{x:0,y:0}]);
  const turns=hud.buildTurns(p);
  assert.deepEqual(turns.map(x=>x.type),['uturn']);
  assert.equal(hud.atDistance(p,turns,50,'Stall 8').title,'Turn around ahead');
  assert.equal(hud.atDistance(p,turns,69,'Stall 8').title,'Turn around now');
});

test('HUD does not require a metre conversion or leak measured values into announcements',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:100,y:0},{x:100,y:50}]);
  const turns=hud.buildTurns(p);
  const result=hud.atDistance(p,turns,76,'Company B');
  assert.equal(result.title,'Turn right ahead');
  assert.equal(result.announcement,'Turn right ahead');
  assert.ok(!('distanceText' in result));
  assert.ok(!/metres|\bin\s+\d+\s*m\b/i.test(result.title+' '+result.announcement));
});

test('straight-only routes approach the destination and then arrive',()=>{
  const p=avatar.buildPath([{x:0,y:0},{x:100,y:0}]);
  const turns=hud.buildTurns(p);
  assert.equal(turns.length,0);
  const atStart=hud.atDistance(p,turns,0,'EBM-PAPST India');
  assert.equal(atStart.title,'Continue straight');
  assert.equal(atStart.detail,'Follow the blue route');
  const near=hud.atDistance(p,turns,95,'EBM-PAPST India');
  assert.equal(near.title,'Destination ahead');
  assert.equal(near.detail,'EBM-PAPST India');
  const end=hud.atDistance(p,turns,p.total,'EBM-PAPST India');
  assert.equal(end.title,'You have arrived');
  assert.equal(end.detail,'EBM-PAPST India');
});

test('no route or invalid preview inputs fail safely',()=>{
  assert.deepEqual(hud.buildTurns(null),[]);
  assert.equal(hud.atDistance(null,[],0,'Company'),null);
  const p=avatar.buildPath([{x:0,y:0},{x:20,y:0}]);
  assert.equal(hud.atDistance(p,[],NaN,'').title,'Continue straight');
});

test('HUD and directions UI hide measurements, but retain controls and voice',()=>{
  const html=read('ViewhallLayout.html'),app=read('assets/js/app.js');
  const css=read('assets/css/next-turn-hud.css');
  const guide=read('assets/js/navigation-guide.js');
  assert.ok(html.includes('id="nextTurnHud"'));
  assert.ok(html.includes('id="nextTurnHudAnnounce"'));
  assert.ok(!html.includes('id="nextTurnHudDistance"'));
  assert.ok(html.includes('next-turn-hud.css?v=direction-only-v2'));
  assert.ok(html.includes('next-turn-hud.js?v=direction-only-v2'));
  assert.ok(html.indexOf('next-turn-hud.js')<html.indexOf('app.js?v=direction-only-v2'));
  assert.ok(html.includes('navigation-guide.js?v=direction-only-v2'));
  assert.ok(css.includes('@media (max-width:768px)'));
  assert.ok(css.includes('pointer-events:none'));
  assert.ok(!css.includes('.next-turn-hud-distance'));
  assert.ok(app.includes('window.HallNextTurnHud.buildTurns(walkPreviewPath)'));
  assert.ok(app.includes('function syncNextTurnHud(force = false)'));
  assert.ok(app.includes('syncNextTurnHud(force);'));
  assert.ok(app.includes('syncNextTurnHud(true);'));
  assert.ok(app.includes('nextTurnHudEvents = [];'));
  assert.ok(app.includes('navStepsData[navStepsData.length-1]'));
  assert.ok(app.includes("document.getElementById('drawerStepCount').textContent   = 'Walking route'"));
  assert.ok(!app.includes(' estimated · '));
  assert.ok(!app.includes("['nextTurnHudDistance'"));
  assert.ok(!guide.includes(" + metres + ' m'"));
  assert.ok(!guide.includes(" + metres + ' metres'"));
  assert.ok(html.includes('id="btnVoiceGuide"'));
});
