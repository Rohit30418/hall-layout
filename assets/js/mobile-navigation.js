/* Mobile hall navigation: map-first bottom sheet and route framing.
   The pure geometry helpers are exported for regression tests. */
(function (root) {
  'use strict';
  const mobile = () => !!root && (root.matchMedia ? root.matchMedia('(max-width: 768px)').matches : root.innerWidth <= 768);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function safeViewport(width,height,sheetHeight){
    const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1);
    const occupied=clamp(Number(sheetHeight)||0,0,h-100);
    const top=clamp(Math.round(h*0.12),52,92);
    const bottom=Math.max(top+45,h-occupied-28);
    return {left:36,right:Math.max(37,w-48),top,bottom};
  }
  function fitRoute(points,camera,canvas,sheetHeight){
    if(!Array.isArray(points)||points.length<2||!camera||!canvas)return false;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const p of points){
      if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
      minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
    }
    const box=safeViewport(canvas.width,canvas.height,sheetHeight);
    if(box.bottom-box.top<75||box.right-box.left<100)return false;
    const spanX=Math.max(40,maxX-minX),spanY=Math.max(40,maxY-minY);
    const zoom=Math.min(2.35,(box.right-box.left-40)/spanX,(box.bottom-box.top-36)/spanY);
    if(!Number.isFinite(zoom)||zoom<=0)return false;
    camera.zoom=Math.max(0.08,zoom);
    const targetX=(box.left+box.right)/2,targetY=(box.top+box.bottom)/2;
    camera.x=(minX+maxX)/2+(canvas.width/2-targetX)/camera.zoom;
    camera.y=(minY+maxY)/2+(canvas.height/2-targetY)/camera.zoom;
    return true;
  }
  function followPoint(point,camera,canvas,sheetHeight,instant=false){
    if(!point||!camera||!canvas||!Number.isFinite(point.x)||!Number.isFinite(point.y)||!(camera.zoom>0))return false;
    const box=safeViewport(canvas.width,canvas.height,sheetHeight);
    const sx=(point.x-camera.x)*camera.zoom+canvas.width/2;
    const sy=(point.y-camera.y)*camera.zoom+canvas.height/2;
    const dx=sx<box.left?sx-box.left:sx>box.right?sx-box.right:0;
    const dy=sy<box.top?sy-box.top:sy>box.bottom?sy-box.bottom:0;
    if(!dx&&!dy)return false;
    const ease=instant?1:0.16;
    camera.x+=dx/camera.zoom*ease;
    camera.y+=dy/camera.zoom*ease;
    return true;
  }
  const helper=Object.freeze({safeViewport,fitRoute,followPoint});
  if(typeof module==='object'&&module.exports)module.exports=helper;
  if(!root||!root.document)return;
  const doc=root.document;
  const sheet=()=>doc.getElementById('nav-drawer');
  const toggle=()=>doc.getElementById('btnMobileStepsToggle');
  const steps=()=>doc.getElementById('drawerSteps');
  // Cache the measured sheet height: the camera-follow loop runs every
  // animation frame, and reading offsetHeight each time can force reflow.
  let cachedHeight=0;
  const height=()=>mobile()&&sheet()?.classList.contains('open')?cachedHeight:0;
  function syncHeight(){
    if(!doc.body)return;
    const el=sheet();
    cachedHeight=mobile()&&el&&el.classList.contains('open')?el.offsetHeight:0;
    doc.body.style.setProperty('--mobile-nav-height',cachedHeight+'px');
  }
  function syncStep(step,index,total){
    const title=doc.getElementById('mobileNavCurrentText');
    const count=doc.getElementById('mobileNavStepCounter');
    if(title)title.textContent=step&&step.main?step.main:'Follow the blue route';
    if(count)count.textContent=total?'Step '+(index+1)+' of '+total:'';
  }
  function setExpanded(expanded){
    const el=sheet(),btn=toggle();
    if(!el)return;
    const show=mobile()&&!!expanded;
    el.classList.toggle('mobile-expanded',show);
    if(btn){
      btn.setAttribute('aria-expanded',String(show));
      const text=btn.querySelector('.mobile-nav-toggle-text');
      if(text)text.textContent=show?'Show map':'Show all directions';
      const icon=btn.querySelector('i');
      if(icon)icon.className='fa '+(show?'fa-chevron-down':'fa-chevron-up');
    }
    if(steps())steps().setAttribute('aria-hidden',mobile()&&!show?'true':'false');
    syncHeight();
    // Follow changes in layout dimensions without touching the actual path.
    root.requestAnimationFrame&&root.requestAnimationFrame(()=>{
      syncHeight();
      if(root.HallMobileNavigation.onLayoutChange)root.HallMobileNavigation.onLayoutChange();
    });
  }
  function toggleExpanded(){setExpanded(!sheet()?.classList.contains('mobile-expanded'));}
  function onOpen(){
    if(!mobile())return;
    doc.body.classList.add('mobile-nav-open');
    setExpanded(false);
  }
  function onClose(){
    doc.body.classList.remove('mobile-nav-open');
    setExpanded(false);
    syncHeight();
  }
  function frame(points,camera,canvas){
    if(!mobile()||!sheet()?.classList.contains('open'))return false;
    return fitRoute(points,camera,canvas,height());
  }
  function follow(point,camera,canvas,instant=false){
    if(!mobile()||!sheet()?.classList.contains('open'))return false;
    return followPoint(point,camera,canvas,height(),instant);
  }
  function init(){
    const el=sheet(),btn=toggle();
    if(!el||!btn)return;
    btn.addEventListener('click',()=>{if(Date.now()<(root.__mobileNavSwipeUntil||0))return;toggleExpanded();});
    btn.addEventListener('keydown',e=>{
      if(e.key==='ArrowUp'){e.preventDefault();setExpanded(true);}
      else if(e.key==='ArrowDown'){e.preventDefault();setExpanded(false);}
    });
    let startY=0,startX=0;
    btn.addEventListener('touchstart',e=>{
      if(e.touches.length!==1)return;
      startY=e.touches[0].clientY;startX=e.touches[0].clientX;
    },{passive:true});
    btn.addEventListener('touchend',e=>{
      if(e.changedTouches.length!==1)return;
      const delta=e.changedTouches[0].clientY-startY;
      const horizontal=Math.abs(e.changedTouches[0].clientX-startX);
      if(Math.abs(delta)>45&&Math.abs(delta)>horizontal*1.6){
        e.preventDefault();
        setExpanded(delta<0);
        root.__mobileNavSwipeUntil=Date.now()+300;
      }
    },{passive:false});
    if(root.ResizeObserver){
      const observer=new root.ResizeObserver(syncHeight);
      observer.observe(el);
    }
    root.addEventListener('resize',()=>{if(!mobile())onClose();syncHeight();});
    setExpanded(false);
  }
  const api={...helper,mobile,isActive:()=>mobile()&&!!sheet()?.classList.contains('open'),
    frame,follow,onOpen,onClose,syncStep,toggleExpanded,setExpanded,syncHeight,onLayoutChange:null};
  root.HallMobileNavigation=api;
  // Defer to DOM ready; no API requests, no additional render loop.
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
