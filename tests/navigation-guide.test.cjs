'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enhanceSteps } = require('../assets/js/navigation-guide.js');

function sample() {
  const pts = [{x:0,y:0},{x:2,y:0},{x:2,y:20},{x:20,y:20}];
  const steps = [
    {type:'start',pathStartIndex:0,pathEndIndex:0},
    {type:'straight',main:'Walk 2 m',pathStartIndex:0,pathEndIndex:1},
    {type:'left',main:'Turn left and walk 20 m',sub:'Near stall 10.37',pathStartIndex:1,pathEndIndex:2},
    {type:'right',main:'Turn right and walk 18 m',pathStartIndex:2,pathEndIndex:3},
    {type:'end',pathStartIndex:3,pathEndIndex:3}
  ];
  return {pts,steps};
}

test('one short approach is merged with the following explicit turn', () => {
  const {pts,steps} = sample();
  const result = enhanceSteps(steps,pts,1);
  assert.equal(result.length,4);
  assert.match(result[1].main,/Walk 2 m, then turn left and walk 20 m/);
  assert.equal(result[1].pathStartIndex,0);
  assert.equal(result[1].pathEndIndex,2);
  assert.equal(result[1].sub,'Near stall 10.37');
  assert.equal(result[1].turnsCount,1);
  assert.equal(steps.length,5);
});

test('two turns are both retained when the first movement is short', () => {
  const {pts,steps} = sample();
  steps[1].type='right';
  const merged=enhanceSteps(steps,pts,1);
  assert.match(merged[1].main,/Turn right and walk 2 m, then turn left and walk 20 m/);
  assert.equal(merged[1].turnsCount,2);
  assert.equal(merged[1].pathEndIndex,2);
});

test('necessary U-turns are never merged away', () => {
  const pts=[{x:0,y:0},{x:2,y:0},{x:0,y:0}];
  const steps=[
    {type:'start',pathStartIndex:0,pathEndIndex:0},
    {type:'straight',pathStartIndex:0,pathEndIndex:1},
    {type:'uturn',pathStartIndex:1,pathEndIndex:2},
    {type:'end',pathStartIndex:2,pathEndIndex:2}
  ];
  const result=enhanceSteps(steps,pts,1);
  assert.equal(result.length,4);
  assert.equal(result[2].turnsCount,1);
});

test('long legs are not combined and all route indices remain unchanged', () => {
  const {pts,steps}=sample();
  const result=enhanceSteps(steps,pts,3);
  assert.equal(result.length,5);
  assert.equal(result[1].pathStartIndex,0);
  assert.equal(result[1].pathEndIndex,1);
  assert.equal(result[2].pathStartIndex,1);
});

test('enhancer handles unavailable route safely', () => {
  assert.deepEqual(enhanceSteps([],[],1),[]);
  assert.equal(enhanceSteps(null,[],1),null);
});

test('page loads the guide before app.js and exposes voice controls', () => {
  const html=fs.readFileSync(path.join(__dirname,'../ViewhallLayout.html'),'utf8');
  assert.ok(html.includes('id="btnVoiceGuide"'));
  assert.ok(html.includes('id="btnRepeatStep"'));
  assert.ok(html.indexOf('assets/js/navigation-guide.js') < html.indexOf('assets/js/app.js'));
  const app=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');
  assert.ok(app.includes('window.HallNavGuide.enhanceSteps'));
  assert.ok(app.includes("container.replaceChildren()"));
  assert.ok(app.includes('for (let i = start + 1; i <= end; i++) ctx.lineTo'));
  assert.ok(app.includes('window.speechSynthesis.cancel()'));
});
