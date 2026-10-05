(() => {
  'use strict';
  function create({host,worldView,iframe,announce=()=>{}}) {
    let active=null;
    let ceilingPromise;
    function preload() {
      ceilingPromise ||= (async()=>{const image=new Image();image.src='assets/S08-cottage-ceiling-v1.png';await image.decode();return image;})().catch(error=>{ceilingPromise=null;throw error;});
      return ceilingPromise;
    }
    const dialogue=document.createElement('div');
    dialogue.className='story-dialogue';dialogue.hidden=true;dialogue.setAttribute('aria-hidden','true');host.append(dialogue);
    function say(text='') {dialogue.textContent=text;dialogue.hidden=!text;if(text)announce(text);}
    function valid(job) {
      if(active!==job||job.cancelled)return false;
      if(job.options.isCurrent&&!job.options.isCurrent()){active=null;cleanup(job);job.resolve({cancelled:true});return false;}
      return true;
    }
    function cleanup(job) {for(const a of job.animations)a.cancel();for(const node of job.nodes)node.remove();say('');delete host.dataset.narrative;}
    function cancel() {if(active){const job=active;active=null;job.cancelled=true;cleanup(job);job.resolve({cancelled:true});}say('');}
    async function tween(job,node,frames,duration,easing='linear') {
      if(!valid(job))return;
      const a=node.animate(frames,{duration,easing,fill:'forwards'});job.animations.push(a);
      await a.finished.catch(()=>{});
    }
    async function pause(job,ms) {await new Promise(resolve=>setTimeout(resolve,ms));return valid(job);}
    function node(job,tag,cls,parent=host) {const el=document.createElement(tag);el.className=cls;parent.append(el);if(parent===host)job.nodes.push(el);return el;}
    function imageAt(parent,source,r) {const image=document.createElement('img');image.src=source.src;image.alt='';image.style.cssText=`left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px`;parent.append(image);}
    function run(options,body) {
      cancel();
      return new Promise((resolve,reject)=>{
        const job={options,resolve,reject,nodes:[],animations:[],cancelled:false};active=job;
        (async()=>{try{await body(job);if(!valid(job))return;active=null;cleanup(job);resolve({cancelled:false});}catch(error){if(active===job){active=null;cleanup(job);reject(error);}}})();
      });
    }
    function incense(options) {return run(options,async job=>{
      const [ceilingImage]=await Promise.all([preload(),options.onPrepare?.()]);if(!valid(job))return;
      host.dataset.narrative='incense';
      options.onStart?.();
      const layer=node(job,'div','story-layer');layer.setAttribute('aria-hidden','true');
      const camera=node(job,'div','story-camera',layer);imageAt(camera,options.source,options.sourceRect);
      const ghost=node(job,'div','story-ghost',layer);imageAt(ghost,options.source,options.sourceRect);
      const ceiling=node(job,'div','story-ceiling',layer);ceiling.style.backgroundImage=`url("${ceilingImage.src}")`;
      const ceilingEcho=node(job,'div','story-ceiling-echo',layer);ceilingEcho.style.backgroundImage=`url("${ceilingImage.src}")`;
      const haze=node(job,'div','story-haze',layer);
      const smoke=node(job,'div','story-smoke',layer);
      smoke.innerHTML='<svg viewBox="0 0 100 160" width="100%" height="100%" aria-hidden="true"><path d="M48 155C80 122 15 113 51 80S73 38 44 8"/><path d="M55 160C30 125 84 105 60 76S28 37 54 1" opacity=".5"/></svg>';
      const darkness=node(job,'div','story-unconscious',layer);
      const r=options.sourceRect,focus=[r.x+r.width*.365,r.y+r.height*.45];
      camera.style.transformOrigin=ghost.style.transformOrigin=focus.map(v=>v+'px').join(' ');
      const tx=(innerWidth/2-focus[0])*.66,ty=(innerHeight/2-focus[1])*.66;
      const near=`translate(${tx}px,${ty}px) scale(2.12)`;
      layer.dataset.phase='near';
      say('木香慢慢散开了。');
      await Promise.all([
        tween(job,camera,[{transform:'none'},{transform:near}],1150,'cubic-bezier(.22,.5,.32,1)'),
        tween(job,smoke,[{opacity:0,transform:'translateY(25px) scale(.6)'},{opacity:.3,transform:'translateY(-20px) scale(1.35)'}],1150)
      ]);if(!valid(job))return;
      await pause(job,350);if(!valid(job))return;
      say('等等……怎么有一点……');
      layer.dataset.phase='dizzy';
      ghost.style.transform=near;
      await Promise.all([
        tween(job,camera,[{transform:near,filter:'blur(0px)'},{transform:near+' rotate(-2deg)',filter:'blur(.4px)',offset:.3},{transform:near+' rotate(3.5deg)',filter:'blur(1.2px)',offset:.65},{transform:near+' rotate(-5deg)',filter:'blur(1.8px)'}],1000,'ease-in-out'),
        tween(job,ghost,[{opacity:0,transform:near},{opacity:.13,transform:near+' translate(12px,-5px) rotate(2deg)',offset:.6},{opacity:.08,transform:near+' translate(-15px,4px) rotate(-3deg)'}],1000,'ease-in-out'),
        tween(job,haze,[{opacity:0},{opacity:.7}],1000)
      ]);if(!valid(job))return;
      say('');
      layer.dataset.phase='falling';
      await Promise.all([
        tween(job,camera,[{transform:near+' rotate(-5deg)',filter:'blur(1.8px)'},{transform:'translateY(45%) scale(1.7) rotate(22deg) rotateX(38deg)',filter:'blur(3px)'}],680,'cubic-bezier(.4,0,.65,1)'),
        tween(job,ceiling,[{opacity:0,transform:'translateY(-65%) scale(1.6) rotate(-23deg)',filter:'blur(1.8px)'},{opacity:1,transform:'translate(1.5%,1%) scale(1.10) rotate(5.5deg)',filter:'blur(2.8px)'}],680,'cubic-bezier(.4,0,.5,1)'),
        tween(job,ceilingEcho,[{opacity:0,transform:'translate(10px,-65%) scale(1.62) rotate(-21deg)',filter:'blur(2.8px)'},{opacity:.10,transform:'translate(2.4%,.3%) scale(1.115) rotate(7deg)',filter:'blur(4px)'}],680,'cubic-bezier(.4,0,.5,1)'),
        tween(job,ghost,[{opacity:.08},{opacity:0}],450),tween(job,smoke,[{opacity:.3},{opacity:0}],450)
      ]);if(!valid(job))return;
      // The viewpoint never settles after impact. Residual roll and a drifting
      // double image continue while focus and awareness gradually disappear.
      layer.dataset.phase='fading';
      await Promise.all([
        tween(job,ceiling,[
          {transform:'translate(1.5%,1%) scale(1.10) rotate(5.5deg)',filter:'blur(2.8px)'},
          {transform:'translate(-1%,1.4%) scale(1.105) rotate(2.5deg)',filter:'blur(5px)',offset:.32},
          {transform:'translate(.6%,.4%) scale(1.11) rotate(6.8deg)',filter:'blur(9.5px)',offset:.69},
          {transform:'translate(-1.7%,1.8%) scale(1.12) rotate(3.4deg)',filter:'blur(14px)'}
        ],1320),
        tween(job,ceilingEcho,[
          {opacity:.10,transform:'translate(2.4%,.3%) scale(1.115) rotate(7deg)',filter:'blur(4px)'},
          {opacity:.12,transform:'translate(-.2%,2%) scale(1.12) rotate(4deg)',filter:'blur(8px)',offset:.42},
          {opacity:.10,transform:'translate(-2.5%,.8%) scale(1.135) rotate(5deg)',filter:'blur(16px)'}
        ],1320),
        tween(job,darkness,[{opacity:0},{opacity:.10,offset:.22},{opacity:.32,offset:.53},{opacity:.72,offset:.82},{opacity:1}],1320)
      ]);
      if(!valid(job))return;
      layer.dataset.phase='black';
      await pause(job,180);if(!valid(job))return;
      await options.onReady();if(!valid(job))return;
      camera.style.visibility=ghost.style.visibility=ceiling.style.visibility=ceilingEcho.style.visibility=haze.style.visibility=smoke.style.visibility='hidden';
      layer.dataset.phase='recovering';
      await Promise.all([
        tween(job,darkness,[{opacity:1},{opacity:0}],1050,'cubic-bezier(.25,.65,.3,1)'),
        tween(job,worldView,[{filter:'blur(7px)'},{filter:'blur(0px)'}],1050,'cubic-bezier(.25,.65,.3,1)')
      ]);
    });}
    function blackout(options) {return run(options,async job=>{
      host.dataset.narrative='return';
      const curtain=node(job,'div','story-black');
      await tween(job,curtain,[{opacity:0},{opacity:1}],280);if(!valid(job))return;
      await options.onCovered();if(!valid(job))return;
      await pause(job,110);if(!valid(job))return;
      await tween(job,curtain,[{opacity:1},{opacity:0}],420);
    });}
    function swapWorld(options) {return run(options,async job=>{
      // Preserve the actual responsive page and its reading position while the
      // single interactive iframe loads its next document underneath.
      const original=iframe.contentDocument,top=iframe.contentWindow.scrollY;
      const copy=original.documentElement.cloneNode(true);
      copy.querySelectorAll('script').forEach(el=>el.remove());
      const liveCanvases=[...original.querySelectorAll('canvas')];
      copy.querySelectorAll('canvas').forEach((canvas,index)=>{
        const image=document.createElement('img');
        for(const attr of canvas.attributes)image.setAttribute(attr.name,attr.value);
        image.src=liveCanvases[index].toDataURL();image.alt='';
        canvas.replaceWith(image);
      });
      const base=document.createElement('base');base.href=iframe.contentWindow.location.href;
      copy.querySelector('head').prepend(base);
      const frozen=node(job,'iframe','story-page-snapshot');
      frozen.setAttribute('aria-hidden','true');frozen.tabIndex=-1;
      frozen.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0;z-index:22;pointer-events:none;visibility:hidden;background:transparent';
      frozen.srcdoc='<!doctype html>'+copy.outerHTML;
      await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Page snapshot timeout')),4000);frozen.onload=()=>{clearTimeout(timeout);resolve();};});
      if(!valid(job))return;
      await frozen.contentDocument.fonts.ready;if(!valid(job))return;
      frozen.contentDocument.documentElement.style.scrollBehavior='auto';
      frozen.contentWindow.scrollTo(0,top);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(!valid(job))return;
      frozen.style.visibility='visible';
      await options.onCovered();if(!valid(job))return;
      await tween(job,frozen,[{opacity:1},{opacity:0}],420);
    });}
    return {incense,blackout,swapWorld,say,cancel,preload};
  }
  window.CottageStory={create};
})();
