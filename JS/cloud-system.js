/* Cosmic Fishing Paper Cloud System v9.8
   Final render architecture:
   - visible clouds render once to their independent low-resolution Nearest target
   - the final split-pixel shader composites clouds LAST, above world + boat + ship FX
   - cloud shadow is a separate moon-space lighting mask shared by Ocean + Boat Normal lighting
   - no foreground duplicate meshes, boat occlusion texture, screen-overlap decision, or Canvas cloud mask
   - reflection / contact / wake are an off-screen CanvasTexture sampled under the cloud layer
   - no voxel decode / runtime cloud noise / raymarch / alpha-card overdraw */
(function(global){
  'use strict';

  const PROFILES={
    desktop:{
      maxClouds:12,templateIndices:[0,1,2,3,4,5],nearTemplateIndices:[0,1,2,3],midTemplateIndices:[0,1,2,3,4],nearTemplateDistance:13,midTemplateDistance:20,
      cellSize:12.0,density:.30,farStart:28,farEnd:34,shadowSize:128,shadowHz:8,shadowExtent:42,shadowStrength:.19,
      shadowBoatStep:.24,shadowWindStep:.14,shadowParallax:.18
    },
    'mobile-high':{
      maxClouds:9,templateIndices:[0,1,2,3,4],nearTemplateIndices:[0,1,2,3],midTemplateIndices:[0,1,2,3,4],nearTemplateDistance:13,midTemplateDistance:19,
      cellSize:12.5,density:.27,farStart:23,farEnd:28,shadowSize:96,shadowHz:6,shadowExtent:36,shadowStrength:.18,
      shadowBoatStep:.32,shadowWindStep:.19,shadowParallax:.18
    },
    'mobile-balanced':{
      maxClouds:7,templateIndices:[0,1,2,4],nearTemplateIndices:[0,1,2],midTemplateIndices:[0,1,2,4],nearTemplateDistance:12,midTemplateDistance:18,
      cellSize:13.0,density:.24,farStart:19,farEnd:24,shadowSize:64,shadowHz:4,shadowExtent:31,shadowStrength:.17,
      shadowBoatStep:.42,shadowWindStep:.25,shadowParallax:.17
    },
    'mobile-low':{
      maxClouds:5,templateIndices:[0,2,4],nearTemplateIndices:[0,2],midTemplateIndices:[0,2,4],nearTemplateDistance:11,midTemplateDistance:16,
      cellSize:14.0,density:.20,farStart:15,farEnd:19,shadowSize:32,shadowHz:3,shadowExtent:27,shadowStrength:.13,
      shadowBoatStep:.62,shadowWindStep:.38,shadowParallax:.16
    }
  };

  function clamp01(v){return v<0?0:v>1?1:v;}
  function smooth01(v){v=clamp01(v);return v*v*(3-2*v);}
  function hashU32(x,z,salt){
    let h=(Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^Math.imul(salt|0,1274126177))|0;
    h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return h>>>0;
  }
  function hash01(x,z,salt){return hashU32(x,z,salt)/4294967296;}
  function wrapped(v,span){if(!span)return v;const h=span*.5;return ((((v+h)%span)+span)%span)-h;}
  function pointInPolygon(x,z,outline){
    let inside=false;
    for(let i=0,j=outline.length-1;i<outline.length;j=i++){
      const xi=outline[i][0],zi=outline[i][1],xj=outline[j][0],zj=outline[j][1];
      const hit=((zi>z)!==(zj>z))&&(x<(xj-xi)*(z-zi)/((zj-zi)||1e-9)+xi);
      if(hit)inside=!inside;
    }
    return inside;
  }
  function pointSegmentDistance(px,pz,ax,az,bx,bz){
    const abx=bx-ax,abz=bz-az,den=abx*abx+abz*abz;
    const t=den>1e-9?clamp01(((px-ax)*abx+(pz-az)*abz)/den):0;
    const dx=px-(ax+abx*t),dz=pz-(az+abz*t);return Math.hypot(dx,dz);
  }
  function minEdgeDistance(px,pz,outline){
    let d=Infinity;
    for(let i=0,j=outline.length-1;i<outline.length;j=i++)d=Math.min(d,pointSegmentDistance(px,pz,outline[j][0],outline[j][1],outline[i][0],outline[i][1]));
    return d;
  }
  function templateRadius(template){
    let r=0;for(const p of template.outline)r=Math.max(r,Math.hypot(p[0],p[1]));return Math.max(.001,r);
  }
  function buildPaperGeometry(THREE,template,templateIndex){
    const outline=template.outline,n=outline.length,innerScale=template.innerScale||.62,radius=templateRadius(template);
    const positions=[],shade=[],edge=[],local=[],indices=[];
    positions.push(0,0,0);shade.push(1.015);edge.push(0);local.push(0,0);
    for(let i=0;i<n;i++){
      const p=outline[i],jitter=(hash01(templateIndex,i,17)-.5)*.055;
      positions.push(p[0]*innerScale,0,p[1]*innerScale);shade.push(.955+jitter);edge.push(.18);local.push((p[0]*innerScale)/radius,(p[1]*innerScale)/radius);
    }
    for(let i=0;i<n;i++){
      const p=outline[i],jitter=(hash01(templateIndex,i,29)-.5)*.07;
      positions.push(p[0],0,p[1]);shade.push(.815+jitter);edge.push(1);local.push(p[0]/radius,p[1]/radius);
    }
    for(let i=0;i<n;i++){
      const ni=(i+1)%n,ii=1+i,ij=1+ni,oi=1+n+i,oj=1+n+ni;
      indices.push(0,ii,ij, ii,oi,oj, ii,oj,ij);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('aPaperShade',new THREE.Float32BufferAttribute(shade,1));
    geo.setAttribute('aPaperEdge',new THREE.Float32BufferAttribute(edge,1));
    geo.setAttribute('aPaperLocal',new THREE.Float32BufferAttribute(local,2));
    geo.setIndex(indices);geo.computeBoundingSphere();
    geo.userData.cloudTriangles=indices.length/3;geo.userData.radius=radius;
    return geo;
  }

  class CosmicCloudSystem{
    constructor(THREE,options){
      if(!THREE)throw new Error('CosmicCloudSystem requires THREE.');
      const templates=global.COSMIC_CLOUD_TEMPLATES;
      if(!Array.isArray(templates)||!templates.length)throw new Error('COSMIC_CLOUD_TEMPLATES is missing.');

      this.THREE=THREE;
      this.worldScene=options.scene;
      this.cloudScene=options.cloudScene||options.scene;
      this.camera=options.camera;
      this.renderer=options.renderer;
      this.worldState=options.worldState;
      this.getBoatPosition=options.getBoatPosition;
      this.getMoonPosition=options.getMoonPosition;
      this.enabled=options.enabled!==false;
      this.templates=templates;
      this.profile=Object.assign({},PROFILES[options.PERF?.tier]||PROFILES.desktop,options.profile||{});
      this.fog=options.fog||this.worldScene?.fog||null;
      this.testMode=String(options.testMode||'').toLowerCase();

      this.root=new THREE.Group();
      this.root.name='CosmicPaperCloudFinalPassRoot';
      this.cloudScene.add(this.root);

      this.material=this._createMaterial();
      this.meshes=new Array(templates.length).fill(null);
      this.geometries=[];
      this.dummy=new THREE.Object3D();

      this.activeClouds=[];
      this.windX=0;this.windZ=0;this.windAtPackX=0;this.windAtPackZ=0;this.fieldWindX=0;this.fieldWindZ=0;
      const optDir=options.windDirection;const optSpeed=Number(options.windSpeed??.055);
      if(optDir&&Number.isFinite(optDir.x)&&Number.isFinite(optDir.y)){
        const len=Math.hypot(optDir.x,optDir.y)||1;this.windSpeedX=optDir.x/len*optSpeed;this.windSpeedZ=optDir.y/len*optSpeed;
      }else{this.windSpeedX=-.052;this.windSpeedZ=.018;}
      this.lastCellX=Number.NaN;this.lastCellZ=Number.NaN;this.forceField=true;this.forcePack=true;

      this.blackTexture=this._makeBlackTexture();
      this.shadowTexture=null;this.shadowTarget=null;this.shadowCamera=null;this.shadowMaterial=null;
      this.shadowCenter=new THREE.Vector2();this.shadowMatrix=new THREE.Matrix4();this.shadowCarry=999;this.forceShadow=true;
      this.lastShadowBoat=new THREE.Vector2(1e9,1e9);this.lastShadowWind=new THREE.Vector2(1e9,1e9);

      this.tmpBoat=new THREE.Vector3();this.tmpBoatGlobal=new THREE.Vector3();this.tmpMoon=new THREE.Vector3();
      this.tmpMoonDir=new THREE.Vector3(-.35,.52,-.78).normalize();this.tmpShadowDir=new THREE.Vector3(-.08,.99,-.12).normalize();this.tmpProject=new THREE.Vector3();
      this.boatShade=0;this.boatShadeTarget=0;

      this.stats={visible:0,drawCalls:0,triangles:0,shadowHz:this.profile.shadowHz,boatShade:0,shadowMode:'moon-space',renderMode:'split-pixel-cloud-final-over-fx'};

      if(this.enabled){
        this._buildMeshes();this._buildShadow();this._collectField();this._packInstances();
      }else this.root.visible=false;

      console.info('[CosmicFishing Paper Clouds v9.8]',this.enabled?'enabled':'disabled',this.profile,this.stats);
    }

    _makeBlackTexture(){
      const THREE=this.THREE,data=new Uint8Array([0,0,0,255]);
      const tex=new THREE.DataTexture(data,1,1,THREE.RGBAFormat);
      tex.needsUpdate=true;tex.minFilter=THREE.NearestFilter;tex.magFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.colorSpace=THREE.NoColorSpace;
      return tex;
    }

    _createMaterial(){
      const THREE=this.THREE,fog=this.fog;
      return new THREE.ShaderMaterial({
        uniforms:{
          uPaperColor:{value:new THREE.Color(0x617887)},uEdgeColor:{value:new THREE.Color(0x354b59)},uMoonTint:{value:new THREE.Color(0x82a1b2)},
          uMoonDirection:{value:new THREE.Vector3(-.35,.52,-.78).normalize()},uCameraPos:{value:new THREE.Vector3()},uWorldOffset:{value:new THREE.Vector2()},
          uFarStart:{value:this.profile.farStart},uFarEnd:{value:this.profile.farEnd},uFogColor:{value:new THREE.Color(fog?.color||0x03050b)},uFogDensity:{value:Number(fog?.density||.04)}
        },
        vertexShader:`
          attribute float aPaperShade;
          attribute float aPaperEdge;
          attribute vec2 aPaperLocal;
          varying vec3 vWorldPos;
          varying float vShade;
          varying float vEdge;
          varying vec2 vLocal;
          void main(){
            vec4 inst=instanceMatrix*vec4(position,1.0);
            vec4 world=modelMatrix*inst;
            vWorldPos=world.xyz;vShade=aPaperShade;vEdge=aPaperEdge;vLocal=aPaperLocal;
            gl_Position=projectionMatrix*viewMatrix*world;
          }
        `,
        fragmentShader:`
          uniform vec3 uPaperColor;
          uniform vec3 uEdgeColor;
          uniform vec3 uMoonTint;
          uniform vec3 uMoonDirection;
          uniform vec3 uCameraPos;
          uniform vec2 uWorldOffset;
          uniform float uFarStart;
          uniform float uFarEnd;
          uniform vec3 uFogColor;
          uniform float uFogDensity;
          varying vec3 vWorldPos;
          varying float vShade;
          varying float vEdge;
          varying vec2 vLocal;
          float stableHash(vec2 p){vec2 q=floor(p*2.0);return fract(sin(dot(q,vec2(12.9898,78.233)))*43758.5453);}
          void main(){
            float d=length(vWorldPos.xz-uCameraPos.xz);
            float farFade=1.0-smoothstep(uFarStart,uFarEnd,d);
            if(farFade<=0.001)discard;
            if(farFade<0.999&&stableHash(vWorldPos.xz+uWorldOffset)>farFade)discard;
            vec2 moonXZ=normalize(uMoonDirection.xz+vec2(.0001));
            float moonSide=clamp(.5+dot(vLocal,moonXZ)*.26,0.0,1.0);
            float edgeBand=smoothstep(.18,1.0,vEdge);
            float paperStep=floor(clamp(vShade+moonSide*.055,0.0,1.2)*5.0)/5.0;
            vec3 base=mix(uEdgeColor,uPaperColor,1.0-edgeBand*.72);
            vec3 col=base*(.82+paperStep*.18);
            col=mix(col,uMoonTint,.035+moonSide*.055*(1.0-edgeBand*.35));
            float dist3=length(uCameraPos-vWorldPos);
            float fogFactor=1.0-exp(-uFogDensity*uFogDensity*dist3*dist3);
            col=mix(col,uFogColor,clamp(fogFactor,0.0,.76));
            gl_FragColor=vec4(col,1.0);
          }
        `,
        // Visual cloud pixels are opaque inside the paper silhouette. They are rendered into the
        // independent coarse cloud target and sampled LAST by the final split-pixel shader.
        transparent:false,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:true
      });
    }

    _buildMeshes(){
      const THREE=this.THREE,p=this.profile,allowed=new Set(p.templateIndices);let tri=0;
      this.templates.forEach((template,i)=>{
        if(!allowed.has(i))return;
        const geo=buildPaperGeometry(THREE,template,i);this.geometries.push(geo);tri+=geo.userData.cloudTriangles;
        const mesh=new THREE.InstancedMesh(geo,this.material,p.maxClouds);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=10+i;mesh.name='PaperCloudFinal_'+template.id;
        this.root.add(mesh);this.meshes[i]=mesh;
      });
      this.stats.triangles=tri;
    }

    _buildShadow(){
      const THREE=this.THREE,p=this.profile;
      if(!p.shadowSize||!p.shadowHz){this.shadowTexture=this.blackTexture;return;}
      this.shadowTarget=new THREE.WebGLRenderTarget(p.shadowSize,p.shadowSize,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,depthBuffer:false,stencilBuffer:false});
      this.shadowTarget.texture.generateMipmaps=false;this.shadowTarget.texture.colorSpace=THREE.NoColorSpace;this.shadowTexture=this.shadowTarget.texture;
      const half=p.shadowExtent*.5;
      this.shadowCamera=new THREE.OrthographicCamera(-half,half,half,-half,.1,90);this.shadowCamera.up.set(0,1,0);
      this.shadowMaterial=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false,depthTest:false,depthWrite:false});
    }

    _boatGlobal(out){out.copy(this.getBoatPosition());out.x+=this.worldState.originX;out.z+=this.worldState.originZ;return out;}
    _cellForBoat(){const b=this._boatGlobal(this.tmpBoatGlobal),s=this.profile.cellSize;return {x:Math.floor((b.x-this.windX)/s),z:Math.floor((b.z-this.windZ)/s)};}

    _collectField(){
      const p=this.profile,b=this._boatGlobal(this.tmpBoatGlobal),s=p.cellSize,center=this._cellForBoat(),scan=Math.ceil(p.farEnd/s)+1,candidates=[];
      for(let cz=center.z-scan;cz<=center.z+scan;cz++)for(let cx=center.x-scan;cx<=center.x+scan;cx++){
        if(hash01(cx,cz,11)>p.density)continue;
        const ox=(hash01(cx,cz,23)-.5)*s*.70,oz=(hash01(cx,cz,37)-.5)*s*.70;
        const baseX=(cx+.5)*s+ox,baseZ=(cz+.5)*s+oz,wx=baseX+this.windX,wz=baseZ+this.windZ;
        const dist=Math.hypot(wx-b.x,wz-b.z);if(dist>p.farEnd+4)continue;
        const choices=dist<p.nearTemplateDistance?p.nearTemplateIndices:(dist<p.midTemplateDistance?p.midTemplateIndices:p.templateIndices);
        const templateIndex=choices[Math.min(choices.length-1,Math.floor(hash01(cx,cz,53)*choices.length))],template=this.templates[templateIndex];
        const y=4.75+hash01(cx,cz,71)*.95+(template.heightBias||0);
        const scale=template.scaleMin+(template.scaleMax-template.scaleMin)*hash01(cx,cz,89);
        const rotation=hash01(cx,cz,107)*Math.PI*2;
        candidates.push({cx,cz,baseX,baseZ,y,scale,rotation,templateIndex,dist});
      }
      candidates.sort((a,b)=>a.dist-b.dist);
      this.activeClouds=candidates.slice(0,p.maxClouds);
      this.lastCellX=center.x;this.lastCellZ=center.z;this.fieldWindX=this.windX;this.fieldWindZ=this.windZ;
      this.forcePack=true;this.forceShadow=true;
    }

    _applyTestCloud(){
      if(!this.testMode)return false;
      const boatLocal=this.getBoatPosition(),boatGlobal=this._boatGlobal(this.tmpBoatGlobal),y=5.2;
      let xLocal=boatLocal.x,zLocal=boatLocal.z;
      if(this.testMode==='cover'||this.testMode==='1'){
        const cam=this.camera.position,den=boatLocal.y-cam.y;
        const t=Math.abs(den)>.0001?(y-cam.y)/den:.5;
        xLocal=cam.x+(boatLocal.x-cam.x)*t;zLocal=cam.z+(boatLocal.z-cam.z)*t;
      }else if(this.testMode==='shadow'){
        const dir=this.tmpMoonDir;
        if(dir.y>.0001){const t=(y-boatLocal.y)/dir.y;xLocal=boatLocal.x+dir.x*t;zLocal=boatLocal.z+dir.z*t;}
      }
      const c=this.activeClouds[0]||{cx:0,cz:0,baseX:0,baseZ:0,y,scale:2.1,rotation:0,templateIndex:0,dist:0};
      c.baseX=xLocal+this.worldState.originX-this.windX;c.baseZ=zLocal+this.worldState.originZ-this.windZ;c.y=y;c.scale=2.15;c.rotation=0;c.templateIndex=0;c.dist=0;
      this.activeClouds=[c];this.forcePack=true;this.forceShadow=true;return true;
    }

    _packInstances(){
      const p=this.profile,b=this._boatGlobal(this.tmpBoatGlobal),originX=this.worldState.originX,originZ=this.worldState.originZ,counts=new Int32Array(this.meshes.length);
      let visible=0,drawCalls=0;
      for(const mesh of this.meshes)if(mesh)mesh.count=0;
      for(const c of this.activeClouds){
        const wx=c.baseX+this.windX,wz=c.baseZ+this.windZ,d=Math.hypot(wx-b.x,wz-b.z);if(!this.testMode&&d>p.farEnd+2)continue;
        const mesh=this.meshes[c.templateIndex];if(!mesh)continue;
        const idx=counts[c.templateIndex]++;if(idx>=p.maxClouds)continue;
        this.dummy.position.set(wx-originX,c.y,wz-originZ);this.dummy.rotation.set(0,c.rotation,0);this.dummy.scale.setScalar(c.scale);this.dummy.updateMatrix();
        mesh.setMatrixAt(idx,this.dummy.matrix);visible++;
      }
      for(let i=0;i<this.meshes.length;i++){
        const mesh=this.meshes[i];if(!mesh)continue;const count=Math.min(counts[i],p.maxClouds);mesh.count=count;
        if(count){mesh.instanceMatrix.needsUpdate=true;drawCalls++;}
      }
      this.windAtPackX=this.windX;this.windAtPackZ=this.windZ;this.root.position.set(0,0,0);
      this.stats.visible=visible;this.stats.drawCalls=drawCalls;this.forcePack=false;
    }

    _computeShadowDirection(out){
      const p=Math.max(0,Math.min(1,Number(this.profile.shadowParallax??.18)));
      out.copy(this.tmpMoonDir);
      out.x*=p;out.z*=p;
      if(out.lengthSq()<1e-6)out.set(0,1,0);
      return out.normalize();
    }

    _updateUniforms(){
      const u=this.material.uniforms,b=this.getBoatPosition(),moon=this.getMoonPosition();
      u.uCameraPos.value.copy(this.camera.position);
      this.tmpMoonDir.copy(moon).sub(b);if(this.tmpMoonDir.lengthSq()<.001)this.tmpMoonDir.set(-.35,.52,-.78);this.tmpMoonDir.normalize();
      this._computeShadowDirection(this.tmpShadowDir);
      u.uMoonDirection.value.copy(this.tmpMoonDir);
      const span=this.worldState.shaderWrap||8192;u.uWorldOffset.value.set(wrapped(this.worldState.originX,span),wrapped(this.worldState.originZ,span));
    }

    _updateBoatShadowFactor(dt){
      // Scalar shadow is only for Canvas reflection/wake intensity. The WebGL hull uses per-pixel moon-space shadow.
      const boatLocal=this.getBoatPosition(),b=this._boatGlobal(this.tmpBoatGlobal),dir=this.tmpShadowDir;
      let target=0;
      if(dir.y>.0001){
        for(const c of this.activeClouds){
          const t=(c.y-boatLocal.y)/dir.y;if(t<=0)continue;
          const hitX=b.x+dir.x*t,hitZ=b.z+dir.z*t,wx=c.baseX+this.windX,wz=c.baseZ+this.windZ;
          const dx=hitX-wx,dz=hitZ-wz,cs=Math.cos(c.rotation),sn=Math.sin(c.rotation);
          const lx=(cs*dx+sn*dz)/c.scale,lz=(-sn*dx+cs*dz)/c.scale,template=this.templates[c.templateIndex];
          if(!pointInPolygon(lx,lz,template.outline))continue;
          const edgeWorld=minEdgeDistance(lx,lz,template.outline)*c.scale;
          target=Math.max(target,.18+.82*smooth01(edgeWorld/.55));
        }
      }
      this.boatShadeTarget=target;
      const follow=1-Math.exp(-Math.max(0,dt)*9.0);this.boatShade+=(target-this.boatShade)*follow;this.stats.boatShade=this.boatShade;
    }

    _shadowNeedsUpdate(localBoat){
      const p=this.profile;if(this.forceShadow)return true;
      const boatMoved=Math.hypot(localBoat.x-this.lastShadowBoat.x,localBoat.z-this.lastShadowBoat.y);
      const windMoved=Math.hypot(this.windX-this.lastShadowWind.x,this.windZ-this.lastShadowWind.y);
      return boatMoved>=p.shadowBoatStep||windMoved>=p.shadowWindStep;
    }

    _renderShadow(){
      if(!this.shadowTarget||!this.shadowCamera)return;
      const THREE=this.THREE,r=this.renderer,b=this.getBoatPosition();
      const sx=Math.round(b.x*4)/4,sz=Math.round(b.z*4)/4;this.shadowCenter.set(sx,sz);
      const center=this.tmpProject.set(sx,0,sz),dir=this.tmpShadowDir.lengthSq()>.0001?this.tmpShadowDir:this.tmpMoon.set(-.08,.99,-.12).normalize();
      this.shadowCamera.position.copy(center).addScaledVector(dir,38);this.shadowCamera.up.set(0,1,0);this.shadowCamera.lookAt(center);this.shadowCamera.updateMatrixWorld(true);
      this.shadowMatrix.multiplyMatrices(this.shadowCamera.projectionMatrix,this.shadowCamera.matrixWorldInverse);

      const oldTarget=r.getRenderTarget(),oldOverride=this.cloudScene.overrideMaterial,oldColor=new THREE.Color();
      r.getClearColor(oldColor);const oldAlpha=r.getClearAlpha();
      this.cloudScene.overrideMaterial=this.shadowMaterial;
      r.setRenderTarget(this.shadowTarget);r.setClearColor(0x000000,0);r.clear(true,false,false);r.render(this.cloudScene,this.shadowCamera);
      this.cloudScene.overrideMaterial=oldOverride;r.setRenderTarget(oldTarget);r.setClearColor(oldColor,oldAlpha);
      this.shadowCarry=0;this.forceShadow=false;this.lastShadowBoat.set(b.x,b.z);this.lastShadowWind.set(this.windX,this.windZ);
    }

    update(t,dt){
      if(!this.enabled)return;
      this.windX+=this.windSpeedX*dt;this.windZ+=this.windSpeedZ*dt;this._updateUniforms();
      if(this.testMode){this._applyTestCloud();}
      else{
        const cell=this._cellForBoat(),windShift=Math.hypot(this.windX-this.fieldWindX,this.windZ-this.fieldWindZ);
        if(this.forceField||cell.x!==this.lastCellX||cell.z!==this.lastCellZ||windShift>this.profile.cellSize*.58){this._collectField();this.forceField=false;}
      }
      if(this.forcePack)this._packInstances();else this.root.position.set(this.windX-this.windAtPackX,0,this.windZ-this.windAtPackZ);
      this._updateBoatShadowFactor(dt);
      if(this.shadowTarget){
        this.shadowCarry+=dt;const b=this.getBoatPosition();
        if(this.shadowCarry>=1/this.profile.shadowHz&&this._shadowNeedsUpdate(b))this._renderShadow();
      }
    }

    getBoatShade(){return this.boatShade;}

    // v9.4: no Canvas-side cloud occlusion helpers are needed.
    // Ship FX are composited into the WebGL pipeline before the final cloud layer,
    // so the actual cloud render order performs the occlusion exactly.

    applyBoatUniforms(uniforms){
      if(!uniforms)return;
      if(uniforms.uCloudShadowMap)uniforms.uCloudShadowMap.value=this.shadowTexture||this.blackTexture;
      if(uniforms.uCloudShadowCenter)uniforms.uCloudShadowCenter.value.copy(this.shadowCenter);
      if(uniforms.uCloudShadowExtent)uniforms.uCloudShadowExtent.value=this.profile.shadowExtent;
      if(uniforms.uCloudShadowMatrix)uniforms.uCloudShadowMatrix.value.copy(this.shadowMatrix);
    }

    applyOceanUniforms(uniforms){
      if(!uniforms)return;
      if(uniforms.uCloudShadowMap)uniforms.uCloudShadowMap.value=this.shadowTexture||this.blackTexture;
      if(uniforms.uCloudShadowCenter)uniforms.uCloudShadowCenter.value.copy(this.shadowCenter);
      if(uniforms.uCloudShadowExtent)uniforms.uCloudShadowExtent.value=this.profile.shadowExtent;
      if(uniforms.uCloudShadowMatrix)uniforms.uCloudShadowMatrix.value.copy(this.shadowMatrix);
      if(uniforms.uCloudShadowStrength)uniforms.uCloudShadowStrength.value=this.shadowTarget?this.profile.shadowStrength:0;
      if(uniforms.uMoonDirection)uniforms.uMoonDirection.value.copy(this.tmpMoonDir);
    }

    onRebase(){
      if(!this.enabled)return;this.forceField=true;this.forcePack=true;this.forceShadow=true;this.lastShadowBoat.set(1e9,1e9);
    }

    dispose(){
      this.cloudScene.remove(this.root);
      for(const g of this.geometries)g.dispose();
      this.material.dispose();
      if(this.shadowTarget)this.shadowTarget.dispose();
      if(this.shadowMaterial)this.shadowMaterial.dispose();
      if(this.blackTexture)this.blackTexture.dispose();
    }
  }

  global.CosmicCloudSystem=CosmicCloudSystem;
})(window);
