'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enhanceSteps } = require('../assets/js/navigation-guide.js');

function mock() {
  const pts = [{x:0,y:0},{x:2,y:0},{x:2,y:20},{x:20,y:20}];
  const steps = [
    {type:'start',main:'Start at 10.37',pathStartIndex:0,pathEndIndex:0},
    {type:'straight',main:'Go forward 2 m',pathStartIndex:0,pathEndIndex:1},
    {type:'left',main:'Turn left 20 m',sub:'Near stall 10.15',pathStartIndex:1,pathEndIndex:2},
    {type:'right',main:'Turn right 18 m',pathStartIndex:2,pathEndIndex:3},
    {type:'end',main:'10.08 is on your right',pathStartIndex:3,pathEndIndex:3}
  ];
  return {pts,steps};
}

test('origin is not a separate instruction, short approach keeps its turn', () => {
  const {pts,steps}=mock();
  const simplified=enhanceSteps(steps,pts,1);
  assert.equal(simplified.length,3);
  assert.equal(simplified[0].main,'Join the aisle, then turn left · 20 m');
  assert.equal(simplified[0].pathStartIndex,0);
  assert.equal(simplified[0].pathEndIndex,2);
  assert.equal(simplified[0].turnsCount,1);
  assert.equal(simplified[0].sub,'Near stall 10.15');
  assert.equal(simplified[1].main,'Turn right · 18 m');
  assert.equal(simplified[1].pathStartIndex,2);
  assert.equal(simplified[1].pathEndIndex,3);
  assert.equal(simplified[2].main,'Look for stall 10.08');
  assert.equal(simplified[2].pathStartIndex,3);
  assert.equal(steps.length,5,'source not mutated');
});

test('two consecutive required turns remain counted and spoken', () => {
  const {pts,steps}=mock();
  steps[1].type='right';
  const simplified=enhanceSteps(steps,pts,1);
  assert.equal(simplified.length,3);
  assert.equal(simplified[0].main,'Turn right, then turn left · 20 m');
  assert.match(simplified[0].spoken,/Turn right, then turn left/);
  assert.equal(simplified[0].turnsCount,2);
  assert.equal(simplified.reduce((sum,x)=>sum+(x.turnsCount||0),0),3);
});

test('last 1-3 m entrance movement is folded into arrival, without erasing turn', () => {
  const pts=[{x:0,y:0},{x:0,y:12},{x:22,y:12},{x:22,y:14}];
  const steps=[
    {type:'start',main:'Start at 10.37',pathStartIndex:0,pathEndIndex:0},
    {type:'straight',pathStartIndex:0,pathEndIndex:1},
    {type:'left',pathStartIndex:1,pathEndIndex:2},
    {type:'right',pathStartIndex:2,pathEndIndex:3},
    {type:'end',main:'10.08 is straight ahead',pathStartIndex:3,pathEndIndex:3}
  ];
  const out=enhanceSteps(steps,pts,1);
  assert.equal(out.length,3);
  assert.equal(out[0].main,'Follow the aisle · 12 m');
  assert.equal(out[1].main,'Turn left · 22 m');
  assert.equal(out[2].main,'Turn right to stall 10.08');
  assert.equal(out[2].type,'end');
  assert.equal(out[2].turnsCount,1);
  assert.equal(out[2].pathStartIndex,2);
  assert.equal(out[2].pathEndIndex,3);
  assert.equal(out.reduce((n,x)=>n+(x.turnsCount||0),0),2);
});

test('never omit a U-turn, even for a short move', () => {
  const pts=[{x:0,y:0},{x:2,y:0},{x:0,y:0}];
  const steps=[
    {type:'start',main:'Start at A',pathStartIndex:0,pathEndIndex:0},
    {type:'straight',pathStartIndex:0,pathEndIndex:1},
    {type:'uturn',pathStartIndex:1,pathEndIndex:2},
    {type:'end',main:'B is ahead',pathStartIndex:2,pathEndIndex:2}
  ];
  const out=enhanceSteps(steps,pts,1);
  assert.equal(out.length,3);
  assert.equal(out[1].type,'uturn');
  assert.equal(out[1].turnsCount,1);
});

test('long first segment is still displayed; short merging is not overused', () => {
  const {pts,steps}=mock();
  const out=enhanceSteps(steps,pts,3);
  assert.equal(out.length,4);
  assert.equal(out[0].main,'Follow the aisle · 6 m');
  assert.equal(out[0].pathStartIndex,0);
  assert.equal(out[0].pathEndIndex,1);
  assert.equal(out[1].pathStartIndex,1);
});

