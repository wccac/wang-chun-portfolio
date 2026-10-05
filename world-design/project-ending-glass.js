/* Shared clear glass: a stable hit area around a spring-driven optical surface.
   Background refraction is confined to the curved perimeter, never the label. */
(() => {
  'use strict';
  const buttons = [...document.querySelectorAll('.ending-return, .bm-open, .bm-reader-controls .bm-orbit, .artwork-collapse, .tg-zoom-mark')];
  if (!buttons.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const canRefract = /Chrome|Chromium|Edg\//.test(navigator.userAgent) &&
    CSS.supports('backdrop-filter', 'url("#portfolio-glass")');
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const svg = make('svg', { width:0, height:0, 'aria-hidden':'true', focusable:'false' });
  svg.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none';
  const defs = make('defs', {}), maps = new Map();
  svg.append(defs);
  if (canRefract) document.body.append(svg);

  function filterFor(w, h) {
    const density = Math.min(devicePixelRatio || 1, 2), key = [w,h,density].join('-');
    if (maps.has(key)) return maps.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w*density); canvas.height = Math.ceil(h*density);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const data = ctx.createImageData(canvas.width,canvas.height);
    const radius = h/2, rim = Math.min(9,h*.13), bendSize = rim/2;
    for (let y=0;y<canvas.height;y++) for (let x=0;x<canvas.width;x++) {
      const px=(x+.5)/density, py=(y+.5)/density;
      const dx=px-Math.max(radius,Math.min(w-radius,px)), dy=py-radius;
      const length=Math.hypot(dx,dy), depth=radius-length;
      const bend=depth>0&&depth<rim ? -bendSize*Math.pow(1-depth/rim,2) : 0;
      const i=(y*canvas.width+x)*4;
      data.data[i]=Math.round(127.5+(length?dx/length:0)*bend/16*255);
      data.data[i+1]=Math.round(127.5+(length?dy/length:0)*bend/16*255);
      data.data[i+2]=128; data.data[i+3]=255;
    }
    ctx.putImageData(data,0,0);
    const id='portfolio-glass-'+maps.size;
    const filter=make('filter',{id,filterUnits:'userSpaceOnUse',x:0,y:0,width:w,height:h,'color-interpolation-filters':'sRGB'});
    filter.append(make('feImage',{href:canvas.toDataURL(),result:'rim-map',preserveAspectRatio:'none',x:0,y:0,width:w,height:h}));
    filter.append(make('feDisplacementMap',{in:'SourceGraphic',in2:'rim-map',scale:16,xChannelSelector:'R',yChannelSelector:'G'}));
    defs.append(filter); maps.set(key,id); return id;
  }

  let suspended=false;
  const controllers=buttons.map(button => {
    const host=button.closest('.tg-art-trigger, .fragment[data-detail]')||button;
    button.classList.add('liquid-glass');
    const surface=document.createElement('span');
    surface.className='liquid-glass-surface'; surface.setAttribute('aria-hidden','true');
    const lens=document.createElement('span'); lens.className='liquid-glass-lens';
    surface.append(lens); button.prepend(surface);
    const icon=button.querySelector('.bm-expand-icon, .bm-direction-icon');
    const small=button.matches('.bm-open, .bm-reader-controls .bm-orbit, .artwork-collapse, .tg-zoom-mark');
    const artwork=button.classList.contains('bm-open') ? button.parentElement.querySelector('img')
      : button.closest('.bm-viewer-stage')?.querySelector('.bm-viewer-image') || button.closest('.tg-art-trigger, .fragment[data-detail]')?.querySelector('img') || null;
    // Keep a translucent arrow readable on both white pages and black covers.
    // Sampling is local (all artwork is same-origin) and only runs on load/resize.
    function contrast() {
      if(!artwork?.complete||!artwork.naturalWidth) return;
      try {
        const r=artwork.getBoundingClientRect(), b=button.getBoundingClientRect();
        if(!r.width||!r.height) return;
        const scale=Math.min(r.width/artwork.naturalWidth,r.height/artwork.naturalHeight);
        const left=r.left+(r.width-artwork.naturalWidth*scale)/2;
        const top=r.top+(r.height-artwork.naturalHeight*scale)/2;
        const sample=document.createElement('canvas');sample.width=sample.height=8;
        const ctx=sample.getContext('2d',{willReadFrequently:true});
        if(!ctx) return;
        let node=button.parentElement, background='#fff';
        while(node) {
          const color=getComputedStyle(node).backgroundColor;
          if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent') {background=color;break;}
          node=node.parentElement;
        }
        ctx.fillStyle=background;ctx.fillRect(0,0,8,8);
        ctx.drawImage(artwork,(b.x-left)/scale,(b.y-top)/scale,b.width/scale,b.height/scale,0,0,8,8);
        const pixels=ctx.getImageData(0,0,8,8).data;
        let light=0;
        for(let i=0;i<pixels.length;i+=4) light+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;
        button.classList.toggle('is-glass-dark',light/64<135);
      } catch { /* CSS supplies the light-page appearance if sampling is unavailable. */ }
    }
    artwork?.addEventListener('load',contrast);
    const value={h:0,x:0,y:0,p:0}, speed={h:0,x:0,y:0,p:0}, target={h:0,x:0,y:0,p:0};
    let raf=0, previousTime=0, pointerInside=false, lastSize='';
    function optics() {
      contrast();
      if (!canRefract) return;
      const w=button.clientWidth, h=button.clientHeight, size=[w,h,devicePixelRatio].join('-');
      if (!w||!h||size===lastSize) return;
      lastSize=size;
      const id=filterFor(w,h);
      if (!id) return;
      lens.style.setProperty('--glass-lens-filter','url("#'+id+'")');
      lens.classList.add('is-refractive');
    }
    function paint() {
      const {h,x,y,p}=value, stretch=Math.abs(x)*h;
      const sx=1+(small?.065:.029)*h+.025*stretch-.065*p;
      const sy=1+(small?.065:.095)*h-.02*stretch-.045*p;
      surface.style.transform=`translate3d(${x*2.4}px,${y*1.9-h*1.6}px,0) scale(${sx},${sy})`;
      surface.style.setProperty('--glass-light-x',(32+x*35)+'%');
      surface.style.setProperty('--glass-light-y',(24+y*34)+'%');
      if (icon) icon.style.transform=`translate3d(${x*.75}px,${y*.75-h*.5}px,0) scale(${1+h*.025-p*.055})`;
    }
    function tick(now) {
      const dt=previousTime ? Math.min(.025,(now-previousTime)/1000) : 1/60;
      previousTime=now;
      let moving=false;
      for (const key of ['h','x','y','p']) {
        const stiffness=key==='p'?410:280, damping=key==='p'?40.5:33.5;
        speed[key]+=(stiffness*(target[key]-value[key])-damping*speed[key])*dt;
        value[key]+=speed[key]*dt;
        if (Math.abs(target[key]-value[key])>.001||Math.abs(speed[key])>.008) moving=true;
        else {value[key]=target[key];speed[key]=0;}
      }
      paint();
      if (moving) raf=requestAnimationFrame(tick);
      else {raf=0;previousTime=0;}
    }
    function run() { if(!raf&&!reduced.matches&&!suspended) raf=requestAnimationFrame(tick); }
    function reset() {
      cancelAnimationFrame(raf);raf=0;previousTime=0;pointerInside=false;
      for(const key of ['h','x','y','p']) value[key]=speed[key]=target[key]=0;
      button.classList.remove('is-glass-hovered','is-glass-pressed');
      surface.style.removeProperty('transform');
      surface.style.removeProperty('--glass-light-x');surface.style.removeProperty('--glass-light-y');
      icon?.style.removeProperty('transform');
    }
    function point(event) {
      const r=button.getBoundingClientRect();
      target.x=Math.max(-1,Math.min(1,((event.clientX-r.left)/r.width-.5)*2));
      target.y=Math.max(-1,Math.min(1,((event.clientY-r.top)/r.height-.5)*2));
    }
    host.addEventListener('pointerenter',event=>{
      if(button.disabled||!fine.matches||event.pointerType==='touch'||suspended) return;
      pointerInside=true;point(event);target.h=1;
      button.classList.add('is-glass-hovered');run();
    });
    host.addEventListener('pointermove',event=>{
      if(button.disabled||!pointerInside||reduced.matches||suspended) return;
      point(event);run();
    });
    host.addEventListener('pointerleave',()=>{
      pointerInside=false;target.h=target.x=target.y=target.p=0;
      button.classList.remove('is-glass-hovered','is-glass-pressed');run();
    });
    host.addEventListener('pointerdown',event=>{
      if(button.disabled||event.button!==0||suspended) return;
      point(event);target.p=1;button.classList.add('is-glass-pressed');run();
    });
    function release() {
      if(!target.p&&!button.classList.contains('is-glass-pressed')) return;
      target.p=0;
      if(!pointerInside) target.x=target.y=target.h=0;
      button.classList.remove('is-glass-pressed');run();
    }
    addEventListener('pointerup',release);addEventListener('pointercancel',release);
    host.addEventListener('keydown',event=>{
      if(button.disabled||suspended||!['Enter',' '].includes(event.key)) return;
      target.p=1;button.classList.add('is-glass-pressed');run();
    });
    host.addEventListener('keyup',release);
    host.addEventListener('blur',release);
    host.addEventListener('click',()=>{if(!pointerInside) release();});
    const resize=new ResizeObserver(optics);resize.observe(button);optics();
    return {reset,optics,resize,button};
  });
  function suspend() { suspended=true;controllers.forEach(c=>c.reset()); }
  function resume() { suspended=false;controllers.forEach(c=>{c.reset();c.optics();}); }
  reduced.addEventListener('change',()=>controllers.forEach(c=>c.reset()));
  fine.addEventListener('change',()=>controllers.forEach(c=>c.reset()));
  addEventListener('portfolio:world-suspend',suspend);addEventListener('portfolio:world-ready',resume);
  addEventListener('pagehide',suspend);addEventListener('pageshow',resume);
  document.addEventListener('visibilitychange',()=>document.hidden?suspend():resume());
  // A modal takes the pointer away without always delivering pointerleave.
  new MutationObserver(()=>{
    if(document.querySelector('dialog[open]')) controllers.forEach(c=>c.reset());
    else controllers.filter(c=>c.button.disabled||c.button.closest('dialog')).forEach(c=>c.reset());
  }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open','disabled']});
})();
