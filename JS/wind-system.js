/* Cosmic Fishing Wind Gust System v9.8.1
   - 31F wind + 19F strong_wind packed into two atlases
   - one InstancedMesh draw call per wind class
   - one-shot animation pool; no per-gust Texture/Material allocations
   - world-space water-plane placement in an isolated layer ABOVE Boat/Ship-FX and BELOW final Clouds
   - sprite animation carries most apparent motion; world drift is deliberately subtle */
(function(global){
  'use strict';

  const PROFILES={
    desktop:{normalMax:12,strongMax:2,normalInterval:[.16,.28],strongInterval:[3.8,6.8],updateHz:60},
    'mobile-high':{normalMax:8,strongMax:1,normalInterval:[.24,.38],strongInterval:[5.0,8.5],updateHz:45},
    'mobile-balanced':{normalMax:6,strongMax:1,normalInterval:[.34,.52],strongInterval:[6.5,10.5],updateHz:30},
    'mobile-low':{normalMax:4,strongMax:1,normalInterval:[.48,.72],strongInterval:[9.0,14.0],updateHz:24}
  };
  function clamp01(v){return v<0?0:v>1?1:v;}
  function smooth01(v){v=clamp01(v);return v*v*(3-2*v);}
  function rand(a,b){return a+Math.random()*(b-a);}

  class CosmicWindSystem{
    constructor(THREE,options){
      this.THREE=THREE;this.scene=options.scene;this.camera=options.camera;
      this.getBoatPosition=options.getBoatPosition;this.getOceanHeight=options.getOceanHeight;
      this.windState=options.windState;this.enabled=options.enabled!==false;
      this.profile=Object.assign({},PROFILES[options.PERF?.tier]||PROFILES.desktop,options.profile||{});
      this.strength=clamp01(Number(this.windState?.strength??.55));
      this.root=new THREE.Group();this.root.name='CosmicWorldWindGustRoot';this.root.renderOrder=3;this.scene.add(this.root);
      this.dummy=new THREE.Object3D();this.tmpBoat=new THREE.Vector3();this.updateCarry=0;
      this.normalTimer=rand(.03,.20);this.strongTimer=rand(1.8,4.8);
      this.normal=this._makeLayer('wind',options.normalTexture,31,8,4,this.profile.normalMax,{fps:[19,22],scale:[1.45,2.35],opacity:[.16,.29],drift:[.07,.17],height:[.055,.080]});
      this.strong=this._makeLayer('strong_wind',options.strongTexture,19,5,4,this.profile.strongMax,{fps:[17,19.5],scale:[2.45,3.85],opacity:[.28,.43],drift:[.11,.24],height:[.065,.090]});
      this.stats={normal:0,strong:0,drawCalls:0,strength:this.strength,direction:'0,0'};
      if(!this.enabled)this.root.visible=false;
      else this._seedInitial();
    }

    _makeLayer(name,texture,frameCount,cols,rows,capacity,cfg){
      const THREE=this.THREE;
      const geo=new THREE.PlaneGeometry(1,1);
      const frameAttr=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);frameAttr.setUsage(THREE.DynamicDrawUsage);
      const opacityAttr=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);opacityAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFrame',frameAttr);geo.setAttribute('aOpacity',opacityAttr);
      const material=new THREE.ShaderMaterial({
        uniforms:{uAtlas:{value:texture},uGrid:{value:new THREE.Vector2(cols,rows)},uCameraPos:{value:new THREE.Vector3()}},
        vertexShader:`
          attribute float aFrame;
          attribute float aOpacity;
          varying vec2 vUvLocal;
          varying float vFrameLocal;
          varying float vOpacityLocal;
          varying vec3 vWorldPosLocal;
          void main(){
            vUvLocal=uv;vFrameLocal=aFrame;vOpacityLocal=aOpacity;
            vec4 world=modelMatrix*instanceMatrix*vec4(position,1.0);
            vWorldPosLocal=world.xyz;
            gl_Position=projectionMatrix*viewMatrix*world;
          }
        `,
        fragmentShader:`
          uniform sampler2D uAtlas;
          uniform vec2 uGrid;
          uniform vec3 uCameraPos;
          varying vec2 vUvLocal;
          varying float vFrameLocal;
          varying float vOpacityLocal;
          varying vec3 vWorldPosLocal;
          void main(){
            float f=floor(vFrameLocal+.5);
            float col=mod(f,uGrid.x);
            float row=floor(f/uGrid.x);
            vec2 atlasUv;
            atlasUv.x=(col+vUvLocal.x)/uGrid.x;
            atlasUv.y=((uGrid.y-1.0-row)+vUvLocal.y)/uGrid.y;
            vec4 texel=texture2D(uAtlas,atlasUv);
            if(texel.a<.02)discard;
            float d=distance(vWorldPosLocal,uCameraPos);
            float distFade=1.0-smoothstep(15.0,23.0,d);
            float a=texel.a*vOpacityLocal*distFade;
            if(a<.008)discard;
            gl_FragColor=vec4(texel.rgb,a);
          }
        `,
        transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:true,
        blending:THREE.NormalBlending
      });
      const mesh=new THREE.InstancedMesh(geo,material,capacity);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=3;mesh.name='WindGust_'+name;this.root.add(mesh);
      const events=[];for(let i=0;i<capacity;i++)events.push({active:false,position:new THREE.Vector3(),age:0,life:1,fps:20,scale:1,opacity:.2,drift:.1,rotJitter:0,height:.07});
      return {name,texture,frameCount,cols,rows,capacity,cfg,geo,material,mesh,frameAttr,opacityAttr,events,count:0};
    }

    _windDir(){
      const d=this.windState?.direction;
      let x=Number(d?.x??.92),z=Number(d?.y??.38),len=Math.hypot(x,z);
      if(len<1e-5){x=.92;z=.38;len=Math.hypot(x,z);}return {x:x/len,z:z/len};
    }

    _spawnPosition(out){
      const boat=this.getBoatPosition();
      const r=rand(3.0,15.0),angle=Math.random()*Math.PI*2;
      out.set(boat.x+Math.cos(angle)*r,0,boat.z+Math.sin(angle)*r);
    }

    _spawn(layer,seedAge=0){
      let e=layer.events.find(q=>!q.active);
      if(!e){
        let oldest=layer.events[0];for(const q of layer.events)if(q.age/q.life>oldest.age/oldest.life)oldest=q;e=oldest;
      }
      const c=layer.cfg;e.active=true;this._spawnPosition(e.position);
      e.fps=rand(c.fps[0],c.fps[1]);e.life=layer.frameCount/e.fps;e.age=Math.min(e.life*.92,Math.max(0,seedAge));
      e.scale=rand(c.scale[0],c.scale[1]);e.opacity=rand(c.opacity[0],c.opacity[1])*(.70+this.strength*.55);
      e.drift=rand(c.drift[0],c.drift[1])*(.72+this.strength*.48);e.rotJitter=rand(-.065,.065);e.height=rand(c.height[0],c.height[1]);
      return e;
    }

    _seedInitial(){
      const count=Math.min(this.normal.capacity,Math.max(2,Math.round(this.normal.capacity*.45)));
      for(let i=0;i<count;i++){const e=this._spawn(this.normal);e.age=rand(0,e.life*.88);}
      if(this.strong.capacity&&this.strength>.62&&Math.random()<.45){const e=this._spawn(this.strong);e.age=rand(0,e.life*.7);}
    }

    _nextNormalInterval(){const a=this.profile.normalInterval;return rand(a[0],a[1])/(.72+this.strength*.62);}
    _nextStrongInterval(){const a=this.profile.strongInterval;return rand(a[0],a[1])/(.82+this.strength*.42);}

    _updateLayer(layer,t,dt){
      const THREE=this.THREE,dir=this._windDir(),boat=this.getBoatPosition();let count=0;
      const angle=Math.atan2(dir.z,dir.x);
      layer.material.uniforms.uCameraPos.value.copy(this.camera.position);
      for(const e of layer.events){
        if(!e.active)continue;e.age+=dt;if(e.age>=e.life){e.active=false;continue;}
        e.position.x+=dir.x*e.drift*dt;e.position.z+=dir.z*e.drift*dt;
        if(Math.hypot(e.position.x-boat.x,e.position.z-boat.z)>19){e.active=false;continue;}
        e.position.y=this.getOceanHeight(e.position.x,e.position.z,t)+e.height;
        const frame=Math.min(layer.frameCount-1,Math.floor(e.age*e.fps));
        const inFade=smooth01(e.age/Math.min(.10,e.life*.16));
        const outFade=smooth01((e.life-e.age)/Math.min(.14,e.life*.18));
        const opacity=e.opacity*Math.min(inFade,outFade);
        this.dummy.position.copy(e.position);this.dummy.rotation.set(-Math.PI/2,0,angle+e.rotJitter);this.dummy.scale.setScalar(e.scale);this.dummy.updateMatrix();
        layer.mesh.setMatrixAt(count,this.dummy.matrix);layer.frameAttr.setX(count,frame);layer.opacityAttr.setX(count,opacity);count++;
        if(count>=layer.capacity)break;
      }
      layer.mesh.count=count;layer.count=count;
      if(count){layer.mesh.instanceMatrix.needsUpdate=true;layer.frameAttr.needsUpdate=true;layer.opacityAttr.needsUpdate=true;}
      return count;
    }

    update(t,dt){
      if(!this.enabled)return;
      this.updateCarry+=dt;const step=1/this.profile.updateHz;if(this.updateCarry<step)return;const simDt=Math.min(.06,this.updateCarry);this.updateCarry=0;
      this.normalTimer-=simDt;if(this.normalTimer<=0){this._spawn(this.normal);this.normalTimer=this._nextNormalInterval();}
      this.strongTimer-=simDt;if(this.strongTimer<=0){
        if(this.strength>.32)this._spawn(this.strong);
        this.strongTimer=this._nextStrongInterval();
      }
      const n=this._updateLayer(this.normal,t,simDt),s=this._updateLayer(this.strong,t,simDt),d=this._windDir();
      this.stats.normal=n;this.stats.strong=s;this.stats.drawCalls=(n?1:0)+(s?1:0);this.stats.strength=this.strength;this.stats.direction=`${d.x.toFixed(2)},${d.z.toFixed(2)}`;
    }

    setStrength(v){this.strength=clamp01(Number(v)||0);if(this.windState)this.windState.strength=this.strength;}
    onRebase(dx,dz){for(const layer of [this.normal,this.strong])for(const e of layer.events)if(e.active){e.position.x-=dx;e.position.z-=dz;}}
    dispose(){for(const layer of [this.normal,this.strong]){this.root.remove(layer.mesh);layer.geo.dispose();layer.material.dispose();}this.scene.remove(this.root);}
  }
  global.CosmicWindSystem=CosmicWindSystem;
})(window);
