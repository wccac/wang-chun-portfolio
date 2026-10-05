(function(global){
  'use strict';
  const base=new URL('.',document.currentScript.src);
  const ASSETS={paperGrain:new URL('assets/book-paper-grain.svg',base).href,hands:new URL('assets/S07-reader-hands-v1.png',base).href,desk:new URL('assets/S05-desktop-book-lifted-v1.png',base).href,cover:new URL('../world-design/assets/W02-bitter-melon-cover-original.png',base).href,gestures:new URL('assets/S09-reader-right-gestures-v2-pinch.png',base).href};
  const gestureLayoutURL=new URL('assets/S09-reader-right-gestures-v2-layout.json',base).href;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const ease=t=>t*t*(3-2*t);
  const range=(t,a,b)=>ease(clamp((t-a)/(b-a),0,1));
  const timing={duration:5050,reachEnd:560,liftStart:460,liftEnd:1420,openStart:1220,openEnd:2600,pointStart:2440,pointEnd:3050,pinchStart:2960,expandStart:3360,cameraStart:2140};
  // Quintic Hermite joins carry velocity and zero acceleration across the
  // gentle approach / full-page zoom, instead of stopping at the gesture.
  function travel(time,start,end,from,to,startSpeed=0,endSpeed=0){
    const t=clamp((time-start)/(end-start),0,1),t2=t*t,t3=t2*t,t4=t3*t,t5=t4*t,span=end-start;
    return from+(to-from)*(10*t3-15*t4+6*t5)+startSpeed*span*(t-6*t3+8*t4-3*t5)+endSpeed*span*(-4*t3+7*t4-3*t5);
  }
  const approachProgress=.028,approachSpeed=.000045;
  function cameraProgress(time){
    return time<timing.expandStart
      ?travel(time,timing.cameraStart,timing.expandStart,0,approachProgress,0,approachSpeed)
      :travel(time,timing.expandStart,timing.duration,approachProgress,1,approachSpeed,0);
  }
  const rectMix=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),width:mix(a.width,b.width,t),height:mix(a.height,b.height,t)});
  const styleNames=['z-index','transform','transform-origin','clip-path','opacity','visibility','transition','will-change'];

  function create(options){
    const {host,worldView,iframe}=options;
    if(!host||!worldView||!iframe)throw new TypeError('CottageBook requires host, worldView and iframe.');
    let active=null;
    let layoutPromise;
    const cache={};
    function load(url){
      if(!cache[url])cache[url]=new Promise((resolve,reject)=>{const image=new Image();image.onload=async()=>{try{await image.decode()}catch(_){}resolve(image)};image.onerror=()=>{delete cache[url];reject(new Error('Book asset unavailable: '+url))};image.src=url;});
      return cache[url];
    }
    function preload(){
      layoutPromise ||= fetch(gestureLayoutURL).then(response=>{if(!response.ok)throw new Error('Gesture layout unavailable');return response.json();}).catch(error=>{layoutPromise=null;throw error;});
      return Promise.all([Promise.all(Object.values(ASSETS).map(load)),layoutPromise]);
    }
    function snapshot(){return {hidden:worldView.hidden,styles:styleNames.map(name=>[name,worldView.style.getPropertyValue(name),worldView.style.getPropertyPriority(name)])};}
    function restore(job,success){
      for(const [name,value,priority]of job.saved.styles){if(value)worldView.style.setProperty(name,value,priority);else worldView.style.removeProperty(name);}
      worldView.hidden=success?false:job.saved.hidden;
      if(success)worldView.style.visibility='visible';
    }
    function say(job,text){const fn=job.input.say||options.say||options.announce;if(fn)fn(text);}
    function done(job,cancelled,error){
      if(job.finished)return;job.finished=true;cancelAnimationFrame(job.raf);if(job.stopFrame){job.stopFrame();job.stopFrame=null;}
      if(active===job){active=null;job.nodes.forEach(node=>node.remove());restore(job,!cancelled&&!error);try{say(job,'')}catch(_){} }
      if(error)job.reject(error);else job.resolve({cancelled:!!cancelled});
    }
    function cancel(){if(active)done(active,true);}
    function current(job){if(job.finished||active!==job)return false;if(job.input.isCurrent&&!job.input.isCurrent()){done(job,true);return false;}return true;}
    function element(job,tag,name,parent=host){const node=document.createElement(tag);node.className=name;node.setAttribute('aria-hidden','true');parent.append(node);job.nodes.push(node);return node;}
    function setRect(node,r){node.style.left=r.x+'px';node.style.top=r.y+'px';node.style.width=r.width+'px';node.style.height=r.height+'px';}
    function leftExtent(r,open,baseWidth=r.width){
      const angle=178*open*Math.PI/180;
      // Follow the actual projected edge of the rotating cover. Before the
      // cover passes the spine, the left hand continues supporting the spine.
      return clamp(-Math.cos(angle)/(1-baseWidth*Math.sin(angle)/1200),0,1);
    }
    function hands(job,r,open,reach=1,opacity=1){
      const left=r.x-r.width*leftExtent(r,open,job.closed.width);
      const right=r.x+r.width;
      const thumbY=r.y+r.height*.84;
      const scale=Math.min(clamp((job.height+28-thumbY)/365,.28,.95),clamp(r.width/370,.28,.85));
      const targetY=mix(job.height+130,thumbY,reach);
      // Palms and curled fingers stay behind the paper. Only a narrow thumb
      // overlaps the front edge, so the book is visibly held between the hands.
      for(const [back,front,x,thumbX,thumbSourceY]of [[job.leftHand,job.leftThumb,left+9*scale,366,624],[job.rightHand,job.rightThumb,right-9*scale,431,629]]){
        for(const node of [back,front]){
          node.style.transform=`translate(${x-thumbX*scale}px,${targetY-thumbSourceY*scale}px) scale(${scale})`;
          node.style.opacity=String(opacity);
        }
      }
    }
    function pose(job,r,open,reach=1,opacity=1){
      // Fixed-size layers keep the paper, shadow and cover on the compositor.
      // Changing width/height here used to repaint the whole book every frame.
      const transform=`translate3d(${r.x}px,${r.y}px,0) scale(${r.width/job.closed.width},${r.height/job.closed.height})`;
      job.paper.style.transform=job.cover.style.transform=transform;
      job.paper.style.setProperty('--left-page',String(leftExtent(r,open,job.closed.width)));
      job.leaf.style.transform=`rotateY(${-178*open}deg)`;
      job.cover.style.opacity=String(1-range(open,.82,1));
      job.inner.style.opacity=String(1-range(open,.40,.58));
      hands(job,r,open,reach,opacity);
    }
    function warmth(job,amount){
      job.warmAmount=amount;
      for(const node of [job.paperShade,job.innerShade])node.style.opacity=String(amount);
    }
    function gestureFrames(job,image,layout){
      job.gesturePoses={};
      // Normalize every authored pose to one wrist so changing the fingers never
      // jumps the arm. Extend only the cuff pixels below the original artwork.
      for(const item of layout.poses){
        const frame=document.createElement('canvas');frame.width=560;frame.height=1300;
        const ctx=frame.getContext('2d'),[sx,sy,sw,sh]=item.sourceRect;
        const dx=300-item.wristAnchorLocal[0],dy=431-item.wristAnchorLocal[1];
        ctx.drawImage(image,sx,sy,sw,sh,dx,dy,sw,sh);
        ctx.drawImage(image,sx,sy+593,sw,8,dx,dy+601,sw,699);
        const tips={};for(const [key,p]of Object.entries(item.fingertipsLocal))tips[key]=[p[0]+dx,p[1]+dy];
        job.gesturePoses[item.key]={frame,tips};
      }
      job.gesture=element(job,'canvas','cottage-book-gesture');job.gesture.width=560;job.gesture.height=1300;
      job.gestureContext=job.gesture.getContext('2d');job.gesture.style.opacity='0';
      job.meshSurface=document.createElement('canvas');job.meshSurface.width=560;job.meshSurface.height=450;
      job.meshContext=job.meshSurface.getContext('2d');
      job.gestureScale=clamp(job.open.width/360,.37,.68);
      job.touch=element(job,'div','cottage-book-touch');job.touch.style.opacity='0';
      // The mesh is fixed. Calculate each shared vertex's displacement once,
      // then reuse it for both adjacent triangles throughout the gesture.
      const tips=[job.gesturePoses.spread.tips.index,job.gesturePoses.spread.tips.thumb],targets=[job.gesturePoses.pinch.tips.index,job.gesturePoses.pinch.tips.thumb];
      const distance=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2,k=Math.exp(-distance(...tips)/19600),den=1-k*k;
      const deltas=tips.map((tip,i)=>tip.map((v,axis)=>targets[i][axis]-v));
      const coefficients=deltas.map((d,i)=>d.map((v,axis)=>(v-k*deltas[1-i][axis])/den));
      job.mesh=[];
      for(let y=0;y<=15;y++)for(let x=0;x<=14;x++){
        const point=[x*40,y*30],weights=tips.map(tip=>Math.exp(-distance(point,tip)/19600)),palm=1-range(point[1],320,431);
        job.mesh.push({point,delta:point.map((_,axis)=>palm*(weights[0]*coefficients[0][axis]+weights[1]*coefficients[1][axis]))});
      }
    }
    function drawTriangle(ctx,image,a,b,c,da,db,dc){
      const det=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
      const m11=((db[0]-da[0])*(c[1]-a[1])-(dc[0]-da[0])*(b[1]-a[1]))/det;
      const m12=((db[1]-da[1])*(c[1]-a[1])-(dc[1]-da[1])*(b[1]-a[1]))/det;
      const m21=((dc[0]-da[0])*(b[0]-a[0])-(db[0]-da[0])*(c[0]-a[0]))/det;
      const m22=((dc[1]-da[1])*(b[0]-a[0])-(db[1]-da[1])*(c[0]-a[0]))/det;
      // Canvas antialiases each clipping edge independently. Slightly overlap
      // neighbouring triangles so those edges cannot expose a cross-shaped
      // grid through otherwise opaque skin. Keep the texture mapping exact.
      const center=[(da[0]+db[0]+dc[0])/3,(da[1]+db[1]+dc[1])/3];
      const expanded=[da,db,dc].map(p=>{const dx=p[0]-center[0],dy=p[1]-center[1],length=Math.hypot(dx,dy)||1;return [p[0]+dx/length*1.5,p[1]+dy/length*1.5];});
      ctx.save();ctx.beginPath();ctx.moveTo(...expanded[0]);ctx.lineTo(...expanded[1]);ctx.lineTo(...expanded[2]);ctx.closePath();ctx.clip();
      ctx.transform(m11,m12,m21,m22,da[0]-m11*a[0]-m21*a[1],da[1]-m12*a[0]-m22*a[1]);
      const x=Math.max(0,Math.min(a[0],b[0],c[0])-2),y=Math.max(0,Math.min(a[1],b[1],c[1])-2),w=Math.min(image.width,Math.max(a[0],b[0],c[0])+2)-x,h=Math.min(image.height,Math.max(a[1],b[1],c[1])+2)-y;
      ctx.drawImage(image,x,y,w,h,x,y,w,h);ctx.restore();
    }
    function drawPinch(job,progress){
      if(job.lastPinch===progress)return job.lastPinchCenter;
      const ctx=job.gestureContext,closed=job.gesturePoses.pinch,spread=job.gesturePoses.spread;
      const tips=[spread.tips.index,spread.tips.thumb],targets=[closed.tips.index,closed.tips.thumb];
      const deformed=job.mesh.map(vertex=>vertex.point.map((v,axis)=>v+vertex.delta[axis]*(1-progress)));
      ctx.clearRect(0,0,560,1300);
      const reveal=range(progress,0,.2);
      if(reveal<1){ctx.globalAlpha=1-reveal;ctx.drawImage(closed.frame,0,0);}
      ctx.globalAlpha=reveal;
      ctx.drawImage(spread.frame,0,450,560,850,0,450,560,850);
      // Composite the completed mesh once: fading individual overlapping
      // triangles would leave darker seams at the start of the pinch.
      const mesh=job.meshContext;mesh.clearRect(0,0,560,450);
      const cols=14,rows=15;
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const a=y*15+x,b=a+1,c=a+16,d=a+15;
        drawTriangle(mesh,spread.frame,job.mesh[a].point,job.mesh[b].point,job.mesh[c].point,deformed[a],deformed[b],deformed[c]);
        drawTriangle(mesh,spread.frame,job.mesh[a].point,job.mesh[c].point,job.mesh[d].point,deformed[a],deformed[c],deformed[d]);
      }
      ctx.drawImage(job.meshSurface,0,0);
      ctx.globalAlpha=1;
      const index=targets[0].map((v,i)=>mix(v,tips[0][i],progress)),thumb=targets[1].map((v,i)=>mix(v,tips[1][i],progress));
      job.gesture.dataset.pinchProgress=progress.toFixed(4);
      job.gesture.dataset.fingerDistance=String(Math.hypot(index[0]-thumb[0],index[1]-thumb[1])*job.gestureScale);
      job.lastPinch=progress;job.lastPinchCenter=index.map((v,i)=>(v+thumb[i])/2);return job.lastPinchCenter;
    }
    function gesturePosition(job,anchor,point,opacity=1){
      const scale=job.gestureScale;
      job.gesture.style.transform=`translate(${point[0]-anchor[0]*scale}px,${point[1]-anchor[1]*scale}px) scale(${scale})`;
      job.gesture.style.opacity=String(opacity);
    }
    function contentRect(r){const inset=7;return {x:r.x-r.width+inset,y:r.y+inset,width:r.width*2-inset*2,height:r.height-inset*2};}
    function worldRect(job,r,opacity,leftClip=0){
      const bounds=job.hostBounds;
      // The live page keeps its aspect ratio. The book acts as a moving window
      // onto it; opening/zooming reveals more content instead of stretching it.
      const scale=Math.max(r.width/job.width,r.height/job.height);
      const width=job.width*scale,height=job.height*scale;
      const x=r.x+(r.width-width)/2,y=r.y;
      worldView.style.transform=`translate3d(${x-bounds.left}px,${y-bounds.top}px,0) scale(${scale})`;
      worldView.style.opacity=String(opacity);
      const right=clamp((x+width-r.x-r.width)/width*100,0,100);
      const bottom=clamp((height-r.height)/height*100,0,100);
      const left=clamp((r.x+r.width*leftClip/100-x)/width*100,0,100);
      const clip=`inset(0 ${right}% ${bottom}% ${left}%)`;
      worldView.style.clipPath=job.warmth.style.clipPath=clip;
      job.warmth.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
      job.warmth.style.opacity=String(job.warmAmount*opacity);
    }
    function build(job){
      const r=job.input.sourceRect;
      job.backdrop=element(job,'div','cottage-book-backdrop');job.backdrop.dataset.phase='reach';
      job.original=element(job,'img','',job.backdrop);job.original.src=job.input.source.src;setRect(job.original,r);
      job.paper=element(job,'div','cottage-book-paper');
      job.cover=element(job,'div','cottage-book-cover');
      job.leaf=element(job,'div','cottage-book-leaf',job.cover);
      const front=element(job,'div','cottage-book-front',job.leaf);front.style.backgroundImage=`url("${ASSETS.cover}")`;
      job.sourceCover=element(job,'div','cottage-book-source-cover',front);
      job.sourceCover.style.backgroundImage=`url("${job.input.source.src}")`;
      job.sourceCover.style.backgroundSize=`${100/.17}% ${100/.35}%`;
      job.sourceCover.style.backgroundPosition=`${.61/(1-.17)*100}% ${.364/(1-.35)*100}%`;
      job.inner=element(job,'div','cottage-book-inner',job.leaf);
      job.paperShade=element(job,'div','cottage-book-shade cottage-book-paper-shade',job.paper);
      // The printed black cover keeps its own texture and neutral black.
      // Only the physical paper receives ambient light and subtle paper grain.
      job.innerShade=element(job,'div','cottage-book-shade',job.inner);
      job.warmth=element(job,'div','cottage-book-world-warmth');
      job.warmth.style.width=job.width+'px';job.warmth.style.height=job.height+'px';
      job.leftHand=element(job,'div','cottage-book-hand cottage-book-hand-left');
      job.rightHand=element(job,'div','cottage-book-hand cottage-book-hand-right');
      job.leftThumb=element(job,'div','cottage-book-hand cottage-book-hand-left cottage-book-thumb cottage-book-thumb-left');
      job.rightThumb=element(job,'div','cottage-book-hand cottage-book-hand-right cottage-book-thumb cottage-book-thumb-right');
      for(const hand of [job.leftHand,job.rightHand,job.leftThumb,job.rightThumb]){
        hand.style.width='793px';hand.style.height=hand.classList.contains('cottage-book-thumb')?'992px':'2180px';
        const image=element(job,'img','',hand);image.src=ASSETS.hands;
        if(!hand.classList.contains('cottage-book-thumb')){const sleeve=element(job,'div','cottage-book-sleeve-tail',hand);const cloth=element(job,'img','',sleeve);cloth.src=ASSETS.hands;}
      }
      job.bookStart={x:r.x+r.width*.61,y:r.y+r.height*.364,width:r.width*.17,height:r.height*.35};
      const pageWidth=Math.min(job.width*(job.width<700?.4:.235),job.height*.37);
      const pageHeight=pageWidth*1.3;
      const thumbY=job.height*(job.width<700?.74:.70);
      job.closed={x:job.width/2-pageWidth/2,y:thumbY-pageHeight*.73,width:pageWidth,height:pageHeight};
      job.open={...job.closed,x:job.width/2};
      for(const node of [job.paper,job.cover])setRect(node,{x:0,y:0,width:pageWidth,height:pageHeight});
      // Only remove the original book. The desk, smoke and plants never swap.
      const padding=24,patch={x:job.bookStart.x-padding,y:job.bookStart.y-padding,width:job.bookStart.width+padding*2,height:job.bookStart.height+padding*2};
      job.deskPatch=element(job,'div','cottage-book-desk-patch',job.backdrop);setRect(job.deskPatch,patch);
      const lifted=element(job,'img','',job.deskPatch);lifted.src=ASSETS.desk;
      setRect(lifted,{x:r.x-patch.x,y:r.y-patch.y,width:r.width,height:r.height});
      warmth(job,1);
      job.paper.style.opacity='0';job.cover.style.opacity='0';
      pose(job,job.bookStart,0,0);job.paper.style.opacity='0';job.cover.style.opacity='0';
    }
    function frames(job,duration,render){
      return new Promise((resolve,reject)=>{
        job.stopFrame=()=>resolve(false);
        let began;
        const tick=time=>{
          try{
            if(!current(job)){resolve(false);return;}
            if(began===undefined)began=time;
            const p=clamp((time-began)/duration,0,1);render(p);
            if(p===1){job.stopFrame=null;resolve(true);return;}
            job.raf=requestAnimationFrame(tick);
          }catch(error){job.stopFrame=null;reject(error);}
        };
        job.raf=requestAnimationFrame(tick);
      });
    }
    function enter(input){
      cancel();
      return new Promise((resolve,reject)=>{
        const job={input:input||{},resolve,reject,saved:snapshot(),nodes:[],raf:0,finished:false};active=job;
        (async()=>{
          try{
            const r=job.input.sourceRect;
            if(!job.input.source||!r||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)throw new TypeError('CottageBook requires source and sourceRect in viewport CSS pixels.');
            // Prepare the actual page before the first visible movement. The
            // covering clip also protects against onReady revealing the iframe.
            worldView.style.visibility='hidden';worldView.style.clipPath='inset(50%)';
            const [,layout]=await preload();if(!current(job))return;
            if(job.input.onReady)await job.input.onReady();if(!current(job))return;
            const doc=iframe.contentDocument;
            if(doc)await Promise.all([...doc.images].filter(img=>img.getBoundingClientRect().top<global.innerHeight).map(img=>img.decode().catch(()=>{})));
            if(!current(job))return;
            job.width=global.innerWidth;job.height=global.innerHeight;job.hostBounds=host.getBoundingClientRect();
            build(job);gestureFrames(job,await load(ASSETS.gestures),layout);
            job.input.onStart?.();
            worldView.style.zIndex='23';worldView.style.transformOrigin='0 0';worldView.style.transition='none';worldView.style.willChange='transform,opacity';
            worldView.hidden=false;worldView.style.visibility='visible';worldRect(job,contentRect(job.closed),0);
            const to={x:0,y:0,width:job.width,height:job.height};
            const phases=[[0,'reach'],[timing.liftStart,'lift'],[timing.openStart,'open'],[timing.pointStart,'point'],[timing.pinchStart,'pinch'],[timing.expandStart,'expand']];
            let lastPhase;
            // One pose and one camera window run throughout. Each physical
            // action overlaps the settling of the preceding action; the hand
            // leaves during the zoom rather than after a fullscreen pause.
            if(!await frames(job,timing.duration,progress=>{
              const time=progress*timing.duration,camera=cameraProgress(time),phase=camera>=.68?'release':phases.findLast(([start])=>time>=start)[1];
              if(phase!==lastPhase){lastPhase=phase;job.backdrop.dataset.phase=phase;say(job,phase==='reach'?'这本书……像是还没有翻完的夏天。':phase==='open'?'翻开看看。':'');}
              const lift=range(time,timing.liftStart,timing.liftEnd),opening=range(time,timing.openStart,timing.openEnd);
              const physical=rectMix(job.bookStart,job.closed,lift);physical.x+=opening*job.closed.width/2;
              const content=rectMix(contentRect(physical),to,camera),edge=7*(1-camera);
              const r={x:content.x+content.width/2,y:content.y-edge,width:content.width/2+edge,height:content.height+edge*2};
              // Keep the same material through the entire opening and gesture.
              // Release it only as the page approaches the fullscreen world.
              const expansion=clamp((camera-approachProgress)/(1-approachProgress),0,1);
              warmth(job,1-range(expansion,.72,1));
              job.deskPatch.style.opacity=String(range(lift,.01,.38));
              job.sourceCover.style.opacity=String(1-range(lift,.12,.68));
              pose(job,r,opening,range(time,0,timing.reachEnd),1-range(expansion,.03,.5));
              job.paper.style.opacity=String(range(time,timing.liftStart,timing.liftStart+140)*(1-range(expansion,.85,1)));
              job.cover.style.opacity=String(range(time,timing.liftStart-100,timing.reachEnd)*(1-range(opening,.82,1)));
              const left=r.x-r.width*leftExtent(r,opening,job.closed.width);
              worldRect(job,content,range(opening,0,.13),clamp((left-content.x)/content.width,0,1)*100);
              if(time>=timing.pointStart){
                const contact=[content.x+content.width*.55,content.y+content.height*.43],point=job.gesturePoses.point;
                const p=clamp((time-timing.pointStart)/(timing.pointEnd-timing.pointStart),0,1),letGo=range(p,0,.24);
                job.rightHand.style.opacity=job.rightThumb.style.opacity=String(1-letGo);
                const ring=range(p,.6,1),ringIn=range(p,.58,.66);
                job.touch.style.left=contact[0]+'px';job.touch.style.top=contact[1]+9+'px';
                job.touch.style.opacity=String(.55*ringIn*(1-ring));job.touch.style.transform=`translate(-50%,-50%) scale(${.6+ring*.9})`;
                if(time<timing.pinchStart){
                  if(!job.pointDrawn){job.gestureContext.clearRect(0,0,560,1300);job.gestureContext.drawImage(point.frame,0,0);job.pointDrawn=true;}
                  const approach=range(p,0,.5),tap=9*Math.sin(range(p,.46,.85)*Math.PI);
                  gesturePosition(job,point.tips.index,[mix(r.x+r.width,contact[0],approach),mix(r.y+r.height*.84,contact[1],approach)+tap],letGo);
                }else if(time<timing.expandStart){
                  const pinch=job.gesturePoses.pinch,ctx=job.gestureContext,t=range(time,timing.pinchStart,timing.expandStart);
                  ctx.clearRect(0,0,560,1300);ctx.globalAlpha=1-t;ctx.drawImage(point.frame,0,0);ctx.globalAlpha=t;ctx.drawImage(pinch.frame,0,0);ctx.globalAlpha=1;
                  const middle=pinch.tips.index.map((v,i)=>(v+pinch.tips.thumb[i])/2);
                  gesturePosition(job,point.tips.index.map((v,i)=>mix(v,middle[i],t)),contact);
                }else{
                  const center=drawPinch(job,expansion),release=range(camera,.68,1);
                  gesturePosition(job,center,[contact[0]+release*job.width*.08,contact[1]+release*job.height*.28],1-release);
                  job.gesture.dataset.pageProgress=expansion.toFixed(4);
                }
              }
            }))return;
            if(current(job))done(job,false);
          }catch(error){if(!job.finished)done(job,false,error);}
        })();
      });
    }
    return {enter,cancel,preload};
  }
  global.CottageBook={create};
})(window);
