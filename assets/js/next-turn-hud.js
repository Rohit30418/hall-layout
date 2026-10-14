/* Next-turn route preview HUD.
   Pure route math, no GPS, sensors, network or speculative instructions. */
(function (root) {
  'use strict';
  function buildTurns(path) {
    if (!path || !Array.isArray(path.points) || !Array.isArray(path.cumulative) || path.points.length < 3) return [];
    const turns=[];
    const points=path.points, distances=path.cumulative;
    for (let i=1; i<points.length-1; i++) {
      const before=distances[i]-distances[i-1];
      if (before <= 0.00001) continue;
      let next=i+1;
      while(next<points.length && distances[next]-distances[i]<=0.00001) next++;
      if(next>=points.length)continue;
      const a=points[i-1],b=points[i],c=points[next];
      const abx=b.x-a.x,aby=b.y-a.y,bcx=c.x-b.x,bcy=c.y-b.y;
      const dot=abx*bcx+aby*bcy,cross=abx*bcy-aby*bcx;
      const angle=Math.atan2(cross,dot)*180/Math.PI;
      const abs=Math.abs(angle);
      // Identical convention to buildDirections' humanTurn(): 25° for a turn,
      // 155° for a U-turn, y-axis positive downward.
      if(abs<25)continue;
      const type=abs>=155?'uturn':angle>0?'right':'left';
      turns.push(Object.freeze({distance:distances[i],type,index:i}));
    }
    return turns;
  }
  function atDistance(path,turns,distance,metresPerUnit,destination='') {
    if (!path || !(path.total>0)) return null;
    const d=Math.max(0,Math.min(path.total,Number.isFinite(distance)?distance:0));
    const unit=Number.isFinite(metresPerUnit)&&metresPerUnit>0?metresPerUnit:1;
    const place=String(destination || 'your destination').trim() || 'your destination';
    if(d>=path.total-0.00001) {
      return {type:'arrived',title:'You have arrived',distanceText:'',detail:place,announcement:'You have arrived at '+place};
    }
    const next=Array.isArray(turns)?turns.find(t=>t.distance>d+0.00001):null;
    if(next) {
      const remain=Math.max(0,(next.distance-d)*unit);
      const metres=Math.ceil(remain);
      const now=remain<=1;
      const name=next.type==='uturn'?'Turn around':next.type==='right'?'Turn right':'Turn left';
      return {type:next.type,title:name,distanceText:now?'Now':'In '+metres+' m',
        detail: 'Follow the highlighted route',
        announcement: now?name+' now':name+' in '+metres+' metres',
        eventKey: next.index};
    }
    const remain=Math.ceil(Math.max(0,(path.total-d)*unit));
    return {type:'destination',title:'Destination ahead',distanceText:remain<=1?'Almost there':'In '+remain+' m',
      detail:place,announcement:'Continue to '+place,eventKey:'end'};
  }
  const helper=Object.freeze({buildTurns,atDistance});
  if(typeof module==='object'&&module.exports)module.exports=helper;
  if(root)root.HallNextTurnHud=helper;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null);
