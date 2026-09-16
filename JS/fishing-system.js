(function(){
  'use strict';

  const ASSET_ROOT='./IMG/fishing/';
  const ASSET_FILES={
    alert:'exclamation_mark_icon.png',
    bar:'minigame_bar.png',
    complete:'minigame_complete.png',
    fish:'minigame_fish.png',
    miss:'minigame_miss.png',
    progress:'minigame_progress.png',
    hold:Array.from({length:8},(_,i)=>`minigame_hold_${i+1}.png`),
    hook:Array.from({length:3},(_,i)=>`minigame_hook_${i+1}.png`),
    release:Array.from({length:2},(_,i)=>`minigame_release_${i+1}.png`)
  };

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function rand(a,b){return a+Math.random()*(b-a);}

  class CosmicFishingSystem{
    constructor(THREE,opts={}){
      this.THREE=THREE;
      this.opts=opts;
      this.state='IDLE';
      this.stateTime=0;
      this.ready=false;
      this.initError='';
      this.assets={};
      this.inputHeld=false;
      this.physicsAccumulator=0;
      this.fixedDt=1/60;
      this.fishPos=.56;
      this.fishVel=.12;
      this.fishDesiredVel=.12;
      this.pattern='drift';
      this.patternTime=0;
      this.patternDuration=.8;
      this.patternPhase=0;
      this.barPos=.36;
      this.barVel=0;
      // Stardew-like elastic edge response. Left is the gravity/release side (strong bounce),
      // right is the held/raise side (soft rebound). Impact is also used for a 1px pixel squash.
      this.barImpact=0;
      this.barImpactSide=0; // -1 left, +1 right
      this.progress=.28;
      this.zeroFailTime=0;
      this.catchGrace=0;
      this.fishInside=false;
      this.resultKind='';
      this.resultTime=0;
      this.castTimeDefault=1.20;
      this.castTime=this.castTimeDefault;
      this.biteWait=0;
      this.alertTime=0;
      this.alertLayerVisible=false;
      this.animState='release';
      this.animStateTime=0;
      this.lastAnimState='release';
      this.uiCanvas=document.createElement('canvas');
      this.uiCanvas.id='fishingMiniGame';
      this.uiCanvas.width=234;
      this.uiCanvas.height=55;
      this.uiCanvas.setAttribute('aria-hidden','true');
      this.uiCanvas.style.display='none';
      this.uiCanvas.style.pointerEvents='none';
      document.body.appendChild(this.uiCanvas);
      this.ctx=this.uiCanvas.getContext('2d',{alpha:true});
      this.ctx.imageSmoothingEnabled=false;

      this.alertSprite=null;
      this.alertTexture=null;
      this._tmpWorld=THREE?new THREE.Vector3():null;
      this._lastUiScale=-1;
      this._visibilityCached=false;
    }

    _resolve(path){
      const raw=String(path||'');
      const key=raw.replace(/^\.\//,'');
      if(location.protocol==='file:'){
        return window.COSMIC_FISHING_EMBEDDED_ASSETS?.[key] || raw;
      }
      if((location.hostname==='localhost'||location.hostname==='127.0.0.1') && !raw.startsWith('data:')){
        const j=raw.includes('?')?'&':'?';
        return `${raw}${j}dev=${Date.now().toString(36)}`;
      }
      return raw;
    }

    _loadImage(path){
      return new Promise((resolve,reject)=>{
        const img=new Image();
        img.decoding='async';
        img.onload=()=>resolve(img);
        img.onerror=()=>reject(new Error('Fishing PNG decode failed: '+path));
        img.src=this._resolve(path);
      });
    }

    async init(){
      try{
        const one=async(name)=>this._loadImage(ASSET_ROOT+ASSET_FILES[name]);
        const many=async(name)=>Promise.all(ASSET_FILES[name].map(f=>this._loadImage(ASSET_ROOT+f)));
        const [alert,bar,complete,fish,miss,progress,hold,hook,release]=await Promise.all([
          one('alert'),one('bar'),one('complete'),one('fish'),one('miss'),one('progress'),
          many('hold'),many('hook'),many('release')
        ]);
        this.assets={alert,bar,complete,fish,miss,progress,hold,hook,release};
        if(this.opts.alertRenderMode!=='character-layer')this._createAlertSprite();
        this.ready=true;
        this.initError='';
        this._resizeUi();
        console.info('[CosmicFishing] Fishing minigame ready.');
        return true;
      }catch(err){
        this.ready=false;
        this.initError=String(err?.message||err);
        console.error('[CosmicFishing] Fishing minigame initialization failed:',err);
        return false;
      }
    }

    _createAlertSprite(){
      if(!this.THREE||!this.assets.alert||!this.opts.boatScene)return;
      const T=this.THREE;
      const tex=new T.Texture(this.assets.alert);
      tex.needsUpdate=true;
      tex.minFilter=T.NearestFilter;
      tex.magFilter=T.NearestFilter;
      tex.generateMipmaps=false;
      tex.colorSpace=T.SRGBColorSpace;
      this.alertTexture=tex;
      const mat=new T.SpriteMaterial({map:tex,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
      const sprite=new T.Sprite(mat);
      sprite.visible=false;
      sprite.renderOrder=103;
      sprite.frustumCulled=false;
      this.opts.boatScene.add(sprite);
      this.alertSprite=sprite;
    }

    get isActive(){return this.state!=='IDLE';}
    get isMinigame(){return this.state==='MINIGAME'||this.state==='RESULT';}
    locksBoatMovement(){return this.state!=='IDLE';}

    setHeld(v){
      this.inputHeld=!!v;
    }

    beginFishing(){
      if(!this.ready||this.state!=='IDLE')return false;
      if(this.opts.isBoatStationary && !this.opts.isBoatStationary())return false;
      this.opts.stopBoat?.();
      // CAST is completed explicitly by the visual cast controller. Keeping the logical
      // state open until completeCast() prevents animation/state clocks from desynchronizing.
      this.state='CAST';
      this.stateTime=0;
      this.inputHeld=false;
      this._hideUi();
      this._setAlertVisible(false);
      this.opts.onStateChange?.(this.state);
      return true;
    }

    confirmBite(){
      if(!this.ready||this.state!=='BITE_ALERT')return false;
      this._startMinigame();
      return true;
    }

    completeCast(){
      if(!this.ready||this.state!=='CAST')return false;
      // Authoritative flow:
      // IDLE -> CAST -> WAIT_BITE -> BITE_ALERT -> MINIGAME.
      // The bite alert is produced only by the bite timer, never directly by CAST completion.
      this._enterWait();
      return true;
    }

    cancel(){
      this.state='IDLE';
      this.stateTime=0;
      this.inputHeld=false;
      this._hideUi();
      this._setAlertVisible(false);
      this.opts.onStateChange?.(this.state);
    }

    cancelBeforeBite(){
      if(!this.ready || (this.state!=='CAST' && this.state!=='WAIT_BITE'))return false;
      const from=this.state;
      this.state='IDLE';
      this.stateTime=0;
      this.biteWait=0;
      this.inputHeld=false;
      this._hideUi();
      this._setAlertVisible(false);
      this.opts.onStateChange?.(this.state,{reason:'manual-cancel',from});
      return true;
    }

    _enterWait(){
      this.state='WAIT_BITE';
      this.stateTime=0;
      this._setAlertVisible(false);
      // Triangular timing: random enough to feel like a bite, but long extremes are uncommon.
      const a=rand(1.8,5.0),b=rand(1.8,5.0);
      this.biteWait=(a+b)*.5;
      this.opts.onStateChange?.(this.state,{biteWait:this.biteWait});
    }

    _enterAlert(){
      this.state='BITE_ALERT';
      this.stateTime=0;
      this._setAlertVisible(true);
      this.opts.onStateChange?.(this.state,{biteWait:this.biteWait});
    }

    _startMinigame(){
      this.state='MINIGAME';
      this.stateTime=0;
      this.inputHeld=!!this.opts.isPointerHeld?.();
      this.physicsAccumulator=0;
      this.fishPos=rand(.36,.68);
      this.fishVel=rand(-.09,.09);
      this.fishDesiredVel=this.fishVel;
      this.barPos=.34;
      this.barVel=0;
      this.barImpact=0;
      this.barImpactSide=0;
      this.progress=.28;
      this.zeroFailTime=0;
      this.catchGrace=0;
      this.fishInside=false;
      this.patternTime=0;
      this.patternDuration=.25;
      this.patternPhase=0;
      this._chooseFishPattern();
      this.animState='release';
      this.animStateTime=0;
      this.lastAnimState='release';
      this._setAlertVisible(false);
      this._showUi();
      this.opts.onStateChange?.(this.state);
    }

    _finish(kind){
      if(this.state!=='MINIGAME')return;
      this.state='RESULT';
      this.resultKind=kind;
      this.resultTime=0;
      this.inputHeld=false;
      this.opts.onStateChange?.(this.state);
      if(kind==='complete')this.opts.onSuccess?.();
      else this.opts.onMiss?.();
    }

    _endResult(){
      this.state='IDLE';
      this.stateTime=0;
      this.resultKind='';
      this.resultTime=0;
      this.inputHeld=false;
      this._hideUi();
      this._setAlertVisible(false);
      this.opts.onStateChange?.(this.state);
    }

    _chooseFishPattern(){
      const r=Math.random();
      if(r<.36){
        this.pattern='drift';
        this.patternDuration=rand(.65,1.35);
        const dir=Math.random()<.5?-1:1;
        this.fishDesiredVel=dir*rand(.16,.28);
      }else if(r<.58){
        this.pattern='dart';
        this.patternDuration=rand(.22,.42);
        const dir=Math.random()<.5?-1:1;
        this.fishDesiredVel=dir*rand(.42,.62);
      }else if(r<.82){
        this.pattern='zigzag';
        this.patternDuration=rand(.55,1.05);
        this.patternPhase=0;
        const dir=Math.random()<.5?-1:1;
        this.fishDesiredVel=dir*rand(.26,.39);
      }else{
        this.pattern='fake';
        this.patternDuration=rand(.42,.72);
        this.patternPhase=0;
        const dir=Math.random()<.5?-1:1;
        this.fishDesiredVel=dir*rand(.34,.50);
      }
      this.patternTime=0;
    }

    _updatePhysics(dt){
      // Green bar physics: input is acceleration, not direct movement.
      // This deliberately preserves momentum so short rhythmic presses can brake/hover the bar.
      // Our horizontal layout maps Stardew's bottom/gravity side to LEFT:
      //   release -> accelerates left, and a hard left impact gives the pronounced bounce.
      //   hold    -> accelerates right, whose boundary has a softer rebound.
      const barAccel=this.inputHeld?1.72:-1.72;
      const barMaxSpeed=.72;
      this.barVel+=barAccel*dt;
      this.barVel*=Math.exp(-1.78*dt);
      this.barVel=clamp(this.barVel,-barMaxSpeed,barMaxSpeed);
      this.barPos+=this.barVel*dt;

      // Decay the tiny visual impact squash independently from the actual hitbox.
      this.barImpact*=Math.exp(-11.5*dt);
      if(this.barImpact<.015){this.barImpact=0;this.barImpactSide=0;}

      if(this.barPos<=0){
        const impact=Math.max(0,-this.barVel);
        this.barPos=0;
        if(impact>.055){
          // Gravity-side collision: noticeable elastic rebound. If the player starts holding
          // before impact, acceleration has already reduced impact speed, naturally reducing bounce.
          const restitution=.58;
          this.barVel=impact*restitution;
          this.barImpact=clamp(impact/barMaxSpeed,0,1);
          this.barImpactSide=-1;
        }else{
          // Kill tiny residual velocities so the bar does not chatter at the wall.
          this.barVel=0;
        }
      }else if(this.barPos>=1){
        const impact=Math.max(0,this.barVel);
        this.barPos=1;
        if(impact>.065){
          // The pull/top side rebounds too, but much less. Holding the button again quickly
          // presses it back against the edge instead of creating an endless ping-pong.
          const restitution=.30;
          this.barVel=-impact*restitution;
          this.barImpact=clamp(impact/barMaxSpeed,0,1);
          this.barImpactSide=1;
        }else{
          this.barVel=0;
        }
      }

      this.patternTime+=dt;
      if(this.pattern==='zigzag' && this.patternTime>.18*(this.patternPhase+1)){
        this.patternPhase++;
        this.fishDesiredVel*=-1;
      }else if(this.pattern==='fake' && this.patternPhase===0 && this.patternTime>this.patternDuration*.42){
        this.patternPhase=1;
        this.fishDesiredVel*=-1.18;
      }
      if(this.patternTime>=this.patternDuration)this._chooseFishPattern();

      const fishAccel=this.pattern==='dart'?3.0:2.0;
      const delta=this.fishDesiredVel-this.fishVel;
      this.fishVel+=clamp(delta,-fishAccel*dt,fishAccel*dt);
      this.fishVel*=Math.exp(-.18*dt);
      this.fishPos+=this.fishVel*dt;
      if(this.fishPos<.02){this.fishPos=.02;this.fishVel=Math.abs(this.fishVel)*.75;this.fishDesiredVel=Math.abs(this.fishDesiredVel);}
      if(this.fishPos>.98){this.fishPos=.98;this.fishVel=-Math.abs(this.fishVel)*.75;this.fishDesiredVel=-Math.abs(this.fishDesiredVel);}

      const trackW=224,barW=34;
      const barLeft=this.barPos*(trackW-barW);
      const fishCenter=this.fishPos*trackW;
      const directInside=fishCenter>=barLeft+3 && fishCenter<=barLeft+barW-3;
      if(directInside)this.catchGrace=.12;
      else this.catchGrace=Math.max(0,this.catchGrace-dt);
      this.fishInside=directInside||this.catchGrace>0;

      if(this.fishInside){
        this.progress=Math.min(1,this.progress+.235*dt);
        this.zeroFailTime=0;
      }else{
        this.progress=Math.max(0,this.progress-.105*dt);
        if(this.progress<=.0001)this.zeroFailTime+=dt;
        else this.zeroFailTime=0;
      }
      if(this.progress>=.999)this._finish('complete');
      else if(this.zeroFailTime>=1.10)this._finish('miss');
    }

    _selectAnimState(){
      const next=this.fishInside?'hold':(this.inputHeld?'hook':'release');
      if(next!==this.animState){
        // tiny hysteresis prevents rapid boundary chatter from flashing animation groups.
        if(this.animStateTime<.09)return;
        this.lastAnimState=this.animState;
        this.animState=next;
        this.animStateTime=0;
      }
    }

    _animFrame(t){
      const state=this.animState;
      const frames=this.assets[state]||this.assets.release;
      if(!frames?.length)return null;
      const fps=state==='hold'?7:state==='hook'?9:6;
      const raw=Math.floor(t*fps);
      if(frames.length===1)return frames[0];
      const cycle=frames.length*2-2;
      const p=raw%cycle;
      const idx=p<frames.length?p:(cycle-p);
      return frames[idx];
    }

    _drawMinigame(){
      const c=this.ctx;
      c.setTransform(1,0,0,1,0,0);
      c.clearRect(0,0,234,55);
      c.imageSmoothingEnabled=false;
      if(this.state==='RESULT'){
        const img=this.resultKind==='complete'?this.assets.complete:this.assets.miss;
        if(img)c.drawImage(img,0,0,234,55);
        return;
      }
      const base=this._animFrame(this.animStateTime);
      if(base)c.drawImage(base,0,0,234,55);

      // Upper capture bar: the supplied rainbow image is clipped into the authored 224x4 recess.
      const progX=5,progY=39,progW=224,progH=4;
      c.save();
      c.beginPath();
      c.rect(progX,progY,progW*this.progress,progH);
      c.clip();
      // Row 149 is the supplied texture's complete left-to-right rainbow ramp.
      c.drawImage(this.assets.progress,1,149,224,1,progX,progY,progW,progH);
      c.restore();

      // Lower track. The provided green bar stays at its native 34x8 pixel footprint.
      const trackX=5,trackW=224;
      const barX=Math.round(trackX+this.barPos*(trackW-34));
      // 1px-class compression on hard edge impacts gives a readable pixel-art spring response
      // without changing the gameplay hitbox or introducing sub-pixel filtering.
      const squash=(this.barImpact>.16)?Math.min(2,Math.max(1,Math.round(this.barImpact*2))):0;
      if(squash>0 && this.barImpactSide<0){
        c.drawImage(this.assets.bar,barX,44,34-squash,8);
      }else if(squash>0 && this.barImpactSide>0){
        c.drawImage(this.assets.bar,barX+squash,44,34-squash,8);
      }else{
        c.drawImage(this.assets.bar,barX,44,34,8);
      }
      const fishCx=trackX+this.fishPos*trackW;
      c.drawImage(this.assets.fish,Math.round(fishCx-9),42,18,12);
    }

    _resizeUi(){
      const vw=Math.max(1,window.innerWidth),vh=Math.max(1,window.innerHeight);
      let scale=Math.floor(Math.min(vw/(234+24),vh/180));
      scale=clamp(scale,1,3);
      if(vw<620)scale=Math.min(scale,2);
      if(scale===this._lastUiScale)return;
      this._lastUiScale=scale;
      this.uiCanvas.style.width=`${234*scale}px`;
      this.uiCanvas.style.height=`${55*scale}px`;
      this.uiCanvas.style.left='50%';
      this.uiCanvas.style.bottom=`${Math.max(18,Math.round(vh*.075))}px`;
      this.uiCanvas.style.transform='translateX(-50%)';
    }

    onResize(){this._lastUiScale=-1;this._resizeUi();}

    _showUi(){
      this._resizeUi();
      this.uiCanvas.style.display='block';
      this._visibilityCached=true;
    }
    _hideUi(){
      this.uiCanvas.style.display='none';
      this.ctx.clearRect(0,0,234,55);
      this._visibilityCached=false;
    }

    _setAlertVisible(v){
      this.alertLayerVisible=!!v;
      if(this.alertSprite)this.alertSprite.visible=!!v;
    }

    get isBiteAlertVisible(){return this.state==='BITE_ALERT' && this.alertLayerVisible;}
    get alertImage(){return this.assets?.alert||null;}

    _updateAlertWorld(t){
      const sprite=this.alertSprite;
      if(!sprite||!sprite.visible)return;
      const boatMesh=this.opts.boatMesh;
      const meta=this.opts.characterMeta;
      if(!boatMesh||!meta?.shipSockets)return;
      const frame=clamp(this.opts.getFrameIndex?.()??0,0,7)|0;
      const socket=meta.shipSockets[frame]||{x:85,y:105};
      const px=Number.isFinite(socket.x)?socket.x:85;
      // Rough character head anchor: 40px above the foot socket, then a tiny pixel-style bob.
      const py=(Number.isFinite(socket.y)?socket.y:105)-40-(Math.sin(t*10)>.15?2:0);
      const lx=px/170-.5;
      const ly=.5-py/170;
      this._tmpWorld.set(lx,ly,.02);
      boatMesh.updateMatrixWorld(true);
      boatMesh.localToWorld(this._tmpWorld);
      sprite.position.copy(this._tmpWorld);
      const pop=clamp(this.stateTime/.10,0,1);
      const s=.17*(.62+.38*Math.min(1,pop*1.4));
      sprite.scale.set(s,s,1);
      // The bite prompt stays fully visible until the player confirms it.
      sprite.material.opacity=1;
    }

    update(t,dt){
      if(!this.ready)return;
      this.stateTime+=dt;
      if(this.state==='CAST'){
        // The character action controller owns the one-shot cast lifetime and calls completeCast().
        // Never auto-advance here, otherwise a loading/frame-timing mismatch can skip the animation.
        this.opts.stopBoat?.();
      }else if(this.state==='WAIT_BITE'){
        this.opts.stopBoat?.();
        if(this.stateTime>=this.biteWait)this._enterAlert();
      }else if(this.state==='BITE_ALERT'){
        this.opts.stopBoat?.();
        if(this.opts.alertRenderMode!=='character-layer')this._updateAlertWorld(t);
        // Do not auto-start and do not time out. The prompt remains until
        // the player confirms it with the second fishing action (right-click on mouse).
      }else if(this.state==='MINIGAME'){
        this.opts.stopBoat?.();
        this.animStateTime+=dt;
        this.physicsAccumulator=Math.min(.10,this.physicsAccumulator+dt);
        let guard=0;
        while(this.physicsAccumulator>=this.fixedDt && guard++<8){
          this._updatePhysics(this.fixedDt);
          this.physicsAccumulator-=this.fixedDt;
          if(this.state!=='MINIGAME')break;
        }
        if(this.state==='MINIGAME'){
          this._selectAnimState();
          this._drawMinigame();
        }
      }else if(this.state==='RESULT'){
        this.opts.stopBoat?.();
        this.resultTime+=dt;
        this._drawMinigame();
        if(this.resultTime>=1.05)this._endResult();
      }else{
        this._setAlertVisible(false);
      }
    }

    getDebugText(){
      if(!this.ready)return `OFF${this.initError?' / '+this.initError:''}`;
      if(this.state==='MINIGAME')return `MINIGAME ${this.animState.toUpperCase()} / ${(this.progress*100).toFixed(0)}%`;
      if(this.state==='WAIT_BITE')return `WAIT_BITE ${(Math.max(0,this.biteWait-this.stateTime)).toFixed(2)}s`;
      if(this.state==='BITE_ALERT')return 'BITE_ALERT / RIGHT CLICK TO HOOK';
      return this.state;
    }
  }

  window.CosmicFishingSystem=CosmicFishingSystem;
})();
