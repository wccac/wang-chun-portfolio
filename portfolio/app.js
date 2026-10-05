(() => {
  'use strict';
  if('scrollRestoration' in history) history.scrollRestoration='manual';
  const $ = (s) => document.querySelector(s);
  const app = $('#experience'), scenes = $('#scenes'), hotspots = $('#hotspots');
  const worldView = $('#world-view'), iframe = $('#world-frame');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const story=CottageStory.create({host:app,worldView,iframe,announce});
  const book=CottageBook.create({host:app,worldView,iframe,announce,say:story.say});
  const panda=CottagePanda.create({host:app,worldView,iframe,announce,say:story.say});
  const images = {
    exterior: '../S01-pixel-cottage-exterior-v1.png',
    doorway: '../S02-pixel-cottage-doorway-v2.png',
    open: 'assets/S02-doorway-open-v1.png',
    room: '../S03-pixel-cottage-interior-v1.png',
    approach: '../S04-pixel-cottage-desk-approach-v1.png',
    desk: '../S05-pixel-cottage-desktop-v1.png',
    painting: '../S06-pixel-cottage-panda-painting-v1.png',
  };
  const descriptions = {
    exterior: '绿树与草地之间的青绿屋顶木屋，一条小径通向正门',
    doorway: '门前的木门、暖灯与两侧花盆',
    open: '木门向内开启，露出温暖的室内',
    room: '木屋里左边是床和熊猫画，右边书桌上放着檀晷与苦瓜书',
    approach: '走到书桌前，左侧香盒，右侧苦瓜书',
    desk: '俯看桌面，左边檀晷香盒，右边 BITTER MELON 书籍',
    painting: '床头上方，木框里的牡丹熊猫花园',
  };
  const config = {
    exterior: { location: '庭院', title: '推开门，看看我做的东西。', hint: '点击小屋，开始探索', actions: [{id:'enter', label:'走近小屋', rect:[50,44,37,46], marker:[50,71.7]}]},
    room: { location: '小屋里', title: '桌上有作品，墙上有一座花园。', hint: '选择书桌或床上方的画', back:'回到庭院', actions:[{id:'desk',label:'看看工作桌',rect:[68.5,49,30,25]},{id:'painting',label:'走近熊猫画',rect:[23.8,13.7,13.8,17]}]},
    approach: { location: '书桌前', title: '又回到了熟悉的书桌前。', hint: '选择香盒，或拿起苦瓜书', back:'回到屋内', actions:[{id:'tangui',label:'靠近闻一闻檀香',rect:[42.7,53.6,14,24]},{id:'bitter',label:'拿起苦瓜书',rect:[65.4,54.1,14,24]}]},
    desk: { location: '工作桌', title: '从一件物品，走进一个世界。', hint: '选择香盒，或翻开这本书', back:'回到屋内', actions:[{id:'tangui',label:'檀晷 · 香与时间',rect:[33.8,52.7,18,35]},{id:'bitter',label:'苦瓜 · 从种子到滋味',rect:[69.4,53.7,18.3,35]}]},
    painting: { location: '画前', title: '花木之间，藏着另一个世界。', hint: '点击画面，走进牡丹熊猫花园', back:'回到屋内', actions:[{id:'panda',label:'走进画中花园',rect:[48.4,32.6,33.6,40.7]}]},
  };
  const projects = {tangui:{name:'檀晷',color:'#e7e0d4',returnScene:'approach',focus:[33.8,52.7]},bitter:{name:'BITTER MELON',color:'#10110f',returnScene:'approach',focus:[69.4,53.7]},panda:{name:'牡丹熊猫花园',color:'#314d3d',returnScene:'painting',focus:[48.4,32.6]}};
  const pendingImages = new Map();
  let activeLayer = null, currentScene = null, route = null, run = 0, busy = false, intro = false;
  let directoryOpener = null, soundEnabled = true, audio = null, audioBus = null, lastFailure = null;
  let settledRoute=null, transitionContext=null, navigationIntent=0, curtainAnimation=null, simplifiedMotion=false;
  const visitedProjects=new Set(), curtain=$('#interaction-curtain');
  let storage;
  try {
    storage = window.sessionStorage; soundEnabled = storage.getItem('cottage-sound') !== 'off';
    simplifiedMotion=storage.getItem('cottage-simplified-motion')==='on';
    for(const project of JSON.parse(storage.getItem('cottage-visited-projects')||'[]'))if(projects[project])visitedProjects.add(project);
  } catch (_) {}
  const reducedMotion=()=>motion.matches||simplifiedMotion;
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, reducedMotion() ? 0 : ms));
  const animate = (el, frames, opts) => {
    if (!el) return Promise.resolve();
    const a = el.animate(frames, {duration:500, easing:'cubic-bezier(.22,.8,.22,1)',fill:'forwards',...opts,...(reducedMotion()?{duration:0}:{})});
    return a.finished.catch(() => {});
  };
  function announce(text) { $('#live-status').textContent = text; }
  function loadImage(name) {
    if (!pendingImages.has(name)) pendingImages.set(name, new Promise((resolve,reject) => {
      const image = new Image();
      const timeout = setTimeout(() => { pendingImages.delete(name); reject(new Error('image timeout')); }, 15000);
      image.onload = async () => {clearTimeout(timeout); try { await image.decode(); } catch (_) {} resolve(image);};
      image.onerror = () => {clearTimeout(timeout);pendingImages.delete(name);reject(new Error('image unavailable'));};
      image.src = images[name];
    }));
    return pendingImages.get(name);
  }
  function makeLayer(name) {
    const layer = document.createElement('div'); layer.className = 'scene-layer'; layer.dataset.scene = name;
    const image = document.createElement('img'); image.src = images[name]; image.alt = descriptions[name]; image.draggable = false; layer.append(image);
    const ambient = document.createElement('div'); ambient.className = 'ambient'; ambient.ariaHidden = 'true';
    for(let i = 0; i < 12; i++) { const mote = document.createElement('i');mote.className='mote';mote.style.cssText=`left:${8+(i*19)%84}%;top:${20+(i*13)%70}%;--duration:${8+i%5}s;--delay:-${i*1.7}s`;ambient.append(mote); }
    const lamps = {room:[[33.3,26],[56.8,39]],approach:[[34.7,34]],desk:[[18.5,19]],painting:[[74.8,58]],doorway:[[37.5,32]],open:[[37.5,32]]};
    for(const p of lamps[name]||[]) { const glow=document.createElement('i');glow.className='lamp-glow';glow.style.left=p[0]+'%';glow.style.top=p[1]+'%';ambient.append(glow); }
    layer.append(ambient);return layer;
  }
  function clearAnimations() {
    story.cancel();book.cancel();panda.cancel();
    for(const el of [scenes,worldView,$('#knock')]) for(const a of el.getAnimations({subtree:true})) a.cancel();
    if(activeLayer) { activeLayer.style.transform='';activeLayer.style.opacity='1'; }
    for(const el of [...scenes.children]) if(el!==activeLayer) el.remove();
    worldView.style.opacity='1';worldView.style.transform='';$('#knock').classList.remove('active');
  }
  function status(text, allowSkip=false) {
    $('#transition-copy').textContent=text;$('#transition-status').hidden=!text;
    $('#skip-button').hidden=!text||!(allowSkip||transitionContext?.canSkip);
    $('#cancel-transition').hidden=!text||!transitionContext?.source;
    if(text)announce(text);
  }
  function setBusy(value) {
    busy=value;app.setAttribute('aria-busy',String(value));
    $('#directory-toggle').disabled=false;
    if(value){$('#back-button').hidden=false;$('#back-button').setAttribute('aria-label','取消当前进入，返回原场景');$('#replay-button').hidden=true;}
  }
  function setPreparing(value,token) {
    if(token!==run)return;
    app.dataset.preparing=String(value);$('#transition-loading').hidden=!value;
    hotspots.querySelectorAll('.hotspot').forEach(button=>{
      const loading=value&&button.dataset.action===transitionContext?.action;
      button.classList.toggle('is-loading',loading);button.setAttribute('aria-busy',String(loading));
    });
  }
  async function fadeCurtain(opacity) {
    const start=Number(getComputedStyle(curtain).opacity)||0;
    curtain.style.opacity=String(start);curtainAnimation?.cancel();
    if(start===opacity){curtain.style.opacity=String(opacity);return;}
    const animation=curtain.animate([{opacity:start},{opacity}],{duration:reducedMotion()?100:opacity?150:220,easing:'ease-out',fill:'forwards'});
    curtainAnimation=animation;await animation.finished.catch(()=>{});
    if(curtainAnimation===animation){curtain.style.opacity=String(opacity);animation.cancel();curtainAnimation=null;}
  }
  function cancelTransition() {
    if(!busy||!transitionContext?.source)return;
    navigate({...transitionContext.source},{replace:true,instant:true,focusAction:transitionContext.action});
  }
  function skipTransition() {
    if(!busy||!transitionContext)return;
    navigate({...transitionContext.target},{replace:true,instant:true,quick:true});
  }
  function updateMotionPreference() {
    app.dataset.reducedMotion=String(reducedMotion());
    const control=$('#motion-toggle');control.checked=reducedMotion();control.disabled=motion.matches;
    control.title=motion.matches?'正在跟随系统的减少动态设置':'';
    try {
      iframe.contentDocument?.documentElement.setAttribute('data-cottage-reduced-motion',String(reducedMotion()));
      iframe.contentWindow?.dispatchEvent(new CustomEvent('portfolio:motion-change',{detail:{reduced:reducedMotion()}}));
    } catch (_) {}
  }
  async function sceneTo(name, token, options={}) {
    await loadImage(name); if(token!==run) return;
    const old=activeLayer, next=makeLayer(name), d=reducedMotion()||options.instant?0:(options.duration||620);
    const focus=options.focus||[50,50], scale=Math.max(1,options.scale||1.3);
    activeLayer=next;currentScene=name;scenes.append(next);
    $('#scene-viewport').style.setProperty('--scene-backdrop', `url("${images[name]}")`);
    if(!old || !d) { if(old) old.remove();next.style.opacity='1';return; }
    const startTransform=getComputedStyle(old).transform;
    old.style.transformOrigin=`${focus[0]}% ${focus[1]}%`;
    next.style.transformOrigin=options.inOrigin||'50% 50%';
    const shiftX=(50-focus[0])*(options.shift??.35), shiftY=(50-focus[1])*(options.shift??.35);
    // The outgoing image stays opaque beneath the incoming image, so their
    // combined coverage never exposes the dark stage during the dissolve.
    const effects=[
      animate(old,[{transform:startTransform==='none'?'translate(0,0) scale(1)':startTransform},{transform:`translate(${shiftX}%,${shiftY}%) scale(${scale})`}],{duration:d,easing:'linear'}),
      animate(next,[{transform:`scale(${options.reverse?1.08:1.045})`},{transform:'scale(1)'}],{duration:d,easing:'linear'}),
      animate(next,[{opacity:0},{opacity:0,offset:.2},{opacity:1}],{duration:d,easing:'linear'})
    ];
    await Promise.all(effects);
    if(token!==run) return;old.remove();next.getAnimations().forEach(a=>a.cancel());next.style.transform='';next.style.opacity='1';
  }
  function parseRoute() {
    const parts=location.hash.replace(/^#\/?/,'').split('/');const key=parts[0];
    if(projects[key]) return {type:'world',project:key,page:parts[1]==='detail'?'detail':'world'};
    return {type:'scene',scene:({room:'room',desk:'desk',approach:'approach',painting:'painting'})[key]||'exterior'};
  }
  function routeHash(target) {return '#'+(target.type==='world'?target.project+(target.page==='detail'?'/detail':''):target.scene==='exterior'?'cottage':target.scene);}
  function updateHistory(target, replace) { const hash=routeHash(target);if(location.hash!==hash || replace) history[replace?'replaceState':'pushState']({cottage:true,...target},'',hash); }
  function renderSceneUI(name, focusAction) {
    const c=config[name];if(!c)return;
    app.dataset.scene=name;app.dataset.surface='scene';$('#replay-button').hidden=true;
    $('#location').textContent=c.location;$('#scene-title').textContent=c.title;$('#scene-hint').textContent=c.hint;
    $('#back-button').hidden=!c.back;$('#back-button').setAttribute('aria-label',c.back||'返回');
    hotspots.replaceChildren();$('#mobile-actions').replaceChildren();
    for(const item of c.actions) {
      const b=document.createElement('button');b.type='button';b.className='hotspot';b.dataset.action=item.id;b.setAttribute('aria-label',item.label);
      const marker=item.marker||[50,50];
      // The authored rectangle only locates the marker. It is never a hit area.
      // A clipped child matches the visible circle, including after transforms.
      const x=item.rect[0]+item.rect[2]*(marker[0]/100-.5),y=item.rect[1]+item.rect[3]*(marker[1]/100-.5);
      b.style.cssText=`left:${x}%;top:${y}%`;
      const halo=document.createElement('span');halo.className='ripple-halo';halo.setAttribute('aria-hidden','true');
      halo.style.setProperty('--ripple-delay',`${c.actions.indexOf(item)*-.65}s`);
      for(const kind of ['ripple-ring','ripple-ring','ripple-core']){const ring=document.createElement('i');ring.className=kind;halo.append(ring);}
      const hit=document.createElement('span');hit.className='hotspot-hit';hit.setAttribute('aria-hidden','true');
      const inside=(x,y)=>document.elementFromPoint(x,y)?.closest('.hotspot')===b;
      // Mobile browsers can retarget a near-miss tap and move the synthetic
      // click coordinates onto a button. Check the original touch instead.
      const exactTouch=event=>{
        const touch=event.changedTouches[0];
        if(touch&&!inside(touch.clientX,touch.clientY))event.preventDefault();
      };
      b.addEventListener('touchstart',exactTouch,{passive:false});
      b.addEventListener('touchend',exactTouch,{passive:false});
      b.append(halo,hit);b.addEventListener('click',event=>{
        if(event.detail===0||inside(event.clientX,event.clientY))action(item.id);
      });hotspots.append(b);
    }
    announce(c.location+'。'+c.hint);
    if(focusAction) requestAnimationFrame(()=>hotspots.querySelector(`[data-action="${focusAction}"]`)?.focus({preventScroll:true}));
  }
  function audioContext() {
    if(!audio) {
      audio = new (window.AudioContext||window.webkitAudioContext)();
      audioBus=audio.createGain();audioBus.gain.value=soundEnabled?1:0;audioBus.connect(audio.destination);
    }
    return audio;
  }
  function unlockAudio() {
    if(!soundEnabled)return;
    try {const context=audioContext();if(context.state==='suspended')context.resume().catch(()=>{});}catch(_){}
  }
  function sound(kind, delay=0) {
    if(!soundEnabled)return;
    try {
      const context=audioContext();
      const play=()=>{
        if(!soundEnabled||context.state!=='running')return;
        const start=context.currentTime+delay;
        const tone=(type,frequency,endFrequency,volume,offset,duration)=>{
          const oscillator=context.createOscillator(),gain=context.createGain(),t=start+offset;
          oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,t);oscillator.frequency.exponentialRampToValueAtTime(endFrequency,t+duration);
          gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.005);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
          oscillator.connect(gain);gain.connect(audioBus);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start(t);oscillator.stop(t+duration+.015);
        };
        // Original, warm pixel-game feedback; no extracted game recordings.
        if(kind==='knock')tone('triangle',155,68,.09,0,.15);
        else if(kind==='back') {tone('triangle',620,380,.045,0,.095);tone('square',310,190,.009,0,.055);}
        else {tone('triangle',740,880,.045,0,.075);tone('square',1120,980,.011,.018,.065);}
      };
      if(context.state==='suspended')context.resume().then(play).catch(()=>{});else play();
    }catch(_){}
  }
  function bindInteractionSounds(doc) {
    const unlock=event=>{if(event.type!=='keydown'||['Enter',' ','Escape'].includes(event.key))unlockAudio();};
    const click=event=>{
      if(event.button!==0)return;
      const control=event.target?.closest?.('button,a[href],[role="button"],summary,input');
      if(!control||control.disabled||control.getAttribute('aria-disabled')==='true'||control.closest('.music-effects'))return;
      if(busy&&(control.matches('.hotspot')||doc!==document))return;
      sound(control.matches('#back-button,#cancel-transition,#directory-close,.identity,.music-close,.music-stop,[data-close],.viewer-close,.lightbox-close,.return')?'back':'select');
    };
    doc.addEventListener('pointerdown',unlock,{capture:true,passive:true});
    doc.addEventListener('keydown',unlock,true);
    doc.addEventListener('click',click,true);
    return ()=>{doc.removeEventListener('pointerdown',unlock,true);doc.removeEventListener('keydown',unlock,true);doc.removeEventListener('click',click,true);};
  }
  bindInteractionSounds(document);
  async function enterHouse(token) {
    intro=true;status('沿着小径，走近小屋',true);
    setPreparing(false,token);
    await sceneTo('doorway',token,{focus:[50,54],scale:2.8,duration:840});if(token!==run)return;
    status('叩、叩。有人在吗？',true);await sleep(80);if(token!==run)return;
    $('#knock').classList.add('active');sound('knock');sound('knock',.22);
    await animate(activeLayer,[{transform:'scale(1)'},{transform:'scale(1.025)'}],{duration:motion.matches?0:520,easing:'linear'});
    if(token!==run)return;$('#knock').classList.remove('active');status('门开了，进来坐坐',true);
    await sceneTo('open',token,{focus:[50,43],scale:1.025,duration:300,shift:0});if(token!==run)return;
    await sleep(100);if(token!==run)return;
    await sceneTo('room',token,{focus:[50,43],scale:3.05,duration:710,shift:0});
  }
  const bridge=PortfolioWorldBridge.create({iframe,onDocument:doc=>{
    doc.documentElement.setAttribute('data-cottage-reduced-motion',String(reducedMotion()));
    const clearEffects=bindInteractionSounds(doc),clearMusic=music.bindDocument(doc);
    return ()=>{clearEffects();clearMusic();};
  },onExit:({project})=>navigate({type:'scene',scene:projects[project].returnScene},{focusAction:project}),onNavigate:target=>navigate({type:'world',...target}),onDialogChange:({open})=>{app.dataset.worldDialogOpen=String(open);},onReady:()=>{}});
  function renderWorldUI(target) {
    app.dataset.mode='world';app.dataset.project=target.project;
    app.dataset.surface=target.project==='panda'?'art':'paper';
    $('#back-button').hidden=false;
    $('#back-button').setAttribute('aria-label',target.page==='detail'?'返回作品':target.project==='panda'?'返回画前':'回到书桌前');
    $('#replay-button').hidden=busy||target.page!=='world'||reducedMotion();
    worldView.hidden=false;worldView.style.visibility='visible';worldView.style.opacity='1';
  }
  async function enterWorld(target, token, previous, instant, options={}) {
    const p=projects[target.project], fromWorld=previous?.type==='world';
    // From the cottage, prepare the live page while the source image remains
    // visible. From an existing world, wait for textured coverage before reusing
    // the iframe, including its preserved scroll position.
    let loading;
    if(!fromWorld) {
      worldView.hidden=false;worldView.style.visibility='hidden';
      loading=bridge.show(target.project,target.page,target.anchor);
    }
    const prepare=async()=>{
      if(token!==run)return;
      loading ||= bridge.show(target.project,target.page,target.anchor);
      const result=await loading;
      if(token!==run||result.cancelled)return;
      if(result.error)throw new Error('world unavailable');
    };
    const reveal=async()=>{
      await prepare();if(token!==run)return;
      if(target.project==='panda'&&target.page==='world')await panda.attachWorld({scrollTop:bridge.getScrollState().panda.world});
      if(token!==run)return;
      renderWorldUI(target);
    };
    if(instant) {await reveal();setPreparing(false,token);}
    else {
      if(fromWorld)await story.swapWorld({onCovered:reveal,isCurrent:()=>token===run});
      else {
        const entryScene=target.project==='panda'?'painting':'desk';
        if(currentScene!==entryScene)await sceneTo(entryScene,token,{duration:450,focus:target.project==='panda'?[23.8,13.7]:[65,52],scale:1.55});
        if(token!==run)return;
        const source=await loadImage(currentScene);if(token!==run)return;
        const sourceRect=$('#stage').getBoundingClientRect();
        const narrative={source,sourceRect,onPrepare:prepare,onReady:reveal,onCovered:reveal,isCurrent:()=>token===run,onStart:()=>setPreparing(false,token)};
        if(target.project==='bitter')await book.enter(narrative);
        else if(target.project==='tangui')await story.incense(narrative);
        else {setPreparing(false,token);await panda.enter(narrative);}
      }
    }
    if(token!==run)return;
    visitedProjects.add(target.project);try{storage?.setItem('cottage-visited-projects',JSON.stringify([...visitedProjects]));}catch(_){}
    announce(p.name+(target.page==='detail'?'，作品细节':'，作品世界'));iframe.focus({preventScroll:true});
  }
  async function leaveWorld(target,token,instant,previous) {
    bridge.suspend();
    const reset=async()=>{
      await sceneTo(target.scene,token,{instant:true});if(token!==run)return;
      worldView.hidden=true;app.dataset.mode='scene';delete app.dataset.project;
      renderSceneUI(target.scene);
    };
    if(!instant&&['tangui','bitter'].includes(previous.project)&&target.scene==='approach') {
      await story.blackout({onCovered:reset,isCurrent:()=>token===run});return;
    }
    await sceneTo(target.scene,token,{instant:true});if(token!==run)return;
    // Keep the world opaque while the cottage image is decoded and ready below
    // it. A single-layer dissolve then returns without a blank intermediate frame.
    if(!instant)await animate(worldView,[{opacity:1},{opacity:0}],{duration:430,easing:'linear'});
    if(token!==run)return;
    worldView.hidden=true;app.dataset.mode='scene';worldView.getAnimations().forEach(a=>a.cancel());worldView.style.opacity='1';
    activeLayer.getAnimations().forEach(a=>a.cancel());activeLayer.style.transform='';
    delete app.dataset.project;
  }
  async function navigate(target, options={}) {
    const intent=++navigationIntent, interrupted=busy;
    const source=interrupted?(transitionContext?.source||settledRoute):settledRoute;
    let previous=settledRoute||route;
    const covered=interrupted||options.quick||options.replay||(reducedMotion()&&Boolean(settledRoute));
    // Keep the current presentation alive until it is covered. Resetting or
    // cancelling its transforms before this fade would expose the scene below.
    if(covered){await fadeCurtain(1);if(intent!==navigationIntent)return;}
    const token=++run;
    if(route?.type==='world'||previous?.type==='world')bridge.suspend();
    panda.detachWorld();clearAnimations();
    transitionContext={source:source?{...source}:null,target:{...target},action:options.action||(target.type==='world'?target.project:target.scene),canSkip:false};
    setBusy(true);intro=false;$('#error-notice').hidden=true;lastFailure=null;
    if(!options.fromHistory)updateHistory(target,!!options.replace);
    route=target;
    const instant=!!options.instant||!!options.quick||reducedMotion()||(interrupted&&!options.replay);
    transitionContext.canSkip=!instant&&(target.type==='world'||options.entrance);
    status(target.type==='world'?'正在准备'+projects[target.project].name:'正在准备场景');
    setPreparing(true,token);
    let completed=false;
    try {
      if(options.replay&&target.type==='world'&&!instant){
        const entryScene=target.project==='panda'?'painting':'desk';
        await sceneTo(entryScene,token,{instant:true});if(token!==run||intent!==navigationIntent)return;
        worldView.hidden=true;app.dataset.mode='scene';delete app.dataset.project;
        renderSceneUI(entryScene);previous={type:'scene',scene:entryScene};
        await fadeCurtain(0);if(token!==run||intent!==navigationIntent)return;
      }
      if(target.type==='world') {
        if(!activeLayer)await sceneTo(projects[target.project].returnScene,token,{instant:true});
        await enterWorld(target,token,previous,instant,options);
      } else {
        if(previous?.type==='world')await leaveWorld(target,token,instant,previous);
        else {
          worldView.hidden=true;app.dataset.mode='scene';
          if(!instant&&options.entrance)await enterHouse(token);
          else if(!instant&&target.scene==='desk'&&previous?.scene==='room') {
            status('走近书桌，看看桌上的作品');setPreparing(false,token);
            await sceneTo('desk',token,{focus:[68.5,49],scale:2.05,duration:950});
          } else if(!instant&&target.scene==='painting'&&previous?.scene==='room') {
            status('走近床头的画');setPreparing(false,token);
            await sceneTo('painting',token,{focus:[23.8,13.7],scale:2,duration:840,shift:.6});
          } else await sceneTo(target.scene,token,{instant,duration:550,scale:target.scene==='room'?.92:1.25,reverse:target.scene==='room'});
        }
        if(token!==run||intent!==navigationIntent)return;renderSceneUI(target.scene,options.focusAction);
      }
      if(token!==run||intent!==navigationIntent)return;
      completed=true;settledRoute={...target};
    } catch(error) {
      if(token!==run||intent!==navigationIntent)return;
      lastFailure=target;$('#error-notice').hidden=false;announce('画面加载失败，可以重新载入或回到小屋。');
    } finally {
      if(token===run&&intent===navigationIntent) {
        setPreparing(false,token);
        if(covered)await fadeCurtain(0);
        if(token===run&&intent===navigationIntent){
          intro=false;transitionContext=null;status('');setBusy(false);$('#loading').hidden=true;
          if(completed){if(target.type==='world')renderWorldUI(target);else renderSceneUI(target.scene,options.focusAction);}
        }
      }
    }
  }
  function action(id) {
    if(busy)return;
    if(id==='enter')navigate({type:'scene',scene:'room'},{entrance:true,action:id});
    else if(id==='desk'||id==='painting')navigate({type:'scene',scene:id},{action:id});
    // Picking up the book is an explicit request for its physical entry,
    // including after returning to the desk. The directory remains the shortcut.
    else if(projects[id])navigate({type:'world',project:id,page:'world'},{quick:id!=='bitter'&&visitedProjects.has(id),action:id});
  }
  function back() {
    if(busy){cancelTransition();return;}
    if(route.type==='world'&&route.page==='detail')navigate({type:'world',project:route.project,page:'world'});
    else if(route.type==='world')navigate({type:'scene',scene:projects[route.project].returnScene},{focusAction:route.project});
    else if(route.scene==='room')navigate({type:'scene',scene:'exterior'},{focusAction:'enter'});
    else if(route.scene!=='exterior')navigate({type:'scene',scene:'room'},{focusAction:['desk','approach'].includes(route.scene)?'desk':'painting'});
  }
  function closeDirectory() {$('#directory').close();directoryOpener?.focus({preventScroll:true});}
  $('#directory-toggle').addEventListener('click',()=>{directoryOpener=document.activeElement;$('#directory').showModal();$('#directory-close').focus();});
  $('#directory-close').addEventListener('click',closeDirectory);
  $('#directory').addEventListener('click',e=>{if(e.target===$('#directory')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDirectory();}});
  $('#directory').addEventListener('cancel',()=>{requestAnimationFrame(()=>directoryOpener?.focus({preventScroll:true}));});
  $('#directory').addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;
    const buttons=[...$('#directory').querySelectorAll('button:not(:disabled)')];
    const first=buttons[0],last=buttons[buttons.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  document.querySelectorAll('[data-project]').forEach(b=>b.addEventListener('click',()=>{closeDirectory();navigate({type:'world',project:b.dataset.project,page:'world'},{quick:true});}));
  $('#directory-room').addEventListener('click',()=>{closeDirectory();navigate({type:'scene',scene:'room'});});
  $('#back-button').addEventListener('click',back);
  $('#skip-button').addEventListener('click',skipTransition);
  $('#cancel-transition').addEventListener('click',cancelTransition);
  $('#replay-button').addEventListener('click',()=>{if(!busy&&route?.type==='world')navigate({type:'world',project:route.project,page:'world'},{replay:true,replace:true});});
  $('.identity').addEventListener('click',e=>{e.preventDefault();navigate({type:'scene',scene:'exterior'});});
  $('#retry-button').addEventListener('click',()=>navigate(lastFailure||route,{replace:true,instant:true}));
  $('#error-back').addEventListener('click',()=>navigate({type:'scene',scene:'exterior'},{replace:true,instant:true}));
  const music=CottageMusic.create({button:$('#sound-toggle'),effectsEnabled:soundEnabled,onEffectsChange:enabled=>{
    soundEnabled=enabled;try{storage?.setItem('cottage-sound',enabled?'on':'off');}catch(_){}
    if(audioBus)audioBus.gain.setValueAtTime(enabled?1:0,audio.currentTime);
    if(enabled)sound('select');
  }});
  window.addEventListener('popstate',()=>navigate(parseRoute(),{fromHistory:true}));
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&!$('#directory').open){e.preventDefault();back();}});
  motion.addEventListener('change',()=>{updateMotionPreference();if(reducedMotion()&&busy)skipTransition();});
  $('#motion-toggle').addEventListener('change',event=>{simplifiedMotion=event.target.checked;try{storage?.setItem('cottage-simplified-motion',simplifiedMotion?'on':'off');}catch(_){}updateMotionPreference();if(reducedMotion()&&busy)skipTransition();});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(busy&&transitionContext?.canSkip)skipTransition();},160);});
  updateMotionPreference();
  navigate(parseRoute(),{replace:true,instant:true}).then(()=>{
    const prefetch=()=>{Object.keys(images).forEach(name=>loadImage(name).catch(()=>{}));book.preload().catch(()=>{});story.preload().catch(()=>{});};
    if('requestIdleCallback'in window)requestIdleCallback(prefetch,{timeout:1200});else setTimeout(prefetch,500);
  });
  // An intentionally small read-only snapshot makes route/transition checks reliable.
  window.CottageExperience={getState:()=>({route:{...route},scene:currentScene,busy,reducedMotion:reducedMotion(),transition:transitionContext?{source:transitionContext.source,target:transitionContext.target,canSkip:transitionContext.canSkip}:null,visited:[...visitedProjects],scroll:bridge.getScrollState()})};
})();
