'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const mobile=require('../assets/js/mobile-navigation.js');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const epsilon=1e-6;
const close=(a,b)=>assert.ok(Math.abs(a-b)<epsilon,a+' differs from '+b);

test('safe visible map area respects bottom sheet on phone-sized screens',()=>{
  for(const [w,h,sheet] of [[390,780,218],[360,620,205],[768,820,300],[320,500,175]]){
    const rect=mobile.safeViewport(w,h,sheet);
    assert.ok(rect.left>=0&&rect.right<=w);
    assert.ok(rect.top>=0&&rect.bottom<=h-sheet-28+1);
    assert.ok(rect.bottom>rect.top);
  }
});
test('route bounding box fits within usable upper map viewport',()=>{
  const canvas={width:390,height:780}, cam={x:0,y:0,zoom:1};
  const points=[{x:0,y:0},{x:0,y:180},{x:230,y:180}];
  assert.equal(mobile.fitRoute(points,cam,canvas,218),true);
  const bounds=mobile.safeViewport(canvas.width,canvas.height,218);
  for(const p of points){
    const x=(p.x-cam.x)*cam.zoom+canvas.width/2;
    const y=(p.y-cam.y)*cam.zoom+canvas.height/2;
    assert.ok(x>=bounds.left-1&&x<=bounds.right+1,'walker x remains visible');
    assert.ok(y>=bounds.top-1&&y<=bounds.bottom+1,'walker y remains visible above sheet');
  }
});
test('walker follow pans only enough to keep point on screen, never changes route',()=>{
  const cam={x:0,y:0,zoom:1},canvas={width:390,height:780},p={x:30,y:420};
  const before={...p};
  assert.equal(mobile.followPoint(p,cam,canvas,280,true),true);
  close(p.x,before.x);close(p.y,before.y);
  const view=mobile.safeViewport(canvas.width,canvas.height,280);
  const sy=(p.y-cam.y)*cam.zoom+canvas.height/2;
  assert.ok(sy<=view.bottom+epsilon);
  assert.equal(mobile.followPoint(p,cam,canvas,280,true),false);
});
test('invalid geometry is skipped safely',()=>{
  assert.equal(mobile.fitRoute([],{}, {width:400,height:800},150),false);
  assert.equal(mobile.fitRoute([{x:0,y:0},{x:NaN,y:5}],{x:0,y:0,zoom:1},{width:400,height:800},150),false);
  assert.equal(mobile.followPoint({x:0,y:0},{x:0,y:0,zoom:0},{width:400,height:800},150),false);
});
test('mobile page keeps voice, walking preview and accessible full-step expansion',()=>{
  const html=read('ViewhallLayout.html');
  const css=read('assets/css/mobile-navigation.css');
  const app=read('assets/js/app.js');
  const js=read('assets/js/mobile-navigation.js');
  assert.match(html,/id="btnMobileStepsToggle"/);
  assert.match(html,/aria-expanded="false"/);
  assert.match(html,/aria-controls="drawerSteps"/);
  assert.match(html,/id="mobileNavCurrentText"/);
  assert.match(html,/id="mobileNavStepCounter"/);
  assert.match(html,/id="btnVoiceGuide"/);
  assert.match(html,/id="btnWalkPreview"/);
  assert.match(html,/id="btnWalkRestart"/);
  assert.match(html,/mobile-navigation.css\?v=mobile-sheet-v1/);
  assert.match(html,/mobile-navigation.js\?v=mobile-sheet-v1/);
  assert.ok(html.indexOf('mobile-navigation.js')>html.indexOf('app.js'));
  assert.match(css,/#nav-drawer\.mobile-expanded\.steps-expanded \.drawer-steps/);
  assert.match(css,/body\.mobile-nav-open \.zoom-controls/);
  assert.match(css,/body\.mobile-nav-open #nav-fab/);
  assert.match(app,/HallMobileNavigation\.frame\(pts, cam2, canvas2d\)/);
  assert.match(app,/HallMobileNavigation\.follow\(walker, cam2, canvas2d\)/);
  assert.match(app,/HallMobileNavigation\.syncStep/);
  assert.match(js,/setExpanded\(delta<0\)/);
});
