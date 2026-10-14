/* Hall cinematic route preview: geometry-only camera suggestions.
   Pure helper functions run in Node tests and browser without permissions. */
(function(root) {
  'use strict';
  const clamp=(n,low,high)=>Math.min(high,Math.max(low,n));
  const smooth=(a,b,t)=>{
    const x=clamp((t-a)/Math.max(1e-6,b-a),0,1);
    return x*x*(3-2*x);
  };
  function cornerDistances(path) {
    if (!path || !Array.isArray(path.points) || path.points.length<3 || !Array.isArray(path.cumulative)) return [];
    const result=[];
    for(let i=1;i<path.points.length-1;i++){
      const a=path.points[i-1],b=path.points[i],c=path.points[i+1];
      const abx=b.x-a.x,aby=b.y-a.y,bcx=c.x-b.x,bcy=c.y-b.y;
      const l1=Math.hypot(abx,aby),l2=Math.hypot(bcx,bcy);
      if (l1<0.01||l2<0.01)continue;
      const angle=Math.acos(clamp((abx*bcx+aby*bcy)/(l1*l2),-1,1))*180/Math.PI;
      if(angle>=48)result.push(Object.freeze({distance:path.cumulative[i],angle,index:i}));
    }
    return result;
  }
  function turnFocus(corners,distance,total){
    if(!Array.isArray(corners)||!Number.isFinite(distance)||!(total>0))return 0;
    const radius=clamp(total*0.085,22,95);
    let best=0;
    for(const c of corners){
      const delta=Math.abs(c.distance-distance);
      const weight=1-smooth(0,radius,delta);
      if(weight>best)best=weight;
    }
    return best;
  }
  function cameraTarget2d(path,corners,distance,baseZoom,canvas,viewport,sampler){
    if(!path||!(path.total>0)||!canvas||!viewport||typeof sampler!=='function')return null;
    const p=sampler(path,distance);
    if(!p)return null;
    const turn=turnFocus(corners,distance,path.total);
    const finish=smooth(0.86,1,distance/path.total);
    const mobile=canvas.width<=768;
    // Subtle dolly toward corners, then ease closer to the destination.
    // The cap avoids turning nearby stall labels into huge clipped blocks.
    const zoomCap=mobile?2.5:3.4;
    const zoom=clamp(baseZoom*(1.08+0.20*turn+0.10*finish),0.065,zoomCap);
    const lookahead=Math.min(45,Math.max(8,path.total*0.022));
    const ahead=sampler(path,Math.min(path.total,distance+lookahead));
    const lead=0.22;
    const targetWorld={x:p.x+(ahead.x-p.x)*lead,y:p.y+(ahead.y-p.y)*lead};
    const width=Math.max(1,canvas.width),height=Math.max(1,canvas.height);
    const left=clamp(viewport.left,0,width),right=clamp(viewport.right,left+1,width);
    const top=clamp(viewport.top,0,height),bottom=clamp(viewport.bottom,top+1,height);
    const targetScreenX=(left+right)/2,targetScreenY=(top+bottom)/2;
    return {x:targetWorld.x+(width/2-targetScreenX)/zoom,
      y:targetWorld.y+(height/2-targetScreenY)/zoom,zoom,turn,finish};
  }
  function easeCamera2d(cam,target,dt,reducedMotion=false){
    if(!cam||!target||!(cam.zoom>0))return false;
    const ms=clamp(Number.isFinite(dt)?dt:16,0,64);
    const ease=reducedMotion?1:(1-Math.exp(-ms/190));
    cam.x+=(target.x-cam.x)*ease;
    cam.y+=(target.y-cam.y)*ease;
    cam.zoom+=(target.zoom-cam.zoom)*ease;
    return true;
  }
  function cameraDolly3d(distance,total,corners){
    const turn=turnFocus(corners,distance,total);
    const arrival=smooth(.83,1,total>0?distance/total:0);
    return 1-0.16*turn-0.10*arrival;
  }
  const api=Object.freeze({cornerDistances,turnFocus,cameraTarget2d,easeCamera2d,cameraDolly3d});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.HallCinematicPreview=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
