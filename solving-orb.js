/* Solving orb geometry adapted from Thinking Orbs by Jakub Antalik.
 * MIT license: see licenses/thinking-orbs-MIT.txt. */
(() => {
  'use strict';
  const canvas = document.querySelector('.solving-orb');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = 64;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(size * dpr);
  const hash = (a,b) => { const h = Math.sin(a*12.9898+b*78.233)*43758.5453; return h-Math.floor(h); };
  const moves = Array.from({length:14}, (_,i) => {
    const axis = Math.min(2,Math.floor(hash(i,2.3)*3));
    const lo = -1 + .5*Math.min(3,Math.floor(hash(i,5.9)*4));
    return {axis,lo,hi:lo+.5,ang:(hash(i,7.7)<.5?1:-1)*Math.PI/2};
  });
  function amounts(time) {
    const slotDuration=.42, count=moves.length, tc=time%(2*count*slotDuration+1.2), amount=Array(count).fill(0);
    let active=-1;
    if (tc<2*count*slotDuration) {
      const slot=Math.floor(tc/slotDuration), p=(tc-slot*slotDuration)/slotDuration;
      const ease=1-(1-Math.min(1,p/.7))**3;
      if(slot<count){for(let i=0;i<slot;i++) amount[i]=1; amount[slot]=ease; active=slot;}
      else {const u=2*count-1-slot;for(let i=0;i<u;i++) amount[i]=1;amount[u]=1-ease;active=u;}
    }
    return {amount,active};
  }
  function frame(t) {
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size,size);
    const sc=amounts(t), yaw=t*.55, tilt=.35+.1*Math.sin(t*.9), sy=Math.sin(yaw),cy=Math.cos(yaw),st=Math.sin(tilt),ct=Math.cos(tilt);
    const dots=[], rings=9, density=24, rs=(size/300)**.6;
    for(let li=0;li<=rings;li++) {
      const lat=-Math.PI/2+li/rings*Math.PI, cl=Math.cos(lat), sl=Math.sin(lat), n=Math.max(1,Math.round(Math.abs(cl)*density));
      for(let j=0;j<n;j++) {
        const lon=j/n*2*Math.PI; let x=cl*Math.cos(lon),y=sl,z=cl*Math.sin(lon),inActive=false;
        for(let i=0;i<moves.length;i++) {
          if(sc.amount[i]<=0)continue;
          const m=moves[i],coord=m.axis===0?x:m.axis===1?y:z;
          if(coord<m.lo||coord>=m.hi)continue;
          if(i===sc.active)inActive=true;
          const a=m.ang*sc.amount[i],c=Math.cos(a),s=Math.sin(a);
          if(m.axis===0){const v=y*c-z*s;z=y*s+z*c;y=v;}
          else if(m.axis===1){const v=x*c+z*s;z=-x*s+z*c;x=v;}
          else {const v=x*c-y*s;y=x*s+y*c;x=v;}
        }
        const x1=x*cy+z*sy,z1=-x*sy+z*cy,y1=y*ct-z1*st,z2=y*st+z1*ct,depth=(z2+1)/2;
        const r=Math.max(.3,(.63+1.785*depth+(inActive?.315:0))*rs);
        const ink=Math.max(0,Math.min(1,.62-.54*depth-(inActive?.14:0)));
        dots.push({x:32+x1*26.24,y:32-y1*26.24,z:z2,r,ink});
      }
    }
    dots.sort((a,b)=>a.z-b.z);
    canvas.classList.add('orb-ready');
    for(const dot of dots){const g=Math.round((1-dot.ink)*255);ctx.fillStyle=`rgb(${g},${g},${g})`;ctx.beginPath();ctx.arc(dot.x,dot.y,dot.r,0,2*Math.PI);ctx.fill();}
  }
  let raf=0,visible=true,started=false,last=0,time=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  function canRun(){return !reduced.matches&&!document.body.classList.contains('motion-paused')&&visible&&document.visibilityState!=='hidden';}
  function loop(now){if(!canRun()){raf=0;last=0;return;}if(last)time+=(now-last)/1000*1.82;last=now;frame(time);raf=requestAnimationFrame(loop);}
  function sync(){if(canRun()&&!raf){last=0;raf=requestAnimationFrame(loop);}else if(!canRun()&&raf){cancelAnimationFrame(raf);raf=0;last=0;}if(!started){frame(.6);started=true;}}
  if(typeof IntersectionObserver!=='undefined'){const io=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();});io.observe(canvas);}
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',sync);
  if(reduced.addEventListener)reduced.addEventListener('change',sync);else if(reduced.addListener)reduced.addListener(sync);
  sync();
})();
