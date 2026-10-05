import {initPandaGlass} from './panda-glass.mjs';

// One clock and one scroll owner for the garden document, including iframe use.
export function createPandaExperience({doc=document,view=doc.defaultView}={}) {
  const previous=view.__pandaExperience;
  if(previous&&!previous.disposed)return previous;
  const {gsap,ScrollTrigger,Lenis}=view;
  const reduced=view.matchMedia('(prefers-reduced-motion: reduce)');
  const removers=[];
  const on=(node,type,fn,options)=>{node.addEventListener(type,fn,options);removers.push(()=>node.removeEventListener(type,fn,options));};
  let lenis=null,context=null,disposed=false,modalOpen=false,stops=[],refreshFrame=0,nativeScrollFrame=0,returnTimer=0;
  const glass=initPandaGlass({doc,view});
  const layoutTop=node=>{let top=0;for(;node;node=node.offsetParent)top+=node.offsetTop;return top;};
  const active=()=>doc.documentElement.dataset.portfolioActive!=='false'&&!doc.hidden;
  const scrollTo=(target,options={})=>{
    view.cancelAnimationFrame(nativeScrollFrame);nativeScrollFrame=0;
    const node=typeof target==='string'?doc.querySelector(target):target;
    const top=typeof node==='number'?node:node?layoutTop(node):0;
    if(lenis)lenis.scrollTo(top,{duration:options.duration??1.05,immediate:reduced.matches||options.immediate,lock:false,force:true,onComplete:options.onComplete});
    else {
      const immediate=reduced.matches||options.immediate;
      const destination=Math.max(0,Math.min(top,doc.documentElement.scrollHeight-view.innerHeight));
      view.scrollTo({top:destination,behavior:immediate?'instant':'smooth'});
      if(immediate)options.onComplete?.();
      else if(options.onComplete){
        const deadline=view.performance.now()+2400;
        const check=()=>{
          nativeScrollFrame=0;
          if(disposed)return;
          if(Math.abs(view.scrollY-destination)<2)options.onComplete();
          else if(view.performance.now()<deadline)nativeScrollFrame=view.requestAnimationFrame(check);
        };
        nativeScrollFrame=view.requestAnimationFrame(check);
      }
    }
  };
  view.__pandaScrollTo=scrollTo;
  doc.documentElement.classList.add('panda-enhanced');
  const measure=()=>{
    const limit=Math.max(0,doc.documentElement.scrollHeight-view.innerHeight);
    stops=[...doc.querySelectorAll('#panda-film,#motion,#journey,#silk,#lingjing,#atelier,#wanxiang,#myth,#summary')].map(node=>Math.max(0,Math.min(limit,layoutTop(node)+(node.offsetHeight<=view.innerHeight*1.15?(node.offsetHeight-view.innerHeight)/2:0))));
    lenis?.resize();
  };
  const tick=time=>{if(active()&&!modalOpen)lenis?.raf(time*1000);};
  const sync=()=>{
    if(!lenis)return;
    if(active()&&!modalOpen){lenis.start();lenis.resize();}else lenis.stop();
  };
  function setup(){
    context?.revert();context=null;
    if(gsap)gsap.ticker.remove(tick);
    lenis?.destroy();lenis=null;
    doc.documentElement.dataset.pandaScroll='native';
    if(!reduced.matches&&gsap&&ScrollTrigger&&Lenis){
      gsap.registerPlugin(ScrollTrigger);
      lenis=new Lenis({autoRaf:false,lerp:.115,smoothWheel:true,syncTouch:false,anchors:false,
        prevent:node=>Boolean(node.closest('dialog,[data-lenis-prevent]')),
        virtualScroll:data=>{
          if(modalOpen||Math.abs(data.deltaX)>Math.abs(data.deltaY)||data.event?.shiftKey)return false;
          // Capture only a nearby reading position while wheel input is active.
          // No timer, mandatory paging, or delayed jump after the user has stopped.
          if(lenis&&Math.abs(data.deltaY)>5&&Math.abs(data.deltaY)<220){
            const from=lenis.targetScroll,projected=from+data.deltaY;
            const nearest=stops.reduce((best,point)=>Math.abs(point-projected)<Math.abs(best-projected)?point:best,Infinity);
            const distance=nearest-from;
            if(Math.abs(nearest-projected)<48&&Math.abs(distance)>3&&Math.sign(distance)===Math.sign(data.deltaY))data.deltaY=distance;
          }
          return true;
        }});
      lenis.on('scroll',ScrollTrigger.update);
      gsap.ticker.lagSmoothing(0);gsap.ticker.add(tick);
      doc.documentElement.dataset.pandaScroll='lenis';
      context=gsap.context(()=>{
        // Inner headings animate; legacy reveal containers and draggable rails do not.
        doc.querySelectorAll('.chapter h2,.scroll-heading h2,.journey-heading h2').forEach(node=>{
          gsap.fromTo(node,{y:22,opacity:.25},{y:0,opacity:1,duration:.65,ease:'power2.out',scrollTrigger:{trigger:node,start:'top 91%',once:true,toggleActions:'play none none none'}});
        });
        doc.querySelectorAll('.chapter p,.scroll-heading p').forEach(node=>{
          gsap.fromTo(node,{y:12,opacity:.55},{y:0,opacity:1,duration:.5,ease:'power2.out',scrollTrigger:{trigger:node,start:'top 92%',once:true,toggleActions:'play none none none'}});
        });
        doc.querySelectorAll('.atelier-work,.myth-card').forEach((node,index)=>{
          gsap.fromTo(node,{y:24+(index%2)*8,opacity:.55},{y:0,opacity:1,duration:.7,ease:'power2.out',scrollTrigger:{trigger:node,start:'top 94%',once:true,toggleActions:'play none none none'}});
        });
        doc.querySelectorAll('.closing-art > img,.gate-art > img').forEach(node=>{
          gsap.fromTo(node,{yPercent:-3,scale:1.07},{yPercent:3,scale:1.07,ease:'none',scrollTrigger:{trigger:node.parentElement,start:'top bottom',end:'bottom top',scrub:.7}});
        });
        const finale=doc.querySelector('.panda-finale');
        if(finale){
          gsap.fromTo(finale.querySelector('.panda-finale-panel'),{y:24,scale:.985,opacity:.82,'--panda-finale-blur':'3px'},{y:0,scale:1,opacity:1,'--panda-finale-blur':'10px',ease:'none',scrollTrigger:{trigger:finale,start:'top 84%',end:'top 28%',scrub:.45}});
          gsap.fromTo(finale.querySelector('.panda-finale-backdrop img'),{scale:1.07,yPercent:-2},{scale:1.02,yPercent:1,ease:'none',scrollTrigger:{trigger:finale,start:'top bottom',end:'bottom bottom',scrub:.7}});
        }
      },doc.body);
    }
    measure();sync();ScrollTrigger?.refresh();
  }
  on(view,'panda:modal-open',()=>{modalOpen=true;lenis?.stop();});
  on(view,'panda:modal-close',event=>{
    modalOpen=false;
    if(lenis){lenis.resize();lenis.scrollTo(event.detail.scrollY,{immediate:true,force:true});}
    sync();ScrollTrigger?.update();
  });
  const activeObserver=new view.MutationObserver(sync);
  activeObserver.observe(doc.documentElement,{attributes:true,attributeFilter:['data-portfolio-active']});
  on(doc,'visibilitychange',sync);
  on(reduced,'change',setup);
  const scheduleRefresh=()=>{
    if(refreshFrame||disposed)return;
    refreshFrame=view.requestAnimationFrame(()=>{refreshFrame=0;measure();ScrollTrigger?.refresh();});
  };
  on(view,'resize',scheduleRefresh,{passive:true});
  doc.querySelectorAll('img').forEach(img=>{if(!img.complete)on(img,'load',scheduleRefresh,{once:true});});
  doc.fonts.ready.then(()=>{if(!disposed)scheduleRefresh();});
  // Return links work in the standalone review as well as through the parent bridge.
  on(doc,'click',event=>{
    const link=event.target.closest('[data-project-return]');
    if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||view.frameElement)return;
    event.preventDefault();
    doc.documentElement.classList.add('panda-leaving');
    view.clearTimeout(returnTimer);
    returnTimer=view.setTimeout(()=>{if(!disposed)view.location.assign(link.href);},reduced.matches?0:300);
  });
  setup();
  const api={disposed:false,scrollTo,get lenis(){return lenis;},dispose(){
    if(disposed)return;disposed=true;api.disposed=true;
    removers.forEach(remove=>remove());activeObserver.disconnect();
    view.clearTimeout(returnTimer);view.cancelAnimationFrame(refreshFrame);view.cancelAnimationFrame(nativeScrollFrame);gsap?.ticker.remove(tick);context?.revert();lenis?.destroy();glass.dispose();
    if(view.__pandaScrollTo===scrollTo)delete view.__pandaScrollTo;
    doc.documentElement.classList.remove('panda-enhanced');
  }};
  view.__pandaExperience=api;
  return api;
}
