(function (global) {
  'use strict';
  const scriptURL = document.currentScript && document.currentScript.src || document.baseURI;
  const gardenURL = new URL('../world-design/assets/W03-panda-environment-v1.png', scriptURL).href;
  const cssURL = new URL('panda-motion.css', scriptURL).href;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const reduced = () => global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let gardenPromise;
  function gardenImage() {
    if (!gardenPromise) gardenPromise = new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => image.decode().then(() => resolve(image), reject); image.onerror = reject; image.src = gardenURL;
    });
    return gardenPromise;
  }
  function coverRect(image, width, height, focus, zoom = 1) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    return { x: clamp(width / 2 - focus[0] * w, width - w, 0), y: clamp(height / 2 - focus[1] * h, height - h, 0), width: w, height: h };
  }
  function drawRect(context, image, rect) { context.drawImage(image, rect.x, rect.y, rect.width, rect.height); }
  function initialFocus(width, height) { return width < height ? [.63, .5] : [.5, .5]; }

  // Draw one image triangle into a deformed triangle. All distortion remains
  // inside the two pandas; the frame, flowers, furniture and wall stay still.
  function triangle(context, image, a, b, c, da, db, dc) {
    const det = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (Math.abs(det) < .001) return;
    const m11 = ((db.x - da.x) * (c.y - a.y) - (dc.x - da.x) * (b.y - a.y)) / det;
    const m12 = ((db.y - da.y) * (c.y - a.y) - (dc.y - da.y) * (b.y - a.y)) / det;
    const m21 = ((dc.x - da.x) * (b.x - a.x) - (db.x - da.x) * (c.x - a.x)) / det;
    const m22 = ((dc.y - da.y) * (b.x - a.x) - (db.y - da.y) * (c.x - a.x)) / det;
    context.save(); context.beginPath(); context.moveTo(da.x, da.y); context.lineTo(db.x, db.y); context.lineTo(dc.x, dc.y); context.closePath(); context.clip();
    context.transform(m11, m12, m21, m22, da.x - m11 * a.x - m21 * a.y, da.y - m12 * a.x - m22 * a.y);
    context.drawImage(image, 0, 0); context.restore();
  }
  function livePainting(context, image, seconds) {
    const width = image.naturalWidth, height = image.naturalHeight;
    context.clearRect(0, 0, width, height); context.drawImage(image, 0, 0);
    const phase = Math.sin(seconds * Math.PI * 2 / 1.4), breath = Math.sin(seconds * Math.PI * 2 / 1.8);
    const envelope = smooth(0, .24, seconds);
    const x0 = width * .402, y0 = height * .265, w = width * .154, h = height * .216;
    function deform(point) {
      const nx = point.x / width, ny = point.y / height;
      const leftHead = Math.exp(-(((nx - .441) / .026) ** 2 + ((ny - .312) / .047) ** 2) * 2.5);
      const rightHead = Math.exp(-(((nx - .503) / .034) ** 2 + ((ny - .35) / .045) ** 2) * 2.5);
      const bodies = Math.exp(-(((nx - .443) / .04) ** 2 + ((ny - .416) / .05) ** 2) * 2.7) + Math.exp(-(((nx - .508) / .038) ** 2 + ((ny - .439) / .052) ** 2) * 2.7);
      const edge = Math.sin(clamp((point.x - x0) / w) * Math.PI) * Math.sin(clamp((point.y - y0) / h) * Math.PI);
      return { x: point.x + (leftHead - rightHead * .85) * phase * 8 * envelope * edge, y: point.y - (bodies * breath * 3.6 + (leftHead + rightHead) * phase * 1.1) * envelope * edge };
    }
    const cols = 18, rows = 15;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const a = {x:x0+x*w/cols,y:y0+y*h/rows}, b = {x:x0+(x+1)*w/cols,y:a.y}, c = {x:b.x,y:y0+(y+1)*h/rows}, d = {x:a.x,y:c.y};
      const da = deform(a), db = deform(b), dc = deform(c), dd = deform(d);
      triangle(context,image,a,b,c,da,db,dc); triangle(context,image,a,c,d,da,dc,dd);
    }
  }

  function create(options) {
    options = options || {};
    const host = options.host, iframe = options.iframe;
    if (!host || !iframe) throw new TypeError('CottagePanda.create requires host and iframe.');
    const canvas = document.createElement('canvas'); canvas.className = 'panda-entry-canvas'; canvas.setAttribute('aria-hidden','true'); canvas.hidden = true; host.appendChild(canvas);
    const context = canvas.getContext('2d'); const painting = document.createElement('canvas'), paintingContext = painting.getContext('2d');
    let active = null, attachment = null, attachmentGeneration = 0;
    function finish(job, cancelled, error) {
      if (job.done) return; job.done = true; cancelAnimationFrame(job.raf);
      if (active === job) { active = null; canvas.hidden = true; canvas.style.opacity = '1'; if(options.say)options.say(''); }
      if (error) job.reject(error); else job.resolve({cancelled:!!cancelled});
    }
    function cancel() { if (active) finish(active,true); else canvas.hidden = true; }
    async function enter(config) {
      cancel();
      return new Promise((resolve,reject) => {
        const job = {config,resolve,reject,done:false,raf:0,covered:false,coverRequested:false}; active = job;
        const current = () => active === job && !job.done && (!config.isCurrent || config.isCurrent());
        (async () => {
          const source = config.source;
          if (!source || !source.naturalWidth) await source.decode();
          const garden = await gardenImage();
          if (!current()) {finish(job,true);return;}
          if (reduced()) { await config.onCovered(); finish(job,!current()); return; }
          const hostRect = host.getBoundingClientRect(), width = hostRect.width, height = hostRect.height;
          const ratio = Math.min(global.devicePixelRatio || 1, 1.5);
          canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio); context.setTransform(ratio,0,0,ratio,0,0);
          painting.width=source.naturalWidth;painting.height=source.naturalHeight;
          const given = config.sourceRect || {x:0,y:0,width,height};
          const start = {x:given.x-hostRect.x,y:given.y-hostRect.y,width:given.width,height:given.height};
          const frame = {x:.335,y:.158,width:.292,height:.331};
          const scale = Math.max(width/(start.width*frame.width),height/(start.height*frame.height))*1.08;
          const end = {width:start.width*scale,height:start.height*scale};
          end.x=width/2-(frame.x+frame.width/2)*end.width;end.y=height/2-(frame.y+frame.height/2)*end.height;
          const gardenRect=coverRect(garden,width,height,initialFocus(width,height));
          const began=performance.now();canvas.hidden=false;if(options.say)options.say('它动了……');
          function tick(now) {
            if (!current()) {finish(job,true);return;}
            const seconds=(now-began)/1000;
            const zoom=clamp((seconds-.75)/1.45);
            if(seconds>=.75&&!job.captionCleared){job.captionCleared=true;if(options.say)options.say('');}
            // Gentle start, then continuous forward travel; no blackout or flash.
            const camera=zoom<.12 ? zoom*zoom/.12 : zoom;
            livePainting(paintingContext,source,seconds);
            context.clearRect(0,0,width,height);context.globalAlpha=1;context.imageSmoothingEnabled=false;
            drawRect(context,painting,{x:mix(start.x,end.x,camera),y:mix(start.y,end.y,camera),width:mix(start.width,end.width,camera),height:mix(start.height,end.height,camera)});
            const dissolve=smooth(2.11,2.46,seconds);
            if(dissolve){context.imageSmoothingEnabled=true;context.globalAlpha=dissolve;drawRect(context,garden,gardenRect);context.globalAlpha=1;}
            if(seconds>=1.83&&!job.coverRequested){job.coverRequested=true;Promise.resolve().then(()=>config.onCovered()).then(()=>{if(current()){job.covered=true;job.revealedAt=performance.now();}},error=>finish(job,false,error));}
            const fade=job.covered?smooth(Math.max(began+2460,job.revealedAt),Math.max(began+2460,job.revealedAt)+230,now):0;
            canvas.style.opacity=String(1-fade);
            if(fade>=1){finish(job,false);return;}
            job.raf=requestAnimationFrame(tick);
          }
          job.raf=requestAnimationFrame(tick);
        })().catch(error=>finish(job,false,error));
      });
    }

    function detachWorld() {
      attachmentGeneration++;
      if (!attachment) return;
      attachment.dispose(); attachment = null;
      // Leave ordinary document flow and its remembered scroll position intact.
    }
    async function attachWorld(config = {}) {
      const doc=iframe.contentDocument, view=iframe.contentWindow;
      if(!doc||!view||!doc.querySelector('.garden')||!doc.querySelector('.world'))return {attached:false};
      if(attachment&&attachment.doc===doc)return {attached:true};
      detachWorld();
      const generation=attachmentGeneration;
      const current=()=>generation===attachmentGeneration&&iframe.contentDocument===doc;
      let controller;
      try {
        const module=await import(new URL('panda-film-controller.mjs',scriptURL).href);
        if(!current())return {attached:false,cancelled:true};
        controller=module.createPandaFilm({doc,view,isCurrent:current});
        attachment={doc,dispose:()=>controller.dispose()};
        const result=await controller.ready;
        if(!current()){controller.dispose();return {attached:false,cancelled:true};}
        return {attached:true,...result};
      } catch(error) {
        if(controller)controller.dispose();
        // The original embroidery page always remains a usable destination if
        // the enhancement itself is unavailable.
        if(current())doc.documentElement.classList.remove('panda-motion-document');
        return {attached:false,fallback:true,cancelled:!current()};
      }
    }
    return {enter,cancel,attachWorld,detachWorld};
  }
  global.CottagePanda={create};
})(window);