test('two-step straight route does not invent turns or arrival confirmation', () => {
  const pts=[{x:0,y:0},{x:30,y:0}];
  const steps=[
    {type:'start',main:'Start at A',pathStartIndex:0,pathEndIndex:0},
    {type:'straight',pathStartIndex:0,pathEndIndex:1},
    {type:'end',main:'B is straight ahead',pathStartIndex:1,pathEndIndex:1}
  ];
  const out=enhanceSteps(steps,pts,1);
  assert.equal(out.length,2);
  assert.equal(out[0].main,'Follow the aisle · 30 m');
  assert.equal(out[1].main,'Look for stall B');
  assert.equal(out.reduce((n,x)=>n+(x.turnsCount||0),0),0);
});

test('no route or unavailable guide inputs fail safely', () => {
  assert.deepEqual(enhanceSteps([],[],1),[]);
  assert.equal(enhanceSteps(null,[],1),null);
});

test('directions panel keeps a single optional voice button and clickable instructions', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root,'ViewhallLayout.html'),'utf8');
  const app = fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
  const css = fs.readFileSync(path.join(root,'assets/css/navigation-polish.css'),'utf8');
  const ui = fs.readFileSync(path.join(root,'assets/js/ui-wow.js'),'utf8');
  for(const id of ['nav-drawer','drawerSteps','navDrawerFrom','navDrawerTo','drawerStepCount','drawerSummaryText','btnVoiceGuide','voiceGuideStatus']) {
    assert.ok(html.includes('id="' + id + '"'), 'important route element: ' + id);
  }
  for(const id of ['btnRepeatStep','btnToggleRouteSteps','btnPrevStep','btnNextStep','navNowTitle','navStepCounter']) {
    assert.ok(!html.includes('id="' + id + '"'), 'removed extra control: ' + id);
  }
  assert.ok(html.includes('id="drawerSteps" aria-label="Walking instructions"'));
  assert.ok(html.includes('navigation-polish.css?v=walk-preview-v7'));
  assert.ok(html.includes('aria-pressed="false"'));
  assert.ok(html.includes('onclick="toggleVoiceGuidance()"'));
  assert.ok(html.includes('class="drawer-voice-btn"'));
  assert.ok(html.includes('role="status" aria-live="polite"'));
  assert.ok(html.includes('app.js?v=round-avatar-v9'));
  assert.ok(html.includes('ui-wow.js?v=minimal-v5'));
  assert.ok(html.indexOf('assets/js/navigation-guide.js') < html.indexOf('assets/js/app.js'));
  assert.ok(app.includes('function setNavStep(index)'));
  assert.ok(app.includes('el.addEventListener(\'click\', () => setNavStep(idx))'));
  assert.ok(app.includes('window.HallNavGuide.enhanceSteps'));
  assert.ok(app.includes("'fa-arrow-right' : 'fa-arrow-left'"), 'turn icons still work');
  assert.ok(app.includes('for (let i = start + 1; i <= end; i++) ctx.lineTo'), 'highlight actual route');
  assert.ok(app.includes('function toggleVoiceGuidance()'));
  assert.ok(app.includes('function readSelectedNavStep()'));
  assert.ok(app.includes('function stopNavVoice()'));
  assert.ok(app.includes('voiceGuidanceOn = false'));
  assert.ok(app.includes('readSelectedNavStep();'));
  assert.ok(app.includes('window.speechSynthesis.cancel()'));
  assert.ok(css.includes('#nav-drawer .drawer-voice-btn'));
  assert.ok(!html.includes('id="btnRepeatStep"'));
  assert.ok(!html.includes('id="btnNextStep"'));
  assert.ok(!html.includes('id="btnPrevStep"'));
  assert.ok(!html.includes('id="btnToggleRouteSteps"'));
  assert.ok(!app.includes('routeStepsExpanded'));
  assert.ok(!app.includes("getElementById('btnNextStep')"));
  assert.ok(css.includes('.expo-sponsor-strip { display:none !important; }'));
  assert.ok(css.includes('#nav-drawer.steps-expanded .drawer-steps'));
  assert.ok(ui.includes('mapTopChips'));
  assert.ok(ui.includes('data-action="route"'));
  assert.ok(ui.includes('data-action="fit"'));
  assert.ok(!ui.includes('data-action="available"'));
  assert.ok(!ui.includes('data-action="booked"'));
  assert.ok(!ui.includes('data-action="total"'));
  assert.ok(!ui.includes('document.body.appendChild(strip)'));
  assert.ok(ui.includes("if (typeof hasActiveRoute === 'function' && hasActiveRoute())"));
});
