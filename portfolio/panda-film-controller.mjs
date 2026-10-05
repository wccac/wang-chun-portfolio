import {createPandaExperience} from './panda-experience.mjs?v=20261005-review';

/* Click-to-play, with no scroll ownership or automatic page advancement. */
export function createPandaFilm({doc=document,view=doc.defaultView,isCurrent=()=>true}={}) {
  const previous=view.__pandaFilmController;
  if(previous&&!previous.disposed)return previous;
  const hero=doc.querySelector('.panda-film-hero'),video=hero?.querySelector('video');
  if(!hero||!video)return {ready:Promise.resolve({mode:'original'}),dispose(){}};
  const experience=createPandaExperience({doc,view});
  const toggle=hero.querySelector('.panda-film-toggle'),playButton=hero.querySelector('.panda-film-play');
  const playPosition=hero.querySelector('.panda-film-play-position');
  const progress=hero.querySelector('.panda-film-progress span'),time=hero.querySelector('.panda-film-time');
  const seek=hero.querySelector('.panda-film-seek');
  const message=hero.querySelector('.panda-film-message');
  const removers=[];
  let visible=false,disposed=false,loaded=false,playPending=false,resumeAfterPending=false,unavailable=false,hasStarted=false,wantsPlay=false,replayPending=false,seeking=false,seekResume=false;
  const on=(node,name,handler,options)=>{node.addEventListener(name,handler,options);removers.push(()=>node.removeEventListener(name,handler,options));};
  video.muted=true;video.defaultMuted=true;video.removeAttribute('autoplay');
  doc.documentElement.dataset.pandaPresentation='film';
  function parentVisible(){
    try{
      const frame=view.frameElement;
      if(!frame)return true;
      const style=frame.ownerDocument.defaultView.getComputedStyle(frame);
      return !frame.closest('[hidden]')&&style.visibility!=='hidden'&&style.display!=='none';
    }catch(_){return true;}
  }
  const canPlay=()=>visible&&isCurrent()&&parentVisible()&&!doc.hidden&&!disposed;
  function state(value){
    hero.dataset.filmState=value;
    const playing=value==='playing',loading=value==='loading';
    toggle.hidden=!hasStarted||loading;
    toggle.setAttribute('aria-label',playing?'暂停花园漫游':value==='ended'?'重新播放花园漫游':'继续花园漫游');
    playPosition.hidden=playing;
    playButton.setAttribute('aria-label',loading?'取消播放':value==='ended'||value==='unavailable'?'重新播放花园漫游':hasStarted?'继续播放花园漫游':'播放花园漫游');
    hero.setAttribute('aria-busy',String(loading));
    message.textContent=value==='unavailable'?'暂时无法加载，请点击重试。':value==='blocked'?'点击播放，即可继续游园。':loading?'正在准备漫游…':'';
  }
  function updateTime(){
    if(progress)progress.style.transform=`scaleX(${video.duration?video.currentTime/video.duration:0})`;
    if(time){const stamp=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;time.textContent=`${stamp(video.currentTime||0)} / ${stamp(Math.ceil(video.duration||43.8))}`;}
    if(seek){
      const duration=Number.isFinite(video.duration)?video.duration:0;
      seek.disabled=!duration;
      if(duration)seek.max=String(duration);
      if(!seeking)seek.value=String(video.currentTime||0);
      const seconds=Math.floor(video.currentTime||0);
      seek.setAttribute('aria-valuetext',`${Math.floor(seconds/60)}分${String(seconds%60).padStart(2,'0')}秒，共${Math.ceil(duration||43.8)}秒`);
      seek.style.setProperty('--panda-seek-progress',`${duration?video.currentTime/duration*100:0}%`);
    }
  }
  function load(){
    if(loaded)return;
    loaded=true;
    video.querySelectorAll('source[data-src]').forEach(source=>{source.src=source.dataset.src;});
    video.load();
  }
  async function play(){
    if(!wantsPlay||!canPlay()||seeking)return;
    if(playPending){resumeAfterPending=true;return;}
    if(unavailable){unavailable=false;loaded=false;}
    load();playPending=true;hasStarted=true;
    if(!hero.classList.contains('has-film-frame')||video.readyState<2)state('loading');
    try{
      await video.play();
      if(!wantsPlay||!canPlay()||seeking)video.pause();
      else state('playing');
    }catch(error){
      if(!disposed&&error.name!=='AbortError'){wantsPlay=false;if(!unavailable)state('blocked');}
    }finally{
      playPending=false;
      if(resumeAfterPending){resumeAfterPending=false;if(wantsPlay&&canPlay()&&!seeking&&video.paused)play();}
    }
  }
  function sync(){
    if(disposed)return;
    const active=isCurrent()&&parentVisible();
    doc.documentElement.dataset.portfolioActive=String(active);
    if(!canPlay()){
      wantsPlay=false;seeking=false;seekResume=false;resumeAfterPending=false;video.pause();
      if(!unavailable)state(video.ended?'ended':hasStarted?'paused':'idle');
    }
    // Returning to the viewport never starts or resumes a film by itself.
  }
  function measure(){
    const r=hero.getBoundingClientRect();
    visible=Math.min(r.bottom,view.innerHeight)-Math.max(r.top,0)>Math.min(r.height,view.innerHeight)*.2;
    sync();
  }
  const visibility=new view.IntersectionObserver(entries=>{visible=entries[0].intersectionRatio>.2;sync();},{threshold:[0,.2,.5,1]});
  visibility.observe(hero);
  const parentObservers=[];
  try{
    const frame=view.frameElement;
    if(frame){
      const observer=new frame.ownerDocument.defaultView.MutationObserver(sync);
      for(let node=frame;node;node=node.parentElement)observer.observe(node,{attributes:true,attributeFilter:['hidden','style','class','data-mode','data-project']});
      parentObservers.push(observer);
    }
  }catch(_){}
  on(video,'playing',()=>{
    if(!wantsPlay||!canPlay()||seeking){video.pause();return;}
    hero.classList.add('has-film-frame');state('playing');updateTime();
  });
  on(video,'pause',()=>{if(!disposed&&!unavailable&&!video.ended&&!seeking)state(hasStarted?'paused':'idle');});
  on(video,'timeupdate',updateTime);
  on(video,'loadedmetadata',updateTime);
  on(video,'ended',()=>{wantsPlay=false;state('ended');updateTime();});
  on(video,'error',()=>{unavailable=true;wantsPlay=false;video.pause();state('unavailable');});
  on(video,'volumechange',()=>{if(!video.muted)video.muted=true;});
  function togglePlayback(){
    replayPending=false;
    if(wantsPlay||!video.paused){wantsPlay=false;video.pause();state('paused');return;}
    if(video.ended)video.currentTime=0;
    measure();wantsPlay=true;play();
  }
  on(toggle,'click',togglePlayback);
  on(playButton,'click',togglePlayback);
  if(seek){
    const finishSeek=()=>{
      if(!seeking)return;
      seeking=false;
      const resume=seekResume;seekResume=false;
      if(resume&&canPlay()){wantsPlay=true;play();}
      else{wantsPlay=false;state(video.ended?'ended':'paused');}
      updateTime();
    };
    on(seek,'pointerdown',()=>{if(seek.disabled)return;seeking=true;seekResume=wantsPlay;video.pause();});
    on(seek,'input',()=>{
      if(!Number.isFinite(video.duration))return;
      video.currentTime=Math.max(0,Math.min(video.duration,Number(seek.value)));
      hero.classList.add('has-film-frame');updateTime();
    });
    on(seek,'change',finishSeek);
    on(view,'pointerup',finishSeek);
    on(view,'pointercancel',finishSeek);
    on(seek,'blur',finishSeek);
  }
  const replay=doc.querySelector('.panda-finale-replay');
  if(replay)on(replay,'click',()=>{
    wantsPlay=false;video.pause();replayPending=true;
    // Explicit replay returns to the player, never to the top cover.
    experience.scrollTo('#panda-film',{duration:1.05,onComplete:()=>{
      if(!replayPending||disposed)return;
      replayPending=false;measure();video.currentTime=0;wantsPlay=true;play();
    }});
  });
  on(view,'wheel',()=>{replayPending=false;},{passive:true});
  on(view,'touchstart',()=>{replayPending=false;},{passive:true});
  on(doc,'visibilitychange',sync);
  on(view,'resize',measure,{passive:true});
  on(view,'pagehide',()=>{wantsPlay=false;video.pause();});
  const api={
    disposed:false,
    ready:Promise.resolve({mode:'click-to-play',scrollMode:experience.lenis?'lenis':'native'}),
    dispose(){
      if(disposed)return;disposed=true;api.disposed=true;wantsPlay=false;
      doc.documentElement.dataset.portfolioActive='false';
      doc.querySelectorAll('video,audio').forEach(media=>media.pause());
      visibility.disconnect();parentObservers.forEach(observer=>observer.disconnect());removers.forEach(remove=>remove());
      experience.dispose();
    }
  };
  view.__pandaFilmController=api;
  state('idle');measure();
  return api;
}
