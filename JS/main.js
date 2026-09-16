// Cosmic Fishing v10.0.0 Online Ranking runtime.
// Loaded as a classic script so local file:// launch does not fetch local ES modules.
window.COSMIC_MAIN=function CosmicFishingMain(deps){
  'use strict';
  const {THREE,EffectComposer,RenderPass,UnrealBloomPass,ShaderPass}=deps||{};
  const core=window.CosmicCore||{};
  const {createRuntimeConfig,createAssetTools,ASSET_STATE,installFishingInputRouter}=core;
  if(!THREE||!EffectComposer||!RenderPass||!UnrealBloomPass||!ShaderPass){
    throw new Error('CLEAN CORE bootstrap dependencies are incomplete.');
  }
  if(!createRuntimeConfig||!createAssetTools||!ASSET_STATE||!installFishingInputRouter){
    throw new Error('CLEAN CORE scripts are incomplete.');
  }
    console.info('[CosmicFishing v9.8.4] real IMG files over HTTP + fresh embedded fallback for file:// + current ship atlas assets.');
    const runtimeErrorEl = document.getElementById('runtimeError');
    function showRuntimeError(message) {
      if (!runtimeErrorEl) return;
      runtimeErrorEl.style.display = 'block';
      runtimeErrorEl.textContent = 'COSMIC FISHING ERROR\n' + message;
    }
    window.addEventListener('error', e => showRuntimeError(e.message || String(e.error || 'Unknown error')));
    window.addEventListener('unhandledrejection', e => showRuntimeError(String(e.reason || 'Unhandled promise rejection')));

    // v8 keeps ONE authoritative world-space WebGL boat renderer in both HTTP and direct file:// launch.
    // PNGs used by WebGL are resolved from embedded data URIs, avoiding local-file texture/CORS fallbacks.
    const DIRECT_FILE_MODE = location.protocol === 'file:';
    console.info('[CosmicFishing] launch mode:', DIRECT_FILE_MODE ? 'direct file:// (embedded textures)' : 'HTTP(S)');

    const compassStripEl = document.getElementById('compassStrip');
    const compassCenterLabelEl = document.getElementById('compassCenterLabel');
    const audioHintEl = document.getElementById('audioHint');
    const bgm = document.getElementById('bgm');
    const motorSfx = document.getElementById('motorSfx');
    const rodCastSfx = document.getElementById('rodCastSfx');
    const reelSfx = document.getElementById('reelSfx');
    const fishBiteSfx = document.getElementById('fishBiteSfx');
    const fishHookSfx = document.getElementById('fishHookSfx');
    const fishEscapeSfx = document.getElementById('fishEscapeSfx');
    const fishCompleteSfx = document.getElementById('fishCompleteSfx');
    const ROD_CAST_SFX_VOLUME = 0.42;
    const FISH_BITE_SFX_VOLUME = 0.34;
    const FISH_HOOK_SFX_VOLUME = 0.40;
    const FISH_ESCAPE_SFX_VOLUME = 0.40;
    const FISH_COMPLETE_SFX_VOLUME = 0.36;
    const REEL_SFX_CONFIG = Object.freeze({
      minVolume: 0.11,
      maxVolume: 0.26,
      pinnedVolume: 0.075,
      minRate: 0.96,
      maxRate: 1.08,
      barMaxSpeed: 0.72,
      attackSeconds: 0.022,
      releaseSeconds: 0.075
    });

    let audioUnlocked = false;
    let bgmStarted = false;
    let motorPrimed = false;
    let reelPrimed = false;
    let reelPlaybackRate = REEL_SFX_CONFIG.minRate;

    async function startBgm() {
      if (bgmStarted || !bgm) return;
      try {
        bgm.volume = 0.45;
        await bgm.play();
        bgmStarted = true;
        audioHintEl.classList.remove('show');
      } catch (_) {
        audioHintEl.classList.add('show');
      }
    }

    async function primeOneShotSfx(audio, baseVolume) {
      if (!audio) return;
      try {
        audio.volume = 0;
        audio.playbackRate = 1;
        if ('preservesPitch' in audio) audio.preservesPitch = false;
        if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = false;
        if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = false;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
      } catch (_) {
        try { audio.pause(); audio.currentTime = 0; } catch (_err) {}
      }
      audio.volume = baseVolume;
    }

    function playFishingOneShot(audio, volume, minRate=1, maxRate=1) {
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volume;
        const lo = Math.min(minRate,maxRate);
        const hi = Math.max(minRate,maxRate);
        audio.playbackRate = lo + Math.random() * (hi - lo);
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
      } catch (_) {}
    }

    function playFishBiteSfx() {
      // Alert cue: slightly darker than the source and micro-varied so repeated bites do not sound cloned.
      playFishingOneShot(fishBiteSfx, FISH_BITE_SFX_VOLUME, 0.985, 1.015);
    }

    function playFishHookSfx() {
      // Hook-set cue: a little heavier than the alert and lands exactly when the minigame opens.
      playFishingOneShot(fishHookSfx, FISH_HOOK_SFX_VOLUME, 0.98, 1.01);
    }

    function stopFishingReelAudioImmediate() {
      if (!reelSfx) return;
      try { reelSfx.pause(); } catch (_) {}
      reelSfx.volume = 0;
    }

    function playFishEscapeSfx() {
      // Failure cue: darker, downward and slightly varied so repeated escapes do not feel copy-pasted.
      stopFishingReelAudioImmediate();
      playFishingOneShot(fishEscapeSfx, FISH_ESCAPE_SFX_VOLUME, 0.99, 1.01);
    }

    function playFishCompleteSfx() {
      // Success cue: warm low chime + subtle water body, intentionally less bright than the source.
      stopFishingReelAudioImmediate();
      playFishingOneShot(fishCompleteSfx, FISH_COMPLETE_SFX_VOLUME, 1, 1);
    }

    async function unlockAudio() {
      if (audioUnlocked) return;
      audioUnlocked = true;
      try {
        if (motorSfx) {
          motorSfx.volume = 0;
          await motorSfx.play();
          motorSfx.pause();
          motorSfx.currentTime = 0;
          motorPrimed = true;
        }
      } catch (_) {}
      try {
        if (rodCastSfx) {
          rodCastSfx.volume = 0;
          await rodCastSfx.play();
          rodCastSfx.pause();
          rodCastSfx.currentTime = 0;
          rodCastSfx.volume = ROD_CAST_SFX_VOLUME;
        }
      } catch (_) {
        if (rodCastSfx) rodCastSfx.volume = ROD_CAST_SFX_VOLUME;
      }
      try {
        if (reelSfx) {
          reelSfx.volume = 0;
          reelSfx.loop = true;
          // Small playback-rate shifts should also shift the mechanical pitch slightly.
          if ('preservesPitch' in reelSfx) reelSfx.preservesPitch = false;
          if ('mozPreservesPitch' in reelSfx) reelSfx.mozPreservesPitch = false;
          if ('webkitPreservesPitch' in reelSfx) reelSfx.webkitPreservesPitch = false;
          await reelSfx.play();
          reelSfx.pause();
          reelSfx.currentTime = 0;
          reelSfx.playbackRate = REEL_SFX_CONFIG.minRate;
          reelPrimed = true;
        }
      } catch (_) {
        if (reelSfx) {
          reelSfx.pause();
          reelSfx.volume = 0;
        }
      }
      await primeOneShotSfx(fishBiteSfx, FISH_BITE_SFX_VOLUME);
      await primeOneShotSfx(fishHookSfx, FISH_HOOK_SFX_VOLUME);
      await primeOneShotSfx(fishEscapeSfx, FISH_ESCAPE_SFX_VOLUME);
      await primeOneShotSfx(fishCompleteSfx, FISH_COMPLETE_SFX_VOLUME);
      await startBgm();
    }

    function playRodCastSfx() {
      if (!rodCastSfx) return;
      rodCastSfx.pause();
      rodCastSfx.currentTime = 0;
      rodCastSfx.volume = ROD_CAST_SFX_VOLUME;
      const playPromise = rodCastSfx.play();
      if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
    }

    function stopRodCastSfxImmediate() {
      if (!rodCastSfx) return;
      try { rodCastSfx.pause(); } catch (_) {}
      try { rodCastSfx.currentTime = 0; } catch (_) {}
    }

    const {
      URL_PARAMS,CAST_TEST_MODE,RENDER_OPT2_ENABLED,
      IS_MOBILE_RENDER,DEVICE_MEMORY_GB,CPU_CORES,MOBILE_LOW_END,
      requestedQuality,mobileTier,PERF,
      OPT2_FX_CAP,SHIP_FX_MAX_WIDTH,SHIP_FX_MAX_HEIGHT,WIND_RT_SCALE,
      GLOBAL_PIXEL_DEFAULT,CLOUD_PIXEL_DEFAULT,
      GLOBAL_PIXEL_SIZE_RENDERPX,CLOUD_PIXEL_SIZE_RENDERPX,
      WIND_GUSTS_ENABLED,worldWind
    } = createRuntimeConfig(THREE);


    // Unified viewport state. Width/height/DPR are treated as one render contract so browser
    // Ctrl+wheel zoom cannot update CSS pixels without also updating renderer/composer/pixel FX.
    const viewportState={
      width:window.innerWidth,
      height:window.innerHeight,
      dpr:Math.min(window.devicePixelRatio || 1, PERF.dprCap)
    };
    let RENDER_DPR=viewportState.dpr;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE_RENDER, powerPreference: 'high-performance' }); }
    catch (err) { showRuntimeError('WebGL renderer initialization failed: ' + (err?.message || err)); throw err; }
    renderer.domElement.className = 'webgl-canvas';
    renderer.setPixelRatio(RENDER_DPR);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.sortObjects = true;
    document.body.prepend(renderer.domElement);
    // Avoid downloading/decoding both audio tracks before the first interaction on mobile.
    if (IS_MOBILE_RENDER) audioHintEl.classList.add('show'); else startBgm();
    window.addEventListener('pointerdown', unlockAudio, { once: true });

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03050b, 0.04);

    const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 300);
    camera.position.set(1.0, 9.5, 7.5);
    camera.lookAt(0.1, 0.52, 0.02);

    // === Endless Ocean / Floating Origin ===
    // Keep all rendered coordinates near zero forever and accumulate travel separately.
    // This removes invisible world bounds without letting WebGL coordinates grow huge.
    const worldState={originX:0,originZ:0,rebaseThreshold:8.0,rebaseCount:0,shaderWrap:8192.0};
    function wrappedShaderCoord(v){
      const w=worldState.shaderWrap;
      const h=w*0.5;
      // Keep ocean coordinates near zero while preserving sign.
      // This avoids the first floating-origin rebase turning small negative values
      // like -8 into huge positive values like 262136, which flattened the water.
      return ((((v+h)%w)+w)%w)-h;
    }
    function syncOceanWorldOffset(){
      // Feed the ocean shader a centered wrapped offset so rebase keeps wave/noise continuity.
      oceanUniforms.uWorldOffset.value.set(wrappedShaderCoord(worldState.originX),wrappedShaderCoord(worldState.originZ));
    }

    const PixelShader = {
      uniforms: {
        tDiffuse: { value: null },
        tFx: { value: null },
        tWind: { value: null },
        tCloud: { value: null },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        pixelSize: { value: 1.5 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tFx;
        uniform sampler2D tWind;
        uniform sampler2D tCloud;
        uniform vec2 resolution;
        uniform float pixelSize;
        varying vec2 vUv;
        void main() {
          // The base game receives only the subtle global pixel snap. Clouds are already rendered
          // to a very low-resolution Nearest target, so sampling them at vUv preserves their much
          // larger independent pixel blocks. Both layers are merged here in ONE final fullscreen pass.
          vec2 dxy = pixelSize / resolution;
          vec2 coord = dxy * floor(vUv / dxy);

          // Base world + boat receive the weak global pixel sample.
          vec4 base = texture2D(tDiffuse, coord);

          // Reflection / water-contact / wake are composited above the base world but still below
          // atmospheric wind and the final cloud layer.
          vec4 fx = texture2D(tFx, coord);
          float fxA = clamp(fx.a, 0.0, 1.0);
          vec4 underWind = vec4(mix(base.rgb, fx.rgb, fxA), max(base.a, fxA));

          // Wind has its own transparent world-space layer. It is intentionally composited AFTER
          // the realtime boat + ship FX, so gust streaks can pass over the hull, but BEFORE clouds.
          // Sampling with coord gives wind the same weak global pixel snap as the non-cloud world.
          vec4 wind = texture2D(tWind, coord);
          float windA = clamp(wind.a, 0.0, 1.0);
          // windLayerTarget is alpha-blended over transparent black, so sampled RGB is already
          // premultiplied by accumulated wind alpha. Use premultiplied-over composition here.
          vec4 underCloud = vec4(
            wind.rgb + underWind.rgb * (1.0 - windA),
            windA + underWind.a * (1.0 - windA)
          );

          // Clouds remain the final visual layer and therefore cover boat, ship FX and wind alike.
          vec4 cloud = texture2D(tCloud, vUv);
          float cloudA = clamp(cloud.a, 0.0, 1.0);
          gl_FragColor = vec4(
            mix(underCloud.rgb, cloud.rgb, cloudA),
            max(underCloud.a, cloudA)
          );
        }
      `
    };

    // v9.7.1: ship reflection / contact / wake are no longer a DOM overlay above WebGL.
    // The existing canvas is now an off-screen drawing surface uploaded as one CanvasTexture,
    // alpha-composited into the composer BEFORE the final cloud layer. This makes cloud occlusion
    // automatic for every ship FX pixel and removes all screen-space cloud-mask mismatch cases.
    const shipFxCanvas = document.getElementById('shipFxCanvas');
    const fxCtx = shipFxCanvas.getContext('2d', { alpha: true });
    fxCtx.imageSmoothingEnabled = true;
    fxCtx.imageSmoothingQuality = IS_MOBILE_RENDER ? 'medium' : 'high';

    const shipFxTexture = new THREE.CanvasTexture(shipFxCanvas);
    shipFxTexture.minFilter = THREE.LinearFilter;
    shipFxTexture.magFilter = THREE.LinearFilter;
    shipFxTexture.generateMipmaps = false;
    shipFxTexture.wrapS = THREE.ClampToEdgeWrapping;
    shipFxTexture.wrapT = THREE.ClampToEdgeWrapping;
    shipFxTexture.colorSpace = THREE.NoColorSpace;
    shipFxTexture.name = 'CosmicShipFxCanvasTexture';

    const composer = new EffectComposer(renderer);

    // v9.7.1 logical render order:
    // 1) base world -> 2) realtime world-space Normal-map boat -> 3) Bloom
    // -> 4) off-screen ship FX -> 5) transparent wind layer -> 6) strong-pixel clouds.
    // Steps 4-6 are merged into the ONE final PixelShader. This explicit texture order guarantees
    // Wind is ABOVE the hull/FX while Clouds remain ABOVE Wind.
    const worldPass = new RenderPass(scene, camera);
    composer.addPass(worldPass);

    const boatScene = new THREE.Scene();
    const boatGeometry = new THREE.PlaneGeometry(1,1);
    const boatPlaceholderMaterial = new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false});
    const boatMesh = new THREE.Mesh(boatGeometry, boatPlaceholderMaterial);
    boatMesh.visible = false;
    boatMesh.frustumCulled = false;
    boatMesh.renderOrder = 100;
    boatScene.add(boatMesh);

    // v9.8.7: character/contact shadow are a true world-space overlay on the SAME 170x170 plane
    // as the hull. They no longer depend on CSS pixels, DPR, browser zoom or the Ship FX canvas.
    const characterLayerCanvas=document.createElement('canvas');
    characterLayerCanvas.width=170;characterLayerCanvas.height=170;
    const characterLayerCtx=characterLayerCanvas.getContext('2d',{alpha:true,willReadFrequently:false});
    characterLayerCtx.imageSmoothingEnabled=false;
    const characterLayerTexture=new THREE.CanvasTexture(characterLayerCanvas);
    characterLayerTexture.minFilter=THREE.NearestFilter;
    characterLayerTexture.magFilter=THREE.NearestFilter;
    characterLayerTexture.generateMipmaps=false;
    characterLayerTexture.wrapS=THREE.ClampToEdgeWrapping;
    characterLayerTexture.wrapT=THREE.ClampToEdgeWrapping;
    characterLayerTexture.colorSpace=THREE.SRGBColorSpace;
    characterLayerTexture.name='CosmicBoatCharacterWorldLayer';
    const characterLayerMaterial=new THREE.MeshBasicMaterial({
      map:characterLayerTexture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false
    });
    const characterMesh=new THREE.Mesh(boatGeometry,characterLayerMaterial);
    characterMesh.visible=false;
    characterMesh.frustumCulled=false;
    characterMesh.renderOrder=101;
    boatScene.add(characterMesh);

    // v9 keeps the v8 WORLD-SPACE billboard hull. It shares the exact same PerspectiveCamera as
    // ocean/waves/clouds, so browser zoom, FOV and camera distance affect every world element equally.
    const boatPass = new RenderPass(boatScene, camera);
    boatPass.clear = false;
    boatPass.clearDepth = false;
    composer.addPass(boatPass);

    // Wind is isolated from the base scene because Boat uses a separate RenderPass.
    // A same-scene renderOrder cannot put wind above boatPass, so wind gets one transparent layer
    // texture that is composited in the final shader AFTER boat/ship-FX and BEFORE clouds.
    const windScene = new THREE.Scene();
    const windLayerTarget = new THREE.WebGLRenderTarget(1,1,{
      minFilter:THREE.NearestFilter,
      magFilter:THREE.NearestFilter,
      format:THREE.RGBAFormat,
      depthBuffer:false,
      stencilBuffer:false
    });
    windLayerTarget.texture.generateMipmaps=false;
    windLayerTarget.texture.colorSpace=THREE.NoColorSpace;
    windLayerTarget.texture.name='CosmicWindAboveBoatTarget';
    const windDrawingBufferSize=new THREE.Vector2();
    function syncWindLayerTarget(){
      renderer.getDrawingBufferSize(windDrawingBufferSize);
      // Wind sprites are authored pixel VFX. Rendering them to a smaller Nearest-filter target
      // reduces fill-rate and RT bandwidth without changing their world-space transforms.
      const w=Math.max(1,Math.round(windDrawingBufferSize.x*WIND_RT_SCALE));
      const h=Math.max(1,Math.round(windDrawingBufferSize.y*WIND_RT_SCALE));
      if(windLayerTarget.width!==w||windLayerTarget.height!==h)windLayerTarget.setSize(w,h);
    }
    syncWindLayerTarget();
    const windClearColor=new THREE.Color();
    function renderWindLayer(){
      const oldTarget=renderer.getRenderTarget();
      const oldAlpha=renderer.getClearAlpha();
      renderer.getClearColor(windClearColor);
      renderer.setRenderTarget(windLayerTarget);
      renderer.setClearColor(0x000000,0);
      renderer.clear(true,false,false);
      renderer.render(windScene,camera);
      renderer.setRenderTarget(oldTarget);
      renderer.setClearColor(windClearColor,oldAlpha);
    }

    // Visual clouds live only in this scene. v9 renders this scene to a tiny low-resolution
    // RGBA target. The final PixelShader samples it with NearestFilter while applying only a weak
    // pixel snap to the base game. The target replaces cloudPass, so cloud draws are not duplicated.
    const cloudScene = new THREE.Scene();
    const cloudPixelTarget = new THREE.WebGLRenderTarget(1,1,{
      minFilter:THREE.NearestFilter,
      magFilter:THREE.NearestFilter,
      format:THREE.RGBAFormat,
      depthBuffer:false,
      stencilBuffer:false
    });
    cloudPixelTarget.texture.generateMipmaps=false;
    cloudPixelTarget.texture.colorSpace=THREE.NoColorSpace;
    cloudPixelTarget.texture.name='CosmicCloudPixelTarget';
    const cloudDrawingBufferSize=new THREE.Vector2();

    function syncCloudPixelTarget(){
      // Size from the REAL renderer drawing buffer instead of CSS viewport dimensions.
      // This makes a cloud source texel about CLOUD_PIXEL_SIZE_RENDERPX output pixels wide at
      // 100%, 125%, 150%, 200% browser zoom instead of accidentally doubling with browser zoom.
      renderer.getDrawingBufferSize(cloudDrawingBufferSize);
      const w=Math.max(24,Math.ceil(cloudDrawingBufferSize.x/CLOUD_PIXEL_SIZE_RENDERPX));
      const h=Math.max(14,Math.ceil(cloudDrawingBufferSize.y/CLOUD_PIXEL_SIZE_RENDERPX));
      if(cloudPixelTarget.width!==w||cloudPixelTarget.height!==h)cloudPixelTarget.setSize(w,h);
    }
    syncCloudPixelTarget();

    const cloudClearColor=new THREE.Color();
    function renderPixelCloudLayer(){
      const oldTarget=renderer.getRenderTarget();
      const oldAlpha=renderer.getClearAlpha();
      renderer.getClearColor(cloudClearColor);
      renderer.setRenderTarget(cloudPixelTarget);
      renderer.setClearColor(0x000000,0);
      renderer.clear(true,false,false);
      renderer.render(cloudScene,camera);
      renderer.setRenderTarget(oldTarget);
      renderer.setClearColor(cloudClearColor,oldAlpha);
    }

    // Bloom is retained on balanced/high mobile. Low-end mode skips the costly blur chain.
    let bloomPass = null;
    if (PERF.bloom) {
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.72, 0.95, 0.18
      );
      composer.addPass(bloomPass);
    }
    const pixelPass = new ShaderPass(PixelShader);
    // IMPORTANT: ShaderPass clones shader uniforms during construction.
    // Bind both live textures AFTER creating the pass.
    pixelPass.uniforms.tFx.value = shipFxTexture;
    pixelPass.uniforms.tWind.value = windLayerTarget.texture;
    pixelPass.uniforms.tCloud.value = cloudPixelTarget.texture;
    // One final pass: weak-pixel world/boat/FX -> wind -> strong-pixel clouds.
    pixelPass.uniforms.pixelSize.value = GLOBAL_PIXEL_SIZE_RENDERPX;
    composer.addPass(pixelPass);
    const renderBufferSize = new THREE.Vector2();
    function syncPostProcessResolution(){
      renderer.getDrawingBufferSize(renderBufferSize);
      pixelPass.uniforms.resolution.value.copy(renderBufferSize);
      // Global pixel block strength is kept in final render pixels, independent of browser zoom.
      pixelPass.uniforms.pixelSize.value = GLOBAL_PIXEL_SIZE_RENDERPX;
    }
    syncPostProcessResolution();

    // 원본 조명/달 분위기 유지
    scene.add(new THREE.AmbientLight(0x9ab2ff, 0.70));
    const moonLight = new THREE.DirectionalLight(0xb8ccff, 1.30);
    moonLight.position.set(5, 8, 3);
    scene.add(moonLight);
    const rimLight = new THREE.DirectionalLight(0x67bbff, 0.56);
    rimLight.position.set(-6, 3, -5);
    scene.add(rimLight);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xd8eaff })
    );
    moon.position.set(-8, 12, -18);
    scene.add(moon);
    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0x8fc6ff, transparent: true, opacity: 0.22, depthWrite: false
    }));
    moonGlow.scale.set(7, 7, 1);
    moonGlow.position.copy(moon.position);
    scene.add(moonGlow);

    // 900개 개별 Mesh 대신 1개의 Points draw call. 위치/색/반짝임은 원본 성격 유지.
    const STAR_COUNT = PERF.starCount;
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starColors = new Float32Array(STAR_COUNT * 3);
    const starSizes = new Float32Array(STAR_COUNT);
    const starPhases = new Float32Array(STAR_COUNT);
    const tempColor = new THREE.Color();
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 35 + Math.random() * 80;
      const a = Math.random() * Math.PI * 2;
      const h = 10 + Math.random() * 22;
      starPositions[i * 3] = Math.cos(a) * r;
      starPositions[i * 3 + 1] = h;
      starPositions[i * 3 + 2] = Math.sin(a) * r;
      tempColor.setHSL(0.58 + Math.random() * 0.05, 0.5, 0.75 + Math.random() * 0.2);
      starColors[i * 3] = tempColor.r;
      starColors[i * 3 + 1] = tempColor.g;
      starColors[i * 3 + 2] = tempColor.b;
      starSizes[i] = 1.25 + Math.random() * 2.4;
      starPhases[i] = Math.random() * Math.PI * 2;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('aColor', new THREE.BufferAttribute(starColors, 3));
    starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
    starGeometry.setAttribute('aPhase', new THREE.BufferAttribute(starPhases, 1));
    const starUniforms = { uTime: { value: 0 } };
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: starUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        uniform float uTime;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aPhase;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          float tw = 0.80 + (sin(uTime * 1.2 + aPhase) * 0.5 + 0.5) * 0.45;
          vAlpha = 0.62 + tw * 0.28;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.0, aSize * tw * (140.0 / max(30.0, -mv.z)));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          if (dot(p,p) > 0.25) discard;
          gl_FragColor = vec4(vColor, vAlpha);
        }
      `
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    const lanternWorldPos = new THREE.Vector3();
    const lanternColor = new THREE.Color(0xffe27a);
    const cloudShadowFallback = new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat);
    cloudShadowFallback.needsUpdate = true;
    cloudShadowFallback.minFilter = THREE.NearestFilter;
    cloudShadowFallback.magFilter = THREE.NearestFilter;
    cloudShadowFallback.generateMipmaps = false;
    cloudShadowFallback.colorSpace = THREE.NoColorSpace;
    const oceanUniforms = {
      uTime: { value: 0.0 },
      uColorA: { value: new THREE.Color(0x02060d) },
      uColorB: { value: new THREE.Color(0x07162a) },
      uGlow: { value: new THREE.Color(0x6ab8ff) },
      uLanternPos: { value: new THREE.Vector3() },
      uLanternColor: { value: lanternColor.clone() },
      uLanternIntensity: { value: 0.0 },
      uWorldOffset: { value: new THREE.Vector2(0,0) },
      uMoonDirection: { value: new THREE.Vector3(-8,12,-18).normalize() },
      uCloudShadowMap: { value: cloudShadowFallback },
      uCloudShadowMatrix: { value: new THREE.Matrix4() },
      uCloudShadowCenter: { value: new THREE.Vector2(0,0) },
      uCloudShadowExtent: { value: 40.0 },
      uCloudShadowStrength: { value: 0.0 }
    };

    // Pixel post-processing hides dense tessellation. Mobile trims vertices aggressively.
    const oceanGeometry = new THREE.PlaneGeometry(180, 180, PERF.oceanSegments, PERF.oceanSegments);
    const oceanMaterial = new THREE.ShaderMaterial({
      uniforms: oceanUniforms,
      side: THREE.FrontSide,
      vertexShader: `
        uniform float uTime;
        uniform vec2 uWorldOffset;
        varying vec2 vUv;
        varying vec2 vLogicalXZ;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;
        varying float vWave;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float gx = position.x + uWorldOffset.x;
          // PlaneGeometry is rotated -90deg on X, so object +Y maps to world -Z.
          float gz = -position.y + uWorldOffset.y;
          vLogicalXZ = vec2(gx,gz);
          float t = uTime * 0.28;
          float waveA = sin(gx * 0.14 + t * 2.0) * 0.10;
          float waveB = cos(gz * 0.11 - t * 1.35) * 0.07;
          float waveC = sin((gx + gz) * 0.06 - t * 1.15) * 0.14;
          float waveD = cos(length(vec2(gx,gz)) * 0.16 - t * 1.7) * 0.04;
          pos.z += waveA + waveB + waveC + waveD;
          vWave = pos.z;
          vec3 objectNormal = normalize(vec3(
            -0.14 * cos(gx * 0.14 + t * 2.0) - 0.06 * cos((gx + gz) * 0.06 - t * 1.15),
             1.0,
             0.11 * sin(gz * 0.11 - t * 1.35) - 0.06 * cos((gx + gz) * 0.06 - t * 1.15)
          ));
          vec4 world = modelMatrix * vec4(pos, 1.0);
          vWorldPos = world.xyz;
          vNormalW = normalize(mat3(modelMatrix) * objectNormal);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uGlow;
        uniform vec3 uLanternPos;
        uniform vec3 uLanternColor;
        uniform float uLanternIntensity;
        uniform vec3 uMoonDirection;
        uniform sampler2D uCloudShadowMap;
        uniform mat4 uCloudShadowMatrix;
        uniform vec2 uCloudShadowCenter;
        uniform float uCloudShadowExtent;
        uniform float uCloudShadowStrength;
        varying vec2 vUv;
        varying vec2 vLogicalXZ;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;
        varying float vWave;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
        }
        void main() {
          vec2 uv = vUv; float t = uTime * 0.03;
          // Clean night-ocean shading: broad low-frequency variation only.
          // High-frequency noise and water star-speckles were removed because they read as dirt.
          vec2 drift = vLogicalXZ / 24.0;
          drift.x += sin(vLogicalXZ.y * 0.055 + uTime * 0.13) * 0.004;
          drift.y += cos(vLogicalXZ.x * 0.052 - uTime * 0.11) * 0.004;
          float nLow = noise(drift * 3.2 + vec2(t * 0.30, -t * 0.22));
          float nBand = noise(vec2(drift.x * 7.0 + t * 0.55, drift.y * 3.6 - t * 0.18));
          float macro = noise(vLogicalXZ * 0.006 + vec2(19.3,-7.1));
          float baseMix = clamp(0.49 + (nLow-.5)*0.075 + (macro-.5)*0.035,0.0,1.0);
          vec3 base = mix(uColorA, uColorB, baseMix);
          float bands = smoothstep(0.68, 0.96, nBand) * 0.055;
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 normalW = normalize(vNormalW);
          float fresnel = pow(1.0 - max(dot(normalW, viewDir), 0.0), 2.8);
          vec3 col = base;
          col += bands * uGlow * (0.42 + fresnel * 0.34);
          col += fresnel * uGlow * 0.105;
          col += vWave * 0.024 * vec3(0.35, 0.55, 0.95);

          // One light-space lookup shared with the boat. The shadow camera follows the real moon
          // direction, so cloud height naturally offsets the shadow instead of dropping it straight down.
          vec4 cloudCoord = uCloudShadowMatrix * vec4(vWorldPos, 1.0);
          vec3 cloudNdc = cloudCoord.xyz / max(abs(cloudCoord.w), 0.0001);
          vec2 shadowUv = cloudNdc.xy * 0.5 + 0.5;
          float shadowInside = step(0.0, shadowUv.x) * step(shadowUv.x, 1.0) * step(0.0, shadowUv.y) * step(shadowUv.y, 1.0);
          float cloudShadow = texture2D(uCloudShadowMap, clamp(shadowUv, 0.0, 1.0)).r * shadowInside;
          vec3 moonDir = normalize(uMoonDirection);
          float moonFacing = max(dot(normalW, moonDir), 0.0);
          float moonSpec = pow(max(dot(reflect(-moonDir, normalW), viewDir), 0.0), 24.0) * moonFacing;
          moonSpec *= 1.0 - cloudShadow * 0.72;
          col += uGlow * moonSpec * 0.10;
          col *= 1.0 - cloudShadow * uCloudShadowStrength;

          vec3 lanternVec = uLanternPos - vWorldPos;
          float lanternDist = length(lanternVec);
          vec3 lanternDir = normalize(lanternVec + vec3(0.0001));
          float lanternFacing = max(dot(normalW, lanternDir), 0.0);
          float lanternFalloff = uLanternIntensity / (1.0 + lanternDist * 0.75 + lanternDist * lanternDist * 0.16);
          float lanternSpec = pow(max(dot(reflect(-lanternDir, normalW), viewDir), 0.0), 14.0);
          vec3 lanternDiffuse = uLanternColor * lanternFalloff * (0.55 + lanternFacing * 0.85);
          vec3 lanternSurface = lanternDiffuse * 0.22;
          lanternSurface += uLanternColor * lanternSpec * lanternFalloff * 0.60;
          float warmPool = exp(-lanternDist * lanternDist * 0.085) * uLanternIntensity;
          lanternSurface += uLanternColor * warmPool * 0.22;
          col += lanternSurface;
          float vignette = smoothstep(1.25, 0.35, distance(uv, vec2(0.5)));
          col *= mix(0.68, 1.0, vignette);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
    ocean.rotation.x = -Math.PI / 2;
    ocean.renderOrder = 0;
    scene.add(ocean);

    function oceanWaveHeight(x, z, time) {
      // JS-side wave sampling must match the shader's centered wrapped world coordinates.
      const gx=x+wrappedShaderCoord(worldState.originX);
      const gz=z+wrappedShaderCoord(worldState.originZ);
      const t = time * 0.28;
      return Math.sin(gx * 0.14 + t * 2.0) * 0.10
        + Math.cos(gz * 0.11 - t * 1.35) * 0.07
        + Math.sin((gx + gz) * 0.06 - t * 1.15) * 0.14
        + Math.cos(Math.sqrt(gx*gx + gz*gz) * 0.16 - t * 1.7) * 0.04;
    }

    const boatRoot = new THREE.Group();
    scene.add(boatRoot);

    // Paper clouds are isolated from index.html: six tiny polygon silhouettes are instanced in WebGL.
    // No voxel decode/LOD/runtime cloud noise is used. ?clouds=off remains available for profiling.
    let cloudSystem = null;
    const CLOUDS_ENABLED = URL_PARAMS.get('clouds') !== 'off';
    try {
      if (CLOUDS_ENABLED && window.CosmicCloudSystem && window.COSMIC_CLOUD_TEMPLATES) {
        cloudSystem = new window.CosmicCloudSystem(THREE, {
          scene,
          cloudScene,
          fog: scene.fog,
          camera,
          renderer,
          PERF,
          worldState,
          testMode: (URL_PARAMS.get('cloudtest') || ''),
          getBoatPosition: () => boatRoot.position,
          getMoonPosition: () => moon.position,
          windDirection: worldWind.direction,
          windSpeed: worldWind.cloudSpeed
        });
        cloudSystem.applyOceanUniforms(oceanUniforms);
      } else if (CLOUDS_ENABLED) {
        console.warn('[CosmicFishing] cloud scripts were not available; continuing without clouds.');
      }
    } catch (err) {
      console.error('[CosmicFishing] cloud initialization failed:', err);
      cloudSystem = null;
    }

    const {
      resolveAssetURL,
      applyPixelTextureSettings,
      pixelTexture,
      loadImageAsset,
      extractImageData
    } = createAssetTools(THREE);


    // Two exact atlases replace the 50 individual wind PNG runtime loads.
    // Wind uses its own transparent layer so final order is Boat/FX -> Wind -> Clouds.
    const windNormalAtlas=pixelTexture('./IMG/wind_atlas.png',false);
    const windStrongAtlas=pixelTexture('./IMG/strong_wind_atlas.png',false);
    let windSystem=null;
    try{
      if(WIND_GUSTS_ENABLED && window.CosmicWindSystem){
        windSystem=new window.CosmicWindSystem(THREE,{
          scene:windScene,camera,PERF,worldState,windState:worldWind,
          normalTexture:windNormalAtlas,strongTexture:windStrongAtlas,
          getBoatPosition:()=>boatRoot.position,
          getOceanHeight:(x,z,t)=>oceanWaveHeight(x,z,t)
        });
      }
    }catch(err){console.error('[CosmicFishing] wind gust initialization failed:',err);windSystem=null;}

    // === Ship FX drawing surface: reflection, wake and contact water ===
    // v9.7.1 keeps these inexpensive Canvas2D drawing routines, but the canvas itself is hidden.
    // Its texture is composited inside EffectComposer before the final cloud layer.
    const BUILD_ID='v9.9.14.4-character-deck-position-fix';
    let simTime=0;
    const debugPanel = document.getElementById('debugPanel');
    const debugMode = URL_PARAMS.get('debug') === '1';
    const fishingTrace=[];
    function pushFishingTrace(event,extra={}){
      const entry={event,time:(typeof simTime==='number'?simTime:0),state:fishingSystem?.state||'UNINIT',...extra};
      fishingTrace.push(entry);
      if(fishingTrace.length>40)fishingTrace.shift();
      console.info('[CosmicFishing:FISH]',entry);
    }
    window.__COSMIC_FISH_DEBUG__=()=>({
      build:BUILD_ID,
      fishing:fishingSystem?.state||'UNINIT',
      fishingReady:!!fishingSystem?.ready,
      stateTime:Number(fishingSystem?.stateTime||0),
      biteWait:Number(fishingSystem?.biteWait||0),
      alertVisible:!!fishingSystem?.isBiteAlertVisible,
      rodReady:rodCastReady,
      rod:{
        active:rodCastPlayback.active,
        finishPending:rodCastPlayback.finishPending,
        frame:rodCastPlayback.frame,
        count:rodCastPlayback.frameCount,
        time:rodCastPlayback.time,
        duration:rodCastPlayback.duration,
        shown:[...rodCastPlayback.renderedFrames]
      },
      trace:[...fishingTrace]
    });
    window.__COSMIC_CAST_DEBUG__=window.__COSMIC_FISH_DEBUG__;
    if (debugMode) debugPanel.style.display = 'block';
    const shipMeta = window.COSMIC_SHIP_META;
    if (!shipMeta) throw new Error('Ship metadata failed to load.');
    const characterMeta = window.COSMIC_CHARACTER_META || null;
    const rodCastMeta = window.COSMIC_ROD_CAST_META || null;

    const SHIP_FRAME = shipMeta.frameSize;
    const REFLECTION_H = shipMeta.reflectionHeight;
    const SHIP_ASSETS = shipMeta.assets;
    const shipAnchors = shipMeta.anchors;
    const shipBounds = shipMeta.bounds;
    const shipWaterlines = shipMeta.waterlines;
    const reflectionProfiles = shipMeta.reflectionProfiles;
    let overlayScale = 1;
    let shipReflectionAtlas=null;
    let shipDiffuseAtlas=null;
    let shipAoAtlas=null;
    let shipAoImageData=null;
    let shipEmissiveAtlas=null;
    let shipEmissiveImageData=null;
    const characterWindowWarm=new Float32Array(8);
    let boatMaterial=null;
    const boatLightDir=new THREE.Vector3(-0.46,0.58,0.67).normalize();
    let shipReady=false;

    const characterAtlases=new Map();
    let characterReady=false;
    let characterInitError='';

    // CLEAN CORE: shared finite lifecycle imported from core/asset-state.js.
    let rodAssetState=ASSET_STATE.UNLOADED;
    let fishingAssetState=ASSET_STATE.UNLOADED;

    const rodCastAtlases=new Map();
    // v9.9.9: the cast animation is allowed to run as soon as its DIFFUSE atlases exist.
    // Normal/AO/Height/Alpha are enhancement maps and can never block the visual action.
    let rodCastReady=false;          // diffuse animation ready
    let rodCastLightingReadyCount=0; // number of directions with all support maps ready
    let rodCastInitError='';
    let rodCastInitPromise=null;
    // One authoritative character action clock. Fishing state never advances CAST on its own.
    // The action is frozen to the boat direction captured on right-click and plays every source
    // frame exactly once. Completion is consumed only AFTER the final rendered frame.
    const rodCastPlayback={
      active:false,finishPending:false,time:0,frame:0,boatFrameIndex:0,key:'',mirror:false,
      duration:0,fps:10,frameCount:0,endHold:.10,serial:0,renderedFrames:new Set(),startedAt:0,
      releaseFrame:0,sfxPlayed:false,useSupportLighting:false
    };
    const characterLightDir=new THREE.Vector3(-0.28,-0.44,0.85).normalize();
    // Rod-cast support maps were authored from the same sprite source but have a slightly
    // brighter AO/height distribution than the standing character maps. Keeping a small
    // calibration gain here makes frame 0 join the standing sprite without a visible flash.
    const ROD_CAST_LIGHTING_GAIN=0.94;
    const CHARACTER_FPS_IDLE=5.0;
    const CHARACTER_FPS_MOVE=8.0;
    const characterWorkCanvas=document.createElement('canvas');
    const characterWorkCtx=characterWorkCanvas.getContext('2d',{alpha:true,willReadFrequently:true});
    const characterImageDataCache=new Map();
    let characterImageDataCacheHits=0;
    let characterImageDataCacheMisses=0;
    function acquireCharacterImageData(w,h){
      const key=`${w}x${h}`;
      let image=characterImageDataCache.get(key);
      if(!image){
        image=characterWorkCtx.createImageData(w,h);
        characterImageDataCache.set(key,image);
        characterImageDataCacheMisses++;
      }else{
        characterImageDataCacheHits++;
      }
      // createImageData() used to return a zeroed buffer every frame. Reusing it requires
      // clearing the previous pixels first to keep output byte-for-byte equivalent.
      image.data.fill(0);
      return image;
    }

    // Realtime pixel-normal lighting. Reflection data is prebuilt offline to keep startup cheap.
    const BOAT_LIGHTING={
      ambient:.54,
      diffuse:.56,
      aoStrength:.34,
      shadowStrength:.40,
      waterFill:.075,
      specular:.035,
      specPower:16.0,
      minFactor:.50,
      maxFactor:1.22,
      emissiveStrength:.50
    };

    function makeBoatTexture(img,isColor=false){
      const tex=new THREE.Texture(img);
      tex.needsUpdate=true;
      tex.minFilter=THREE.NearestFilter;
      tex.magFilter=THREE.NearestFilter;
      tex.generateMipmaps=false;
      tex.wrapS=THREE.ClampToEdgeWrapping;
      tex.wrapT=THREE.ClampToEdgeWrapping;
      tex.colorSpace=isColor?THREE.SRGBColorSpace:THREE.NoColorSpace;
      return tex;
    }

    function createRealtimeBoatMaterial(diffuseImg,normalImg,aoImg,heightImg,emissiveImg){
      const diffuseTex=makeBoatTexture(diffuseImg,true);
      const normalTex=makeBoatTexture(normalImg,false);
      const aoTex=makeBoatTexture(aoImg,false);
      const heightTex=makeBoatTexture(heightImg,false);
      const emissiveTex=makeBoatTexture(emissiveImg,true);
      return new THREE.ShaderMaterial({
        transparent:true,
        depthTest:false,
        depthWrite:false,
        toneMapped:true,
        uniforms:{
          tDiffuse:{value:diffuseTex},
          tNormal:{value:normalTex},
          tAO:{value:aoTex},
          tHeight:{value:heightTex},
          tEmissive:{value:emissiveTex},
          uEmissiveStrength:{value:BOAT_LIGHTING.emissiveStrength},
          uFrame:{value:4.0},
          uLightDir:{value:boatLightDir.clone()},
          uAmbient:{value:BOAT_LIGHTING.ambient},
          uDiffuseStrength:{value:BOAT_LIGHTING.diffuse},
          uAOStrength:{value:BOAT_LIGHTING.aoStrength},
          uShadowStrength:{value:BOAT_LIGHTING.shadowStrength},
          uWaterFill:{value:BOAT_LIGHTING.waterFill},
          uSpecular:{value:BOAT_LIGHTING.specular},
          uSpecPower:{value:BOAT_LIGHTING.specPower},
          uMinFactor:{value:BOAT_LIGHTING.minFactor},
          uMaxFactor:{value:BOAT_LIGHTING.maxFactor},
          uShadowSteps:{value:PERF.boatShadowSteps},
          uTime:{value:0},
          uCloudShadowMap:{value:cloudShadowFallback},
          uCloudShadowMatrix:{value:new THREE.Matrix4()},
          uCloudShadowCenter:{value:new THREE.Vector2(0,0)},
          uCloudShadowExtent:{value:40.0},
          uBoatBaseY:{value:0.0},
          uBoatHeightScale:{value:0.95}
        },
        vertexShader:`
          varying vec2 vUv;
          varying vec3 vBoatWorldPos;
          void main(){
            vUv=uv;
            vec4 world=modelMatrix*vec4(position,1.0);
            vBoatWorldPos=world.xyz;
            gl_Position=projectionMatrix*viewMatrix*world;
          }
        `,
        fragmentShader:`
          uniform sampler2D tDiffuse;
          uniform sampler2D tNormal;
          uniform sampler2D tAO;
          uniform sampler2D tHeight;
          uniform sampler2D tEmissive;
          uniform float uEmissiveStrength;
          uniform float uFrame;
          uniform vec3 uLightDir;
          uniform float uAmbient;
          uniform float uDiffuseStrength;
          uniform float uAOStrength;
          uniform float uShadowStrength;
          uniform float uWaterFill;
          uniform float uSpecular;
          uniform float uSpecPower;
          uniform float uMinFactor;
          uniform float uMaxFactor;
          uniform int uShadowSteps;
          uniform float uTime;
          uniform sampler2D uCloudShadowMap;
          uniform mat4 uCloudShadowMatrix;
          uniform vec2 uCloudShadowCenter;
          uniform float uCloudShadowExtent;
          uniform float uBoatBaseY;
          uniform float uBoatHeightScale;
          varying vec2 vUv;
          varying vec3 vBoatWorldPos;

          vec2 atlasUV(vec2 localUV){
            vec2 q=clamp(localUV,vec2(0.001),vec2(0.999));
            return vec2((uFrame+q.x)/8.0,q.y);
          }

          void main(){
            vec4 base=texture2D(tDiffuse,atlasUV(vUv));
            if(base.a<0.04) discard;
            // Camera occlusion is not calculated here at all. The final CloudPass renders the real
            // opaque paper cloud after BoatPass, so overlapping hull pixels are physically covered.
            vec3 N=texture2D(tNormal,atlasUV(vUv)).rgb*2.0-1.0;
            N=normalize(N+vec3(0.0001));
            float ao=texture2D(tAO,atlasUV(vUv)).r;
            float h0=texture2D(tHeight,atlasUV(vUv)).r;
            vec3 L=normalize(uLightDir);
            float ndl=max(dot(N,L),0.0);

            // Pixel self-shadow taps are selected by the active performance profile.
            vec2 shadowDir=normalize(vec2(L.x,L.y)+vec2(0.0001));
            float shadow=0.0;
            const float texel=1.0/170.0;
            for(int i=1;i<=6;i++){
              if(i>uShadowSteps) break;
              float fi=float(i);
              vec2 suv=vUv+shadowDir*texel*fi*1.35;
              if(suv.x<=0.002||suv.x>=0.998||suv.y<=0.002||suv.y>=0.998) continue;
              float hs=texture2D(tHeight,atlasUV(suv)).r;
              float blocker=step(h0+0.025*fi,hs);
              shadow=max(shadow,blocker*(1.0-fi/7.5));
            }

            // v8 world-space billboard: each fragment already has a true world XZ footprint.
            // Reuse the existing height map only for receiver height, then project into the SAME
            // moon-space cloud map as the ocean. No screen->ray reconstruction is needed anymore.
            vec3 receiverPos=vec3(vBoatWorldPos.x,uBoatBaseY+h0*uBoatHeightScale,vBoatWorldPos.z);
            vec4 cloudCoord=uCloudShadowMatrix*vec4(receiverPos,1.0);
            vec3 cloudNdc=cloudCoord.xyz/max(abs(cloudCoord.w),0.0001);
            vec2 shadowUv=cloudNdc.xy*0.5+0.5;
            float shadowInside=step(0.0,shadowUv.x)*step(shadowUv.x,1.0)*step(0.0,shadowUv.y)*step(shadowUv.y,1.0);
            float cloudShadowRaw=texture2D(uCloudShadowMap,clamp(shadowUv,0.0,1.0)).r*shadowInside;
            float cloudShadow=smoothstep(0.10,0.86,cloudShadowRaw);
            float directVisibility=1.0-cloudShadow*0.88;
            float ambientVisibility=1.0-cloudShadow*0.06;

            float occ=mix(1.0,ao,uAOStrength);
            float water=max(0.0,-N.y)*uWaterFill*(1.0-cloudShadow*0.10);
            float factor=(uAmbient*ambientVisibility+uDiffuseStrength*ndl*directVisibility+water)*occ;
            factor*=mix(1.0,1.0-uShadowStrength,shadow);
            factor=clamp(factor,uMinFactor,uMaxFactor);

            vec3 V=vec3(0.0,0.0,1.0);
            vec3 H=normalize(L+V);
            float spec=pow(max(dot(N,H),0.0),uSpecPower)*uSpecular*(0.45+0.55*ndl);
            spec*=directVisibility*directVisibility;
            vec3 moonTint=vec3(0.025,0.055,0.105)*ndl*directVisibility;
            vec3 col=base.rgb*factor+moonTint+vec3(spec);

            // Internal cabin/window light. #5293b9 is the authored glass core; the emissive atlas
            // expands only 1-2 source pixels onto the surrounding hull for a restrained warm spill.
            vec4 em=texture2D(tEmissive,atlasUV(vUv));
            float emMask=em.a;
            float emCore=smoothstep(0.72,0.98,emMask);
            float internalVisibility=1.0-cloudShadow*0.025;
            vec3 warmCore=em.rgb*(0.76+0.24*emCore);
            col=mix(col,warmCore,emCore*0.50);
            col+=em.rgb*emMask*uEmissiveStrength*internalVisibility;
            gl_FragColor=vec4(col,base.a);
          }
        `
      });
    }



    function getCharacterAssetDescriptor(dirName){
      if(!characterMeta)return null;
      if(characterMeta.assets?.[dirName]) return { key:dirName, meta:characterMeta.assets[dirName], mirror:false };
      const alias=characterMeta.aliases?.[dirName];
      if(alias && characterMeta.assets?.[alias.base]) return { key:alias.base, meta:characterMeta.assets[alias.base], mirror:!!alias.mirror };
      return null;
    }

    function getRodCastAssetDescriptor(dirName){
      if(!rodCastMeta)return null;
      if(rodCastMeta.assets?.[dirName])return {key:dirName,meta:rodCastMeta.assets[dirName],mirror:false};
      const alias=rodCastMeta.aliases?.[dirName];
      if(alias && rodCastMeta.assets?.[alias.base])return {key:alias.base,meta:rodCastMeta.assets[alias.base],mirror:!!alias.mirror};
      return null;
    }

    function getRodCastDescriptorForBoatFrame(frameIndex){
      const socket=characterMeta?.shipSockets?.[frameIndex];
      if(!socket)return null;
      const desc=getRodCastAssetDescriptor(socket.dir);
      if(!desc)return null;
      return {socket,desc,mirror:!!(socket.mirror||desc.mirror)};
    }

    function getRodCastDurationForBoatFrame(frameIndex){
      const resolved=getRodCastDescriptorForBoatFrame(frameIndex);
      const meta=resolved?.desc?.meta;
      if(!meta)return Number(rodCastMeta?.maxDuration)||1.40;
      const fps=Math.max(1,Number(meta.fps)||Number(rodCastMeta?.fps)||10);
      return (Math.max(1,Number(meta.frameCount)||1)/fps)+(Number(rodCastMeta?.endHold)||.10);
    }

    function startRodCastPlayback(frameIndex){
      if(!rodCastReady)return false;
      const resolved=getRodCastDescriptorForBoatFrame(frameIndex);
      if(!resolved)return false;
      const {desc,mirror}=resolved;
      const atlas=rodCastAtlases.get(desc.key);
      if(!atlas)return false;
      const meta=atlas.meta;
      const frameCount=Math.max(1,Number(meta.frameCount)||1);
      const fps=Math.max(1,Number(meta.fps)||Number(rodCastMeta?.fps)||10);
      rodCastPlayback.active=true;
      rodCastPlayback.finishPending=false;
      rodCastPlayback.time=0;
      rodCastPlayback.frame=0;
      rodCastPlayback.boatFrameIndex=frameIndex;
      rodCastPlayback.key=desc.key;
      rodCastPlayback.mirror=mirror;
      rodCastPlayback.fps=fps;
      rodCastPlayback.frameCount=frameCount;
      rodCastPlayback.endHold=Math.max(0,Number(rodCastMeta?.endHold)||.10);
      rodCastPlayback.duration=frameCount/fps+rodCastPlayback.endHold;
      rodCastPlayback.releaseFrame=Math.min(frameCount-1,Math.max(0,Number(meta.releaseFrame)||0));
      rodCastPlayback.sfxPlayed=false;
      // Freeze the lighting path for the whole cast. If the support maps finish loading in the
      // middle of an animation we do not switch render models mid-swing and create another pop.
      rodCastPlayback.useSupportLighting=!!atlas.lightingReady;
      rodCastPlayback.serial++;
      rodCastPlayback.startedAt=(typeof simTime==='number'?simTime:0);
      rodCastPlayback.renderedFrames.clear();
      rodCastPlayback.renderedFrames.add(0);
      pushFishingTrace('ROD_CAST_START',{
        boatFrame:frameIndex,key:desc.key,frameCount,fps,duration:rodCastPlayback.duration,
        supportLighting:rodCastPlayback.useSupportLighting
      });
      return true;
    }

    function stopRodCastPlayback(){
      rodCastPlayback.active=false;
      rodCastPlayback.finishPending=false;
      rodCastPlayback.time=0;
      rodCastPlayback.frame=0;
      rodCastPlayback.key='';
      rodCastPlayback.frameCount=0;
      rodCastPlayback.releaseFrame=0;
      rodCastPlayback.sfxPlayed=false;
      rodCastPlayback.useSupportLighting=false;
      rodCastPlayback.renderedFrames.clear();
    }

    function updateRodCastPlayback(dt){
      if(!rodCastPlayback.active)return;
      const atlas=rodCastAtlases.get(rodCastPlayback.key);
      const meta=atlas?.meta;
      if(!meta){
        console.error('[CosmicFishing] Active rod cast lost its atlas:',rodCastPlayback.key);
        rodCastPlayback.finishPending=true;
        return;
      }
      rodCastPlayback.time=Math.min(rodCastPlayback.duration,rodCastPlayback.time+Math.max(0,dt));
      const motionDuration=rodCastPlayback.frameCount/rodCastPlayback.fps;
      if(rodCastPlayback.time<motionDuration){
        rodCastPlayback.frame=Math.min(rodCastPlayback.frameCount-1,Math.floor(rodCastPlayback.time*rodCastPlayback.fps));
      }else{
        rodCastPlayback.frame=rodCastPlayback.frameCount-1;
      }
      rodCastPlayback.renderedFrames.add(rodCastPlayback.frame);
      if(!rodCastPlayback.sfxPlayed && rodCastPlayback.frame>=rodCastPlayback.releaseFrame){
        rodCastPlayback.sfxPlayed=true;
        playRodCastSfx();
      }
      if(rodCastPlayback.time>=rodCastPlayback.duration)rodCastPlayback.finishPending=true;
    }

    function finalizeRodCastPlaybackAfterRender(){
      if(!rodCastPlayback.active||!rodCastPlayback.finishPending)return;
      rodCastPlayback.active=false;
      rodCastPlayback.finishPending=false;

      const shown=rodCastPlayback.renderedFrames.size;
      const expected=rodCastPlayback.frameCount;
      if(shown<expected){
        console.warn(`[CosmicFishing] rod cast skipped source frames: ${shown}/${expected}`);
      }

      // Never silently swallow this transition. A stale/cached fishing-system.js used to
      // leave CAST open forever because optional chaining simply skipped completeCast().
      if(!fishingSystem || typeof fishingSystem.completeCast!=='function'){
        const message='Fishing pipeline mismatch: completeCast() is unavailable. Close any older local server and reload v9.9.14.4.';
        pushFishingTrace('CAST_COMPLETE_METHOD_MISSING',{shown,expected});
        showRuntimeError(message);
        console.error('[CosmicFishing]',message);
        return;
      }

      const before=fishingSystem.state;
      const ok=fishingSystem.completeCast();
      pushFishingTrace('CAST_COMPLETE',{
        ok,before,after:fishingSystem.state,shown,expected,biteWait:fishingSystem.biteWait
      });

      if(!ok || fishingSystem.state!=='WAIT_BITE'){
        const message=`Fishing pipeline blocked after CAST (${before} -> ${fishingSystem.state}).`;
        showRuntimeError(message);
        console.error('[CosmicFishing]',message);
      }
    }

    async function initCharacterAtlases(){
      if(!characterMeta){ characterReady=false; return; }
      try{
        const entries=Object.entries(characterMeta.assets||{});
        await Promise.all(entries.map(async ([key,meta])=>{
          const [diffuse,normal,ao,height]=await Promise.all([
            loadImageAsset(meta.diffuse),
            loadImageAsset(meta.normal),
            loadImageAsset(meta.ao),
            loadImageAsset(meta.height)
          ]);
          characterAtlases.set(key,{
            key,meta,diffuse,normal,ao,height,
            diffuseData:extractImageData(diffuse),
            normalData:extractImageData(normal),
            aoData:extractImageData(ao),
            heightData:extractImageData(height)
          });
        }));
        characterReady=characterAtlases.size>0;
        characterInitError='';
        if(characterReady) console.info('[CosmicFishing] boat character atlases ready:', characterAtlases.size);
      }catch(err){
        characterInitError=String(err?.message||err);
        console.warn('[CosmicFishing] character atlases disabled:',err);
        characterReady=false;
      }
    }

    async function initRodCastAtlases(){
      rodAssetState=ASSET_STATE.LOADING;
      if(!rodCastMeta){rodCastReady=false;rodAssetState=ASSET_STATE.FAILED;return false;}
      const entries=Object.entries(rodCastMeta.assets||{});
      if(!entries.length){rodCastReady=false;rodAssetState=ASSET_STATE.FAILED;return false;}

      // Phase A: diffuse-only. This is the only hard requirement for CAST playback.
      const diffuseResults=await Promise.allSettled(entries.map(async ([key,meta])=>{
        const diffuse=await loadImageAsset(meta.diffuse);
        rodCastAtlases.set(key,{
          key,meta,diffuse,
          diffuseData:extractImageData(diffuse),
          normal:null,ao:null,height:null,alpha:null,
          normalData:null,aoData:null,heightData:null,alphaData:null,
          lightingReady:false
        });
        return key;
      }));

      const diffuseFailures=diffuseResults
        .map((r,i)=>({r,key:entries[i][0]}))
        .filter(v=>v.r.status==='rejected');

      rodCastReady=rodCastAtlases.size>0;
      if(!rodCastReady){
        rodAssetState=ASSET_STATE.FAILED;
        rodCastInitError='All rod cast diffuse atlases failed to load.';
        console.error('[CosmicFishing] rod cast diffuse initialization failed:',diffuseFailures);
        return false;
      }
      rodAssetState=ASSET_STATE.VISUAL_READY;

      if(diffuseFailures.length){
        console.warn('[CosmicFishing] some rod cast directions have no diffuse atlas:',diffuseFailures);
      }
      console.info('[CosmicFishing] rod CAST VISUAL ready:',rodCastAtlases.size,'directions');

      // Phase B is intentionally fire-and-forget. A queued right-click must be released as soon
      // as the six authored DIFFUSE animations are usable; lighting maps may finish afterwards.
      Promise.allSettled(entries.map(async ([key,meta])=>{
        const atlas=rodCastAtlases.get(key);
        if(!atlas)return false;
        try{
          const [normal,ao,height,alpha]=await Promise.all([
            loadImageAsset(meta.normal),
            loadImageAsset(meta.ao),
            loadImageAsset(meta.height),
            loadImageAsset(meta.alpha)
          ]);
          atlas.normal=normal;atlas.ao=ao;atlas.height=height;atlas.alpha=alpha;
          atlas.normalData=extractImageData(normal);
          atlas.aoData=extractImageData(ao);
          atlas.heightData=extractImageData(height);
          atlas.alphaData=extractImageData(alpha);
          atlas.lightingReady=true;
          rodCastLightingReadyCount++;
          return true;
        }catch(err){
          atlas.lightingReady=false;
          console.warn(`[CosmicFishing] ${key} rod support maps disabled; diffuse CAST remains active:`,err);
          return false;
        }
      })).then(()=>{
        if(rodCastLightingReadyCount===rodCastAtlases.size){
          rodAssetState=ASSET_STATE.FULL_READY;
        }
        console.info('[CosmicFishing] rod lighting support:',rodCastLightingReadyCount,'/',rodCastAtlases.size);
      });

      rodCastInitError='';
      return true;
    }

    function sampleShipAo(frameIndex,localX,localY){
      if(!shipAoImageData)return 1.0;
      const data=shipAoImageData.data;
      const aw=shipAoImageData.width;
      const baseX=Math.round(frameIndex*SHIP_FRAME+localX);
      const baseY=Math.round(localY);
      let sum=0,count=0;
      for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
        const x=Math.max(0,Math.min(aw-1,baseX+ox));
        const y=Math.max(0,Math.min(shipAoImageData.height-1,baseY+oy));
        const idx=(y*aw+x)*4;
        const alpha=data[idx+3]/255;
        if(alpha<=0.01) continue;
        sum+=data[idx]/255; count++;
      }
      if(!count)return 1.0;
      return THREE.MathUtils.clamp((sum/count)*0.35+0.65,0.68,1.02);
    }

    function rebuildCharacterWindowWarm(){
      characterWindowWarm.fill(0);
      if(!shipEmissiveImageData||!characterMeta?.shipSockets)return;
      const data=shipEmissiveImageData.data;
      const aw=shipEmissiveImageData.width|0, ah=shipEmissiveImageData.height|0;
      for(let frameIndex=0;frameIndex<Math.min(8,characterMeta.shipSockets.length);frameIndex++){
        const socket=characterMeta.shipSockets[frameIndex];
        if(!socket||socket.hidden)continue;
        let total=0,weightTotal=0;
        const radius=31;
        for(let oy=-radius;oy<=radius;oy+=3)for(let ox=-radius;ox<=radius;ox+=3){
          const dist=Math.hypot(ox,oy);
          if(dist>radius)continue;
          const x=Math.round(frameIndex*SHIP_FRAME+socket.x+ox);
          const y=Math.round(socket.y+oy);
          if(x<0||x>=aw||y<0||y>=ah)continue;
          const p=(y*aw+x)*4;
          const mask=data[p+3]/255;
          if(mask<=0)continue;
          const w=1-dist/radius;
          total+=mask*w;weightTotal+=w;
        }
        characterWindowWarm[frameIndex]=THREE.MathUtils.clamp(total/Math.max(1.8,weightTotal)*4.4,0,1);
      }
    }

    function drawCharacterContactShadowWorld(socket,cloudShade,deckShade){
      const scale=characterMeta?.defaultScale||1;
      const rx=Math.max(3,(socket.shadowRx||10)*scale*0.50);
      const ry=Math.max(2,(socket.shadowRy||4)*scale*0.52);
      const cx=socket.x+(socket.shadowDx||0)*scale;
      const cy=socket.y+(socket.shadowDy||0)*scale;
      characterLayerCtx.save();
      characterLayerCtx.globalAlpha=THREE.MathUtils.clamp((0.21+deckShade*0.04)*(1-cloudShade*0.14),0.12,0.28);
      characterLayerCtx.fillStyle='rgba(7,16,30,0.95)';
      characterLayerCtx.beginPath();
      characterLayerCtx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
      characterLayerCtx.fill();
      characterLayerCtx.restore();
    }

    function drawFishingBiteAlertOnCharacterLayer(socket,t){
      if(!fishingSystem?.isBiteAlertVisible)return;
      const img=fishingSystem.alertImage;
      if(!img)return;
      // Same authored 170x170 plane as the frog: no independent Sprite transform,
      // no DPR/Ctrl+wheel separation and no separate render-order path.
      const pop=THREE.MathUtils.clamp(fishingSystem.stateTime/.10,0,1);
      const pulse=pop<1?(0.55+0.45*pop):1;
      const bob=(Math.sin(t*10)>.15)?-2:0;
      const size=Math.max(12,Math.round(16*pulse));
      const cx=Math.round(socket.x);
      const bottom=Math.round(socket.y-42+bob);
      const x=Math.round(cx-size*.5);
      const y=Math.round(bottom-size);
      characterLayerCtx.save();
      characterLayerCtx.imageSmoothingEnabled=false;
      characterLayerCtx.globalAlpha=1;
      characterLayerCtx.drawImage(img,x,y,size,size);
      characterLayerCtx.restore();
    }

    function renderCharacterPixelLighting(atlas,srcFrameX,cellW,cellH,mirror,deckShade,cloudShade,windowWarm,shadeGain=1){
      if(!atlas?.diffuseData?.data || !atlas?.normalData?.data || !atlas?.aoData?.data || !atlas?.heightData?.data){
        return false;
      }
      const diffuse=atlas.diffuseData.data;
      const normal=atlas.normalData.data;
      const ao=atlas.aoData.data;
      const height=atlas.heightData.data;
      const alphaMap=atlas.alphaData?.data||null;
      const atlasW=atlas.diffuseData.width|0;
      const outImage=acquireCharacterImageData(cellW,cellH);
      const out=outImage.data;
      const lx=characterLightDir.x,ly=characterLightDir.y,lz=characterLightDir.z;
      const ambientBase=0.49*deckShade*(1-cloudShade*0.22);
      const directBase=0.46*(1-cloudShade*0.18);
      const fillBase=0.05*(1-cloudShade*0.12);

      for(let y=0;y<cellH;y++)for(let x=0;x<cellW;x++){
        const sx=mirror?(cellW-1-x):x;
        const idx=((y*atlasW)+(srcFrameX+sx))*4;
        const alpha=alphaMap ? alphaMap[idx] : diffuse[idx+3];
        if(alpha===0)continue;

        let nx=normal[idx]/255*2-1;
        if(mirror)nx=-nx;
        const ny=normal[idx+1]/255*2-1;
        const nz=Math.max(0.001,normal[idx+2]/255*2-1);
        const ndl=Math.max(0,nx*lx+ny*ly+nz*lz);
        const aoF=(ao[idx]/255)*0.90+0.10;
        const hF=height[idx]/255;
        const shade=THREE.MathUtils.clamp(
          (ambientBase*aoF+directBase*(0.22+ndl*0.66)+fillBase*hF)*shadeGain,
          0.32,1.02
        );
        const o=(y*cellW+x)*4;
        const deckBlend=0.97+deckShade*0.03;
        const warm=windowWarm*(0.025+0.045*hF)*(1-cloudShade*0.05);
        out[o]=Math.min(255,Math.round(diffuse[idx]*shade*0.98*deckBlend+255*warm));
        out[o+1]=Math.min(255,Math.round(diffuse[idx+1]*shade*0.95*deckBlend+172*warm));
        out[o+2]=Math.min(255,Math.round(diffuse[idx+2]*(shade*(1-cloudShade*0.04))*0.98*deckBlend+68*warm));
        out[o+3]=alpha;
      }
      characterWorkCtx.clearRect(0,0,cellW,cellH);
      characterWorkCtx.putImageData(outImage,0,0);
      return true;
    }

    function renderCharacterLightingFallback(atlas,srcFrameX,cellW,cellH,mirror,deckShade,cloudShade,windowWarm){
      if(!atlas?.diffuseData?.data)return false;
      const diffuse=atlas.diffuseData.data;
      const atlasW=atlas.diffuseData.width|0;
      const outImage=acquireCharacterImageData(cellW,cellH);
      const out=outImage.data;
      // Conservative standing-character averages. This path is used only when an optional rod
      // normal/AO/height map failed to load, so CAST remains visible without reverting to the
      // full-bright raw diffuse path that caused the original flash.
      const aoF=0.84*0.90+0.10;
      const hF=0.44;
      const ndl=0.80;
      const ambientBase=0.49*deckShade*(1-cloudShade*0.22);
      const directBase=0.46*(1-cloudShade*0.18);
      const fillBase=0.05*(1-cloudShade*0.12);
      const shade=THREE.MathUtils.clamp(
        (ambientBase*aoF+directBase*(0.22+ndl*0.66)+fillBase*hF)*ROD_CAST_LIGHTING_GAIN,
        0.32,1.02
      );
      const deckBlend=0.97+deckShade*0.03;
      const warm=windowWarm*(0.025+0.045*hF)*(1-cloudShade*0.05);

      for(let y=0;y<cellH;y++)for(let x=0;x<cellW;x++){
        const sx=mirror?(cellW-1-x):x;
        const idx=((y*atlasW)+(srcFrameX+sx))*4;
        const alpha=diffuse[idx+3];
        if(alpha===0)continue;
        const o=(y*cellW+x)*4;
        out[o]=Math.min(255,Math.round(diffuse[idx]*shade*0.98*deckBlend+255*warm));
        out[o+1]=Math.min(255,Math.round(diffuse[idx+1]*shade*0.95*deckBlend+172*warm));
        out[o+2]=Math.min(255,Math.round(diffuse[idx+2]*(shade*(1-cloudShade*0.04))*0.98*deckBlend+68*warm));
        out[o+3]=alpha;
      }
      characterWorkCtx.clearRect(0,0,cellW,cellH);
      characterWorkCtx.putImageData(outImage,0,0);
      return true;
    }

    let characterLayerCacheKey='';
    let characterLayerRedrawCount=0;
    let characterLayerCacheSkipCount=0;
    let characterLayerUploadCount=0;

    function clearBoatCharacterLayer(){
      const hadVisible=characterMesh.visible||characterLayerCacheKey!=='';
      characterLayerCtx.setTransform(1,0,0,1,0,0);
      characterLayerCtx.clearRect(0,0,SHIP_FRAME,SHIP_FRAME);
      characterMesh.visible=false;
      characterLayerCacheKey='';
      if(hadVisible){
        characterLayerTexture.needsUpdate=true;
        characterLayerUploadCount++;
      }
    }

    function updateBoatCharacterWorldLayer(frameIndex,t,ratio,cloudShade){
      const casting=!!(rodCastPlayback.active && rodCastReady);
      const alerting=!!fishingSystem?.isBiteAlertVisible;

      if(!characterMeta?.shipSockets?.length || (!casting && !alerting && !characterReady)){
        clearBoatCharacterLayer();
        return;
      }

      // During CAST, direction/source/frame remain frozen at right-click time.
      const renderBoatFrame=casting?rodCastPlayback.boatFrameIndex:frameIndex;
      const socket=characterMeta.shipSockets[renderBoatFrame];
      if(!socket){
        clearBoatCharacterLayer();
        return;
      }

      // Some authored boat angles place the frog fully behind the cabin / hull silhouette.
      // In those frames the character itself should disappear so it feels occluded by the boat,
      // but the bite-alert icon may still float above that hidden actor when needed.
      if(socket.occludedByBoat){
        if(alerting && socket.occlusionMode!=='fully-hidden'){
          characterLayerCtx.setTransform(1,0,0,1,0,0);
          characterLayerCtx.clearRect(0,0,SHIP_FRAME,SHIP_FRAME);
          drawFishingBiteAlertOnCharacterLayer(socket,t);
          characterLayerTexture.needsUpdate=true;
          characterLayerUploadCount++;
          characterLayerRedrawCount++;
          characterMesh.visible=true;
          characterLayerCacheKey='';
        }else{
          clearBoatCharacterLayer();
        }
        return;
      }

      let desc=null,atlas=null,frame=0,mirror=false;
      if(casting){
        atlas=rodCastAtlases.get(rodCastPlayback.key);
        desc=atlas?{key:rodCastPlayback.key,meta:atlas.meta,mirror:rodCastPlayback.mirror}:null;
        mirror=rodCastPlayback.mirror;
        frame=rodCastPlayback.frame;
      }else{
        desc=getCharacterAssetDescriptor(socket.dir);
        atlas=desc?characterAtlases.get(desc.key):null;
        mirror=!!(socket.mirror||desc?.mirror);
        if(atlas){
          const animFps=ratio>0.05?CHARACTER_FPS_MOVE:CHARACTER_FPS_IDLE;
          frame=Math.floor(t*animFps)%Math.max(1,atlas.meta.frameCount||1);
        }
      }

      // Alert-only fallback remains dynamic because its 16px icon has a small timed pop/bob.
      if(!desc||!atlas){
        if(alerting){
          characterLayerCtx.setTransform(1,0,0,1,0,0);
          characterLayerCtx.clearRect(0,0,SHIP_FRAME,SHIP_FRAME);
          drawFishingBiteAlertOnCharacterLayer(socket,t);
          characterLayerTexture.needsUpdate=true;
          characterLayerUploadCount++;
          characterLayerRedrawCount++;
          characterMesh.visible=true;
          characterLayerCacheKey='';
          return;
        }
        clearBoatCharacterLayer();
        return;
      }

      const meta=atlas.meta;
      // CAST is frozen to renderBoatFrame, so its AO/window-light lookup must use the same frozen
      // boat frame too. Using the live frameIndex here could make lighting drift during the cast.
      const deckShade=sampleShipAo(renderBoatFrame,socket.x,socket.y);
      const windowWarm=characterWindowWarm[renderBoatFrame]||0;
      const cellW=meta.cellW|0,cellH=meta.cellH|0;

      // cloudSystem smoothly interpolates every render frame. Quantizing only the CACHE KEY to
      // 1/128 keeps the original lighting equation untouched while avoiding recomputation for
      // sub-pixel changes that cannot materially alter the final 8-bit sprite.
      const cloudShadeKey=Math.round(cloudShade*128);
      const deckShadeKey=Math.round(deckShade*255);
      const renderKey=alerting ? '' : [
        casting?'CAST':'IDLE',
        casting?(rodCastPlayback.useSupportLighting?'LIT':'SAFE'):'LIT',
        renderBoatFrame,desc.key,frame,mirror?1:0,
        cloudShadeKey,deckShadeKey,Math.round(windowWarm*255)
      ].join('|');

      if(!alerting && renderKey===characterLayerCacheKey && characterMesh.visible){
        characterLayerCacheSkipCount++;
        return;
      }

      characterLayerCtx.setTransform(1,0,0,1,0,0);
      characterLayerCtx.clearRect(0,0,SHIP_FRAME,SHIP_FRAME);
      characterMesh.visible=false;

      if(characterWorkCanvas.width!==cellW||characterWorkCanvas.height!==cellH){
        characterWorkCanvas.width=cellW;characterWorkCanvas.height=cellH;
      }

      const srcFrameX=frame*cellW;

      if(casting){
        // CAST now uses the same normal/AO/height lighting equation as the standing character.
        // Support-map readiness is frozen at cast start so an async load cannot change brightness
        // halfway through the swing. A shaded diffuse fallback preserves visibility on map failure.
        let rendered=false;
        if(rodCastPlayback.useSupportLighting){
          rendered=renderCharacterPixelLighting(
            atlas,srcFrameX,cellW,cellH,mirror,deckShade,cloudShade,windowWarm,
            ROD_CAST_LIGHTING_GAIN
          );
        }
        if(!rendered){
          rendered=renderCharacterLightingFallback(
            atlas,srcFrameX,cellW,cellH,mirror,deckShade,cloudShade,windowWarm
          );
        }
        if(!rendered){
          clearBoatCharacterLayer();
          return;
        }
      }else{
        // Standing/idle sprite keeps the exact v9.9.11 pixel-lighting equation via the shared path.
        if(!renderCharacterPixelLighting(
          atlas,srcFrameX,cellW,cellH,mirror,deckShade,cloudShade,windowWarm,1.0
        )){
          clearBoatCharacterLayer();
          return;
        }
      }

      drawCharacterContactShadowWorld(socket,cloudShade,deckShade);

      const drawScale=characterMeta.defaultScale||1;
      const castRoot=casting ? meta.rootPivot : null;
      const pivotX=castRoot?.x ?? meta.pivotX ?? cellW*.5;
      const pivotY=castRoot?.y ?? meta.pivotY ?? cellH*.75;
      const castOffsetY=casting?(Number(meta.frameOffsetY?.[frame])||0):0;
      const drawX=socket.x-pivotX*drawScale;
      const drawY=socket.y-pivotY*drawScale+castOffsetY*drawScale;
      characterLayerCtx.save();
      characterLayerCtx.imageSmoothingEnabled=false;
      characterLayerCtx.drawImage(characterWorkCanvas,drawX,drawY,cellW*drawScale,cellH*drawScale);
      characterLayerCtx.restore();

      // BITE_ALERT is intentionally not cacheable because the icon bobs/pops with t/stateTime.
      drawFishingBiteAlertOnCharacterLayer(socket,t);
      characterLayerTexture.needsUpdate=true;
      characterLayerUploadCount++;
      characterLayerRedrawCount++;
      characterMesh.visible=true;
      characterLayerCacheKey=alerting?'':renderKey;
    }

    async function initShipLightingAtlases(){
      try{
        // v8 has one authoritative world-space hull renderer. Diffuse + Normal + AO + Height are all required;
        // a missing support map is treated as an error instead of silently changing the lighting model.
        const required=await Promise.all([
          loadImageAsset(SHIP_ASSETS.diffuse),
          loadImageAsset(SHIP_ASSETS.normal),
          loadImageAsset(SHIP_ASSETS.ao),
          loadImageAsset(SHIP_ASSETS.height),
          loadImageAsset(SHIP_ASSETS.emissive)
        ]);
        const [diffuseImg,normalImg,aoImg,heightImg,emissiveImg]=required;
        shipDiffuseAtlas=diffuseImg;
        shipAoAtlas=aoImg;
        shipAoImageData=extractImageData(aoImg);
        shipEmissiveAtlas=emissiveImg;
        shipEmissiveImageData=extractImageData(emissiveImg);
        rebuildCharacterWindowWarm();

        // Reflection stays optional because it does not control hull lighting/occlusion.
        loadImageAsset(SHIP_ASSETS.reflection)
          .then(img=>{ shipReflectionAtlas=img; })
          .catch(err=>console.warn('[CosmicFishing] reflection disabled:',err));

        const litMaterial=createRealtimeBoatMaterial(diffuseImg,normalImg,aoImg,heightImg,emissiveImg);
        if(boatMesh.material) boatMesh.material.dispose();
        boatMaterial=litMaterial;
        boatMesh.material=boatMaterial;
        boatMesh.visible=true;
        shipReady=true;
        console.info('[CosmicFishing v9.8.6] realtime ship ready: Diffuse + Normal + AO + Height + Window Emissive + moon-space cloud shadow');
      }catch(err){
        shipReady=false;boatMesh.visible=false;
        showRuntimeError('Realtime ship initialization failed. Diffuse + Normal + AO + Height + Emissive are required.\n'+(err?.message||err));
        console.error('[CosmicFishing] required ship lighting assets failed:',err);
      }
    }
    initShipLightingAtlases();
    initCharacterAtlases();
    rodCastInitPromise=initRodCastAtlases().then(ok=>{
      pushFishingTrace(ok?'ROD_VISUAL_READY':'ROD_VISUAL_FAILED',{
        dirs:rodCastAtlases.size,lighting:rodCastLightingReadyCount,error:rodCastInitError||''
      });
      return ok;
    });

    let shipImageNo = 5;
    let shipScreenRoll = 0;
    let shipLastScreenX = 0, shipLastScreenY = 0, shipLastSize = 0;
    const shipProject = new THREE.Vector3();
    const wakeProject = new THREE.Vector3();

    // v8 unified world-space boat metrics. The square atlas plane is physically 1.95 world units,
    // calibrated to the previous ~190px appearance at the default 1700x900 camera while remaining
    // fully perspective-correct at every viewport/FOV/browser zoom.
    const BOAT_WORLD_SIZE=1.95;
    const BOAT_WORLD_HEIGHT=.92;
    const boatBillboardRight=new THREE.Vector3();
    const boatBillboardUp=new THREE.Vector3();
    const boatMoonWorldDir=new THREE.Vector3();
    const boatBillboardQuat=new THREE.Quaternion();
    const boatRollQuat=new THREE.Quaternion();
    const boatInverseQuat=new THREE.Quaternion();
    const boatLocalZAxis=new THREE.Vector3(0,0,1);
    const boatVisual={
      worldSize:BOAT_WORLD_SIZE,
      pixelsPerWorldCss:1,
      spritePixelScaleFx:1,
      screenXFx:0,screenYFx:0,
      screenSizeCss:0,
      fxOrigin:new THREE.Vector2(),
      fxBasisX:new THREE.Vector2(1,0),
      fxBasisY:new THREE.Vector2(0,1),
      fxAnchor:new THREE.Vector2()
    };
    const boatAtlasWorldTmp=new THREE.Vector3();
    const boatAtlasNdcTmp=new THREE.Vector3();
    const boatFxP00=new THREE.Vector2(),boatFxPX=new THREE.Vector2(),boatFxPY=new THREE.Vector2();

    function projectBoatAtlasPointToFx(px,py,w,h,out){
      boatAtlasWorldTmp.set(px/SHIP_FRAME-.5,.5-py/SHIP_FRAME,0);
      boatMesh.localToWorld(boatAtlasWorldTmp);
      boatAtlasNdcTmp.copy(boatAtlasWorldTmp).project(camera);
      out.set((boatAtlasNdcTmp.x*.5+.5)*w,(-boatAtlasNdcTmp.y*.5+.5)*h);
      return Number.isFinite(out.x)&&Number.isFinite(out.y)&&Number.isFinite(boatAtlasNdcTmp.z);
    }

    function updateBoatFxProjection(anchor,w,h){
      // The FX coordinate system is derived from the ACTUAL rendered boat plane, not viewport math.
      // This makes browser zoom/DPR/FOV/roll irrelevant: hull, reflection and wake share one projection.
      camera.updateMatrixWorld(true);
      boatMesh.updateMatrixWorld(true);
      projectBoatAtlasPointToFx(0,0,w,h,boatFxP00);
      projectBoatAtlasPointToFx(1,0,w,h,boatFxPX);
      projectBoatAtlasPointToFx(0,1,w,h,boatFxPY);
      boatVisual.fxOrigin.copy(boatFxP00);
      boatVisual.fxBasisX.copy(boatFxPX).sub(boatFxP00);
      boatVisual.fxBasisY.copy(boatFxPY).sub(boatFxP00);
      const sx=Math.hypot(boatVisual.fxBasisX.x,boatVisual.fxBasisX.y);
      const sy=Math.hypot(boatVisual.fxBasisY.x,boatVisual.fxBasisY.y);
      boatVisual.spritePixelScaleFx=(sx+sy)*.5;
      boatVisual.screenSizeCss=(boatVisual.spritePixelScaleFx*SHIP_FRAME)/Math.max(.0001,overlayScale);
      boatVisual.pixelsPerWorldCss=boatVisual.screenSizeCss/BOAT_WORLD_SIZE;
      boatVisual.fxAnchor.set(
        boatVisual.fxOrigin.x+boatVisual.fxBasisX.x*anchor.x+boatVisual.fxBasisY.x*anchor.y,
        boatVisual.fxOrigin.y+boatVisual.fxBasisX.y*anchor.x+boatVisual.fxBasisY.y*anchor.y
      );
      boatVisual.screenXFx=boatVisual.fxAnchor.x;
      boatVisual.screenYFx=boatVisual.fxAnchor.y;
      return boatVisual.fxAnchor;
    }

    function boatAtlasPointToFx(px,py,out){
      out.set(
        boatVisual.fxOrigin.x+boatVisual.fxBasisX.x*px+boatVisual.fxBasisY.x*py,
        boatVisual.fxOrigin.y+boatVisual.fxBasisX.y*px+boatVisual.fxBasisY.y*py
      );
      return out;
    }

    function updateBoatWorldBillboard(frameIndex,anchor){
      const roll=-shipScreenRoll;
      boatRollQuat.setFromAxisAngle(boatLocalZAxis,roll);
      boatBillboardQuat.copy(camera.quaternion).multiply(boatRollQuat);
      boatMesh.quaternion.copy(boatBillboardQuat);
      boatMesh.scale.set(BOAT_WORLD_SIZE,BOAT_WORLD_SIZE,1);

      // Keep the authored waterline anchor fixed in world space, including the tiny roll.
      boatBillboardRight.set(1,0,0).applyQuaternion(camera.quaternion);
      boatBillboardUp.set(0,1,0).applyQuaternion(camera.quaternion);
      const ox=(SHIP_FRAME*.5-anchor.x)/SHIP_FRAME*BOAT_WORLD_SIZE;
      const oy=(anchor.y-SHIP_FRAME*.5)/SHIP_FRAME*BOAT_WORLD_SIZE;
      const cs=Math.cos(roll),sn=Math.sin(roll);
      const rx=ox*cs-oy*sn,ry=ox*sn+oy*cs;
      boatMesh.position.copy(boatRoot.position)
        .addScaledVector(boatBillboardRight,rx)
        .addScaledVector(boatBillboardUp,ry);
      characterMesh.position.copy(boatMesh.position);
      characterMesh.quaternion.copy(boatMesh.quaternion);
      characterMesh.scale.copy(boatMesh.scale);

      // Transform the real moon vector into the billboard's tangent space used by the normal atlas.
      boatMoonWorldDir.copy(moon.position).sub(boatRoot.position).normalize();
      boatInverseQuat.copy(boatBillboardQuat).invert();
      boatLightDir.copy(boatMoonWorldDir).applyQuaternion(boatInverseQuat).normalize();

      // Exact FX scale is measured from this rendered plane by updateBoatFxProjection().
    }
    function resizeShipCanvas() {
      const vw=Math.max(1,viewportState.width),vh=Math.max(1,viewportState.height);
      overlayScale=Math.min(1,SHIP_FX_MAX_WIDTH/vw,SHIP_FX_MAX_HEIGHT/vh);
      const w=Math.max(1,Math.round(vw*overlayScale));
      const h=Math.max(1,Math.round(vh*overlayScale));
      if(shipFxCanvas.width!==w) shipFxCanvas.width=w;
      if(shipFxCanvas.height!==h) shipFxCanvas.height=h;
      shipFxCanvas.style.width=`${viewportState.width}px`;
      shipFxCanvas.style.height=`${viewportState.height}px`;
      fxCtx.setTransform(1,0,0,1,0,0);
      fxCtx.imageSmoothingEnabled=true;
      fxCtx.imageSmoothingQuality=IS_MOBILE_RENDER?'medium':'high';
    }
    resizeShipCanvas();

    // 3D 모델용 부드러운 타원 그림자는 제거.
    // 대신 updateShipCanvas()에서 배 반사와 스프라이트 자체의 명암으로 자연스럽게 연결한다.
    const boatShadowRoot = new THREE.Group();
    boatShadowRoot.visible = false;
    scene.add(boatShadowRoot);

    // 원본 파도 PNG 15장은 유지하되, 활성 개수/업데이트 주기는 성능 프로파일에 맞춘다.
    // 동일 type+frame을 InstancedMesh로 묶어 draw call을 최대 15개로 제한한다.
    // atlas 재샘플링 없이 원본 픽셀 그래픽을 그대로 사용한다.
    const waveSprites=new THREE.Group();waveSprites.renderOrder=2;scene.add(waveSprites);
    const waveTextureSets={small:[],medium:[],large:[]};
    function loadWaveTextureSet(prefix){const arr=[];for(let i=0;i<5;i++)arr.push(pixelTexture(`./IMG/${prefix}_${i}.png`,true));return arr;}
    waveTextureSets.small=loadWaveTextureSet('small');waveTextureSets.medium=loadWaveTextureSet('medium');waveTextureSets.large=loadWaveTextureSet('large');
    const WAVE_TYPES=['small','medium','large'];
    const waveConfig={baseDirection:worldWind.direction.clone(),spawnBox:{minX:-10,maxX:10,minZ:-10,maxZ:10},respawnPadding:4,frameRateMin:6,frameRateMax:8,types:{small:{count:PERF.waveCounts.small,scaleMin:1.3,scaleMax:2.0,speedMin:.38,speedMax:.66,opacityMin:.22,opacityMax:.38,lifeMin:4.5,lifeMax:7,fadeInMin:.8,fadeInMax:1.4,fadeOutMin:1.2,fadeOutMax:1.9},medium:{count:PERF.waveCounts.medium,scaleMin:2.2,scaleMax:3.4,speedMin:.28,speedMax:.50,opacityMin:.26,opacityMax:.42,lifeMin:6.5,lifeMax:10,fadeInMin:1,fadeInMax:1.8,fadeOutMin:1.5,fadeOutMax:2.4},large:{count:PERF.waveCounts.large,scaleMin:3.4,scaleMax:5.0,speedMin:.18,speedMax:.34,opacityMin:.32,opacityMax:.50,lifeMin:9,lifeMax:14,fadeInMin:1.4,fadeInMax:2.3,fadeOutMin:2,fadeOutMax:3.2}}};
    const wavePerp=new THREE.Vector2(-waveConfig.baseDirection.y,waveConfig.baseDirection.x);
    const waveBaseAngle=Math.atan2(waveConfig.baseDirection.y,waveConfig.baseDirection.x);
    const rand=(min,max)=>min+Math.random()*(max-min);
    function smooth01(x){const tt=THREE.MathUtils.clamp(x,0,1);return tt*tt*(3-2*tt);}
    function createWaveBatchMaterial(texture){
      const mat=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:1,depthWrite:false,depthTest:true,alphaTest:.04,side:THREE.FrontSide});
      mat.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader
          .replace('#include <common>',`#include <common>
attribute float instanceOpacity;
varying float vInstanceOpacity;`)
          .replace('#include <begin_vertex>',`#include <begin_vertex>
vInstanceOpacity = instanceOpacity;`);
        shader.fragmentShader=shader.fragmentShader
          .replace('#include <common>',`#include <common>
varying float vInstanceOpacity;`)
          .replace('vec4 diffuseColor = vec4( diffuse, opacity );','vec4 diffuseColor = vec4( diffuse, opacity * vInstanceOpacity );');
      };
      mat.customProgramCacheKey=()=> 'cosmic-wave-instance-opacity-v1';
      return mat;
    }
    const waveBatches={small:[],medium:[],large:[]};
    for(const type of WAVE_TYPES){const cap=waveConfig.types[type].count;for(let frame=0;frame<5;frame++){const geo=new THREE.PlaneGeometry(1,1),alphaAttr=new THREE.InstancedBufferAttribute(new Float32Array(cap),1);alphaAttr.setUsage(THREE.DynamicDrawUsage);geo.setAttribute('instanceOpacity',alphaAttr);const mesh=new THREE.InstancedMesh(geo,createWaveBatchMaterial(waveTextureSets[type][frame]),cap);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.renderOrder=2;mesh.frustumCulled=false;waveSprites.add(mesh);waveBatches[type].push({mesh,alphaAttr,count:0});}}
    const waveSpritesData=[],waveDummy=new THREE.Object3D();
    let waveUpdateCarry=0;
    function randomSpawnPosition(out,ahead=false){
      const b=waveConfig.spawnBox,dir=waveConfig.baseDirection,perp=wavePerp;
      if(!ahead){
        if(Math.random()<.62){const radius=rand(1.3,6.2),angle=Math.random()*Math.PI*2;return out.set(boatRoot.position.x+Math.cos(angle)*radius,0,boatRoot.position.z+Math.sin(angle)*radius);}
        return out.set(boatRoot.position.x+rand(b.minX,b.maxX),0,boatRoot.position.z+rand(b.minZ,b.maxZ));
      }
      const along=rand(-5,5),across=rand(-7.5,7.5);
      return out.set(boatRoot.position.x-dir.x*11+perp.x*across+dir.x*along,0,boatRoot.position.z-dir.y*11+perp.y*across+dir.y*along);
    }
    function resetWaveSprite(s,time=0,ahead=false){const cfg=waveConfig.types[s.type];randomSpawnPosition(s.position,ahead);s.age=0;s.life=rand(cfg.lifeMin,cfg.lifeMax);s.fadeIn=rand(cfg.fadeInMin,cfg.fadeInMax);s.fadeOut=rand(cfg.fadeOutMin,cfg.fadeOutMax);s.maxOpacity=rand(cfg.opacityMin,cfg.opacityMax);s.speed=rand(cfg.speedMin,cfg.speedMax);s.scale=rand(cfg.scaleMin,cfg.scaleMax);s.frameRate=rand(waveConfig.frameRateMin,waveConfig.frameRateMax);s.frameOffset=Math.random()*5;s.swayPhase=Math.random()*Math.PI*2;s.swayAmp=rand(.10,.40);s.noiseDrift=rand(.18,.42);s.verticalOffset=rand(.028,.05);s.rotationOffset=rand(-.18,.18);s.scalePulse=rand(.03,.09);s.rotationSpeed=rand(.08,.22);s.position.y=oceanWaveHeight(s.position.x,s.position.z,time)+s.verticalOffset;}
    function createWaveSprite(type){const s={type,position:new THREE.Vector3()};resetWaveSprite(s,0,false);s.age=Math.random()*s.life;waveSpritesData.push(s);}
    for(const type of WAVE_TYPES)for(let i=0;i<waveConfig.types[type].count;i++)createWaveSprite(type);
    function updateWaveSprites(t,dt){
      waveUpdateCarry+=dt;
      const updateStep=1/PERF.waveHz;
      if(waveUpdateCarry<updateStep)return;
      const simDt=Math.min(waveUpdateCarry,.05);waveUpdateCarry=0;
      for(const type of WAVE_TYPES)for(const batch of waveBatches[type])batch.count=0;
      const dir=waveConfig.baseDirection,perp=wavePerp,baseAngle=waveBaseAngle;
      for(const s of waveSpritesData){s.age+=simDt;if(s.age>=s.life){resetWaveSprite(s,t,true);continue;}let alpha=1;if(s.age<s.fadeIn)alpha=smooth01(s.age/s.fadeIn);else if(s.age>s.life-s.fadeOut)alpha=1-smooth01((s.age-(s.life-s.fadeOut))/s.fadeOut);const forward=s.speed*simDt,sideways=Math.sin(t*s.noiseDrift+s.swayPhase)*s.swayAmp*simDt;s.position.x+=dir.x*forward+perp.x*sideways;s.position.z+=dir.y*forward+perp.y*sideways;const dx=s.position.x-boatRoot.position.x,dz=s.position.z-boatRoot.position.z,lim=14;if(dx>lim)s.position.x-=lim*2;else if(dx<-lim)s.position.x+=lim*2;if(dz>lim)s.position.z-=lim*2;else if(dz<-lim)s.position.z+=lim*2;s.position.y=oceanWaveHeight(s.position.x,s.position.z,t)+s.verticalOffset+Math.sin(t*1.7+s.swayPhase)*.01;const rotation=baseAngle+s.rotationOffset+Math.sin(t*s.rotationSpeed+s.swayPhase)*.08,pulse=1+Math.sin(t*1.8+s.swayPhase)*s.scalePulse,frame=Math.floor((t*s.frameRate+s.frameOffset)%5),batch=waveBatches[s.type][frame],idx=batch.count++;waveDummy.position.copy(s.position);waveDummy.rotation.set(-Math.PI/2,0,rotation);waveDummy.scale.setScalar(s.scale*pulse);waveDummy.updateMatrix();batch.mesh.setMatrixAt(idx,waveDummy.matrix);batch.alphaAttr.setX(idx,s.maxOpacity*alpha);}
      for(const type of WAVE_TYPES)for(const batch of waveBatches[type]){batch.mesh.count=batch.count;if(batch.count>0){batch.mesh.instanceMatrix.needsUpdate=true;batch.alphaAttr.needsUpdate=true;}}
    }

    // Wake v9.7.1: one authoritative stern socket drives BOTH attached foam and world particles.
    // The socket is authored in the 170x170 sprite, transformed to screen space, then ray-cast
    // onto the ocean plane. No separate boatRoot + "back" world offset remains.
    const wakeConfig={
      maxPixels:Math.max(PERF.wakeMax,Math.round(PERF.wakeMax*1.45)),
      spawnDistance:PERF.wakeSpawnDistance*.72,
      minSpeedToSpawn:.035,
      contactCount:Math.max(2,Math.round(PERF.wakeContact*1.55)),
      centerCount:Math.max(2,Math.round(PERF.wakeCenter*1.30)),
      sideCount:Math.max(2,Math.round(PERF.wakeSide*1.35)),
      foamCount:Math.max(2,Math.round(PERF.wakeFoam*1.50)),
      coreLift:.0115,
      centerLifeMin:.18,centerLifeMax:.36,
      sideLifeMin:.28,sideLifeMax:.52,
      foamLifeMin:.08,foamLifeMax:.18,
      contactLifeMin:.08,contactLifeMax:.14,
      backSpeedMin:.03,backSpeedMax:.22,
      spreadMin:.014,spreadMax:.095,
      sideAngle:Math.PI/8.4
    };
    const wakePixels=[],activeWakePixels=[],freeWakePixels=[],wakeSpawn={initialized:false,lastPos:new THREE.Vector3(),carry:0};
    for(let i=0;i<wakeConfig.maxPixels;i++){
      const q={active:false,_activeIndex:-1,type:'center',position:new THREE.Vector3(),velocity:new THREE.Vector3(),age:0,life:1,verticalOffset:.02};
      wakePixels.push(q);freeWakePixels.push(q);
    }
    function getWakeSlot(){
      if(freeWakePixels.length)return freeWakePixels.pop();
      let weakest=activeWakePixels[0],score=Infinity;
      for(const q of activeWakePixels){const remain=1-q.age/Math.max(.0001,q.life);if(remain<score){score=remain;weakest=q;}}
      return weakest;
    }
    function activateWake(type,pos,vel,life,vo){
      const q=getWakeSlot();
      if(!q.active){q.active=true;q._activeIndex=activeWakePixels.length;activeWakePixels.push(q);}
      q.type=type;q.age=0;q.life=life;q.verticalOffset=vo;q.position.copy(pos);q.velocity.copy(vel);
    }
    function retireWakeAt(i){
      const q=activeWakePixels[i],last=activeWakePixels.pop();
      if(i<activeWakePixels.length){activeWakePixels[i]=last;last._activeIndex=i;}
      q.active=false;q._activeIndex=-1;freeWakePixels.push(q);
    }

    // Per-frame stern WATER segment in source sprite pixels.
    // left/right are deliberately slightly inside the hull; the existing diffuse-alpha hull mask
    // clips the first pixels, so the visible foam begins exactly at the hull boundary with no gap.
    // outX/outY is the screen-space direction away from the stern.
    const wakeSternSegments=[
      // The endpoints sit just INSIDE the stern silhouette. eraseFxInsideHull clips the hidden part,
      // making the first visible foam pixel emerge directly from the hull edge instead of floating away.
            {lx:58,ly:91, rx:113, ry:91, outX: 0.000,outY:-1.000}, // frame 0 front/far stern
      {lx:18,ly:84, rx:38, ry:68, outX:-0.707,outY:-0.707}, // frame 1 upper-left stern deck
      {lx:8,ly:106, rx:8, ry:82, outX:-1.000,outY: 0.000}, // frame 2 left transom
      {lx:22,ly:116, rx:40, ry:132, outX:-0.707,outY: 0.707}, // frame 3 lower-left stern
      {lx:67,ly:128, rx:103, ry:128, outX: 0.000,outY: 1.000}, // frame 4 rear/near stern transom
      {lx:128,ly:132, rx:145, ry:116, outX: 0.707,outY: 0.707}, // frame 5 lower-right stern
      {lx:151,ly:82, rx:151, ry:106, outX: 1.000,outY: 0.000}, // frame 6 right transom
      {lx:134,ly:68, rx:154, ry:84, outX: 0.707,outY:-0.707}  // frame 7 upper-right stern deck
    ];
    function getWakeSternSegment(frameIndex){return wakeSternSegments[frameIndex]||wakeSternSegments[0];}

    const wakeSocket={
      initialized:false,valid:false,frameIndex:-1,
      left:new THREE.Vector3(),right:new THREE.Vector3(),center:new THREE.Vector3(),outPoint:new THREE.Vector3(),
      targetLeft:new THREE.Vector3(),targetRight:new THREE.Vector3(),targetCenter:new THREE.Vector3(),targetOutPoint:new THREE.Vector3(),
      out:new THREE.Vector3(0,0,1),side:new THREE.Vector3(1,0,0),width:.12,
      screenLeft:new THREE.Vector2(),screenRight:new THREE.Vector2(),screenCenter:new THREE.Vector2(),screenOut:new THREE.Vector2()
    };
    const wakeSocketRaycaster=new THREE.Raycaster();
    const wakeSocketNdc=new THREE.Vector2();
    const wakeSocketPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    const wakeSocketTmpA=new THREE.Vector3(),wakeSocketTmpB=new THREE.Vector3();
    const wakeScreenTmpL=new THREE.Vector2(),wakeScreenTmpR=new THREE.Vector2(),wakeScreenTmpC=new THREE.Vector2(),wakeScreenTmpO=new THREE.Vector2();
    const wakePos=new THREE.Vector3(),wakeVel=new THREE.Vector3();

    function fxScreenToOceanWorld(x,y,logicalW,logicalH,planeY,out){
      if(logicalW<=0||logicalH<=0)return false;
      wakeSocketNdc.set((x/logicalW)*2-1,-(y/logicalH)*2+1);
      wakeSocketRaycaster.setFromCamera(wakeSocketNdc,camera);
      wakeSocketPlane.constant=-planeY;
      const hit=wakeSocketRaycaster.ray.intersectPlane(wakeSocketPlane,out);
      return !!hit&&Number.isFinite(out.x)&&Number.isFinite(out.z);
    }
    function projectWakeWorldToFx(v,logicalW,logicalH,out2){
      wakeSocketTmpA.copy(v).project(camera);
      out2.set((wakeSocketTmpA.x*.5+.5)*logicalW,(-wakeSocketTmpA.y*.5+.5)*logicalH);
      return Number.isFinite(out2.x)&&Number.isFinite(out2.y)&&Number.isFinite(wakeSocketTmpA.z);
    }
    function updateWakeSocket(t,dt){
      if(!shipReady){wakeSocket.valid=false;return;}
      const w=shipFxCanvas.width,h=shipFxCanvas.height;
      if(w<=1||h<=1){wakeSocket.valid=false;return;}
      const frameIndex=shipImageNo-1;
      const anchor=shipAnchors[frameIndex]||{x:85,y:148};
      updateBoatWorldBillboard(frameIndex,anchor);
      updateBoatFxProjection(anchor,w,h);
      const seg=getWakeSternSegment(frameIndex);
      const leftS=boatAtlasPointToFx(seg.lx,seg.ly,wakeScreenTmpL);
      const rightS=boatAtlasPointToFx(seg.rx,seg.ry,wakeScreenTmpR);
      const centerS=wakeScreenTmpC.copy(leftS).add(rightS).multiplyScalar(.5);
      // Only ~1 source pixel outside the authored stern; hull masking supplies the safety margin.
      const outGapSource=1.0;
      const outS=boatAtlasPointToFx((seg.lx+seg.rx)*.5+seg.outX*outGapSource,(seg.ly+seg.ry)*.5+seg.outY*outGapSource,wakeScreenTmpO);
      const planeY=oceanWaveHeight(boatMotion.position.x,boatMotion.position.z,t)+.012;
      if(!fxScreenToOceanWorld(leftS.x,leftS.y,w,h,planeY,wakeSocket.targetLeft) ||
         !fxScreenToOceanWorld(rightS.x,rightS.y,w,h,planeY,wakeSocket.targetRight) ||
         !fxScreenToOceanWorld(centerS.x,centerS.y,w,h,planeY,wakeSocket.targetCenter) ||
         !fxScreenToOceanWorld(outS.x,outS.y,w,h,planeY,wakeSocket.targetOutPoint)){
        wakeSocket.valid=false;return;
      }
      if(!wakeSocket.initialized){
        wakeSocket.left.copy(wakeSocket.targetLeft);wakeSocket.right.copy(wakeSocket.targetRight);
        wakeSocket.center.copy(wakeSocket.targetCenter);wakeSocket.outPoint.copy(wakeSocket.targetOutPoint);
        wakeSocket.initialized=true;
      }else{
        // ~40-55 ms settling removes the 8-direction sprite-frame jump without trailing behind the boat.
        const a=1-Math.exp(-24*dt);
        wakeSocket.left.lerp(wakeSocket.targetLeft,a);wakeSocket.right.lerp(wakeSocket.targetRight,a);
        wakeSocket.center.lerp(wakeSocket.targetCenter,a);wakeSocket.outPoint.lerp(wakeSocket.targetOutPoint,a);
      }
      wakeSocket.out.copy(wakeSocket.outPoint).sub(wakeSocket.center);wakeSocket.out.y=0;
      if(wakeSocket.out.lengthSq()<1e-7){
        // Fallback only; normally the ray-cast out point always defines the direction.
        const y=boatMotion.visualYaw;wakeSocket.out.set(Math.sin(y),0,Math.cos(y));
      }else wakeSocket.out.normalize();
      wakeSocket.side.copy(wakeSocket.right).sub(wakeSocket.left);wakeSocket.side.y=0;
      wakeSocket.width=Math.max(.02,wakeSocket.side.length());
      if(wakeSocket.side.lengthSq()<1e-7)wakeSocket.side.set(wakeSocket.out.z,0,-wakeSocket.out.x);
      else wakeSocket.side.normalize();
      wakeSocket.frameIndex=frameIndex;wakeSocket.valid=true;
      projectWakeWorldToFx(wakeSocket.left,w,h,wakeSocket.screenLeft);
      projectWakeWorldToFx(wakeSocket.right,w,h,wakeSocket.screenRight);
      projectWakeWorldToFx(wakeSocket.center,w,h,wakeSocket.screenCenter);
      projectWakeWorldToFx(wakeSocket.outPoint,w,h,wakeSocket.screenOut);
    }
    function wakePointOnSegment(out,t01,outward=0){
      out.copy(wakeSocket.left).lerp(wakeSocket.right,THREE.MathUtils.clamp(t01,0,1));
      if(outward)out.addScaledVector(wakeSocket.out,outward);
      return out;
    }
    function spawnWake(speedRatio){
      if(!wakeSocket.valid)return;
      const width=wakeSocket.width;
      const intensity=smooth01(THREE.MathUtils.clamp((speedRatio-.035)/.58,0,1));
      // Contact foam across the entire stern segment.
      for(let i=0;i<wakeConfig.contactCount;i++){
        wakePointOnSegment(wakePos,Math.random(),rand(.002,.016));
        wakeVel.copy(wakeSocket.out).multiplyScalar(rand(.012,.045)*(.45+speedRatio*.35))
          .addScaledVector(wakeSocket.side,rand(-.018,.018));
        activateWake('contact',wakePos,wakeVel,rand(wakeConfig.contactLifeMin,wakeConfig.contactLifeMax),wakeConfig.coreLift+rand(.012,.022));
      }
      // Dense center trail originates from the middle 42% of the same segment.
      for(let i=0;i<wakeConfig.centerCount;i++){
        wakePointOnSegment(wakePos,rand(.29,.71),rand(.004,.022));
        wakeVel.copy(wakeSocket.out).multiplyScalar(rand(wakeConfig.backSpeedMin,wakeConfig.backSpeedMax)*(.34+speedRatio*.48))
          .addScaledVector(wakeSocket.side,rand(-.024,.024));
        activateWake('center',wakePos,wakeVel,rand(wakeConfig.centerLifeMin,wakeConfig.centerLifeMax),wakeConfig.coreLift+rand(0,.010));
      }
      // Side spray starts from the actual two stern corners, giving wide side sprites a naturally wider V.
      for(let side=-1;side<=1;side+=2)for(let i=0;i<wakeConfig.sideCount;i++){
        const endpoint=side<0?wakeSocket.left:wakeSocket.right;
        wakePos.copy(endpoint).addScaledVector(wakeSocket.out,rand(.006,.022));
        wakeVel.copy(wakeSocket.out).multiplyScalar(rand(.045,.17)*(.34+speedRatio*.42));
        wakeVel.addScaledVector(wakeSocket.side,side*rand(wakeConfig.spreadMin,wakeConfig.spreadMax)*(.42+speedRatio*.58));
        activateWake('side',wakePos,wakeVel,rand(wakeConfig.sideLifeMin,wakeConfig.sideLifeMax),wakeConfig.coreLift+rand(.003,.013));
      }
      for(let i=0;i<wakeConfig.foamCount;i++){
        wakePointOnSegment(wakePos,rand(.10,.90),rand(.004,.020));
        wakeVel.copy(wakeSocket.out).multiplyScalar(rand(.018,.065)*(.34+speedRatio*.34))
          .addScaledVector(wakeSocket.side,rand(-Math.max(.02,width*.14),Math.max(.02,width*.14)));
        activateWake('foam',wakePos,wakeVel,rand(wakeConfig.foamLifeMin,wakeConfig.foamLifeMax),wakeConfig.coreLift+rand(.004,.018));
      }
    }
    function updateWake(t,dt){
      const speed=boatMotion.velocity.length(),ratio=THREE.MathUtils.clamp(speed/boatMotion.maxSpeed,0,1);
      if(!wakeSpawn.initialized){wakeSpawn.lastPos.copy(boatRoot.position);wakeSpawn.initialized=true;}
      const moved=Math.hypot(boatRoot.position.x-wakeSpawn.lastPos.x,boatRoot.position.z-wakeSpawn.lastPos.z);
      wakeSpawn.carry+=moved;wakeSpawn.lastPos.copy(boatRoot.position);
      if(ratio>wakeConfig.minSpeedToSpawn&&wakeSocket.valid){
        while(wakeSpawn.carry>=wakeConfig.spawnDistance){wakeSpawn.carry-=wakeConfig.spawnDistance;spawnWake(ratio);}
      }else wakeSpawn.carry=Math.min(wakeSpawn.carry,wakeConfig.spawnDistance*.5);
      for(let i=activeWakePixels.length-1;i>=0;i--){
        const q=activeWakePixels[i];q.age+=dt;
        if(q.age>=q.life){retireWakeAt(i);continue;}
        q.position.addScaledVector(q.velocity,dt);
        q.velocity.multiplyScalar(Math.exp(-(q.type==='center'?1.75:q.type==='side'?1.20:2.15)*dt));
      }
    }

    // === Click / Tap to Move ===
    // Keyboard movement is intentionally removed. A pointer position is projected onto
    // the ocean plane and becomes the boat's world-space destination.
    const boatMotion={position:new THREE.Vector3(),velocity:new THREE.Vector3(),heading:0,visualYaw:0,acceleration:4.2,brakeAcceleration:6.2,maxSpeed:2.8,turnSpeed:3.2,arrivalRadius:.14,slowRadius:2.15};
    const moveState={active:false,target:new THREE.Vector3()};
    const moveRaycaster=new THREE.Raycaster();
    const movePointerNdc=new THREE.Vector2();
    const moveOceanPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    const moveHit=new THREE.Vector3();
    const moveToTarget=new THREE.Vector3();
    const moveDesiredVelocity=new THREE.Vector3();
    const moveVelocityDelta=new THREE.Vector3();
    const moveAfterTarget=new THREE.Vector3();

    renderer.domElement.style.cursor='crosshair';
    renderer.domElement.style.touchAction='none';

    function setMoveTargetFromClient(clientX,clientY){
      const rect=renderer.domElement.getBoundingClientRect();
      if(rect.width<=0||rect.height<=0) return false;
      movePointerNdc.set(
        ((clientX-rect.left)/rect.width)*2-1,
        -((clientY-rect.top)/rect.height)*2+1
      );
      moveRaycaster.setFromCamera(movePointerNdc,camera);
      if(!moveRaycaster.ray.intersectPlane(moveOceanPlane,moveHit)) return false;
      // Infinite mathematical ocean plane: no gameplay bounds/clamp.
      moveState.target.set(moveHit.x,0,moveHit.z);
      moveState.active=true;
      return true;
    }

    let fishingSystem=null;
    let fishingInitPromise=null;
    let pendingFishingCast=false;
    let pendingFishingCastRetryArmed=false;

    // Fishing input contract (v9.9.9)
    // Mouse: LEFT = move/minigame hold, RIGHT = cast/hook.
    // Touch fallback: tap = move/minigame hold, long-press = cast, tap ! = hook.
    const fishingControlPointer={id:-1,down:false};
    const touchFishingPointer={
      id:-1,down:false,startX:0,startY:0,moved:false,longTriggered:false,timer:0
    };
    const TOUCH_FISH_LONG_PRESS_MS=460;
    const TOUCH_FISH_LONG_PRESS_MOVE_PX=10;

    function boatIsStationaryForFishing(){
      return !moveState.active && boatMotion.velocity.lengthSq()<0.0025;
    }
    function stopBoatForFishing(){
      moveState.active=false;
      boatMotion.velocity.set(0,0,0);
      // Fishing is a stationary action. Freeze the residual sprite turn as well so the 8-direction
      // hull/character sector cannot switch halfway through a cast.
      boatMotion.heading=boatMotion.visualYaw;
    }
    function clearTouchFishingLongPress(){
      if(touchFishingPointer.timer){
        clearTimeout(touchFishingPointer.timer);
        touchFishingPointer.timer=0;
      }
    }
    function schedulePendingFishingCast(reason='loading'){
      pendingFishingCast=true;
      pushFishingTrace('CAST_QUEUED',{reason,rodReady:rodCastReady,fishingReady:!!fishingSystem?.ready});

      // v9.9.9 could recursively requeue itself forever if either loader resolved to failure.
      // That creates an endless microtask loop and makes the browser tab appear frozen immediately
      // after right-click. Arm exactly ONE retry for the current loader generation instead.
      if(pendingFishingCastRetryArmed)return;
      pendingFishingCastRetryArmed=true;

      const waits=[];
      if(rodCastInitPromise)waits.push(Promise.resolve(rodCastInitPromise));
      if(fishingInitPromise)waits.push(Promise.resolve(fishingInitPromise));

      Promise.allSettled(waits).then(()=>{
        pendingFishingCastRetryArmed=false;
        if(!pendingFishingCast)return;

        if(!rodCastReady || !fishingSystem?.ready){
          const detail=`rod=${rodCastReady?'ready':'failed'}, fishing=${fishingSystem?.ready?'ready':'failed'}`;
          pendingFishingCast=false;
          pushFishingTrace('CAST_LOAD_FAILED',{detail,rodError:rodCastInitError||'',fishingError:fishingSystem?.initError||''});
          showRuntimeError(`Fishing assets are not ready (${detail}).\nRod: ${rodCastInitError||'no diffuse atlas'}\nFishing: ${fishingSystem?.initError||'minigame PNG load failed'}`);
          return;
        }

        pendingFishingCast=false;
        // One finite retry only. No self-scheduling loop is permitted here.
        beginFishingAction('assets-ready');
      });
    }

    function beginFishingAction(source='right-click'){
      // Before the fish bites, a second right-click is a deliberate cast cancel.
      // This covers both the visible throw and the WAIT_BITE period after the float lands.
      if(fishingSystem?.state==='CAST' || fishingSystem?.state==='WAIT_BITE'){
        const before=fishingSystem.state;
        pendingFishingCast=false;
        stopRodCastPlayback();
        stopRodCastSfxImmediate();
        stopFishingReelAudioImmediate();
        const ok=(typeof fishingSystem.cancelBeforeBite==='function')
          ? fishingSystem.cancelBeforeBite()
          : (fishingSystem.cancel(), fishingSystem.state==='IDLE');
        pushFishingTrace('CAST_CANCEL_INPUT',{source,before,after:fishingSystem.state,ok});
        return ok;
      }

      // If the first click is still waiting for assets, the next right-click cancels the queued cast.
      if(pendingFishingCast && (!fishingSystem?.state || fishingSystem.state==='IDLE')){
        pendingFishingCast=false;
        stopRodCastSfxImmediate();
        pushFishingTrace('CAST_QUEUE_CANCEL_INPUT',{source});
        return true;
      }

      // Once the bite alert is visible the same button keeps its existing hook action.
      if(fishingSystem?.state==='BITE_ALERT'){
        const ok=fishingSystem.confirmBite();
        pushFishingTrace('HOOK_INPUT',{source,ok});
        return ok;
      }

      // MINIGAME / RESULT cannot be cancelled by the cast button.
      if(fishingSystem?.state && fishingSystem.state!=='IDLE'){
        pushFishingTrace('CAST_INPUT_IGNORED',{source,state:fishingSystem.state});
        return false;
      }

      // Right-click is authoritative: stop residual movement first instead of silently rejecting
      // a cast because velocity/moveState is a few hundredths above an invisible threshold.
      stopBoatForFishing();
      boatMotion.heading=boatMotion.visualYaw;
      updateShipDirection();

      if(!rodCastReady || !fishingSystem?.ready){
        schedulePendingFishingCast(!rodCastReady?'rod-loading':'fishing-loading');
        return true;
      }

      const castFrameIndex=shipImageNo-1;
      if(!startRodCastPlayback(castFrameIndex)){
        pushFishingTrace('CAST_VISUAL_START_FAILED',{source,castFrameIndex,rodReady:rodCastReady});
        showRuntimeError('Rod CAST visual failed to start. The fishing action was not advanced.');
        return false;
      }

      if(!fishingSystem.beginFishing()){
        stopRodCastPlayback();
        pushFishingTrace('CAST_LOGIC_START_FAILED',{source,state:fishingSystem.state});
        showRuntimeError('Fishing CAST logic failed to start.');
        return false;
      }

      pendingFishingCast=false;
      pushFishingTrace('CAST_INPUT_ACCEPTED',{source,castFrameIndex,key:rodCastPlayback.key});
      return true;
    }

    if(window.CosmicFishingSystem){
      fishingSystem=new window.CosmicFishingSystem(THREE,{
        boatScene,boatMesh,characterMeta,
        alertRenderMode:'character-layer',
        getFrameIndex:()=>shipImageNo-1,
        isBoatStationary:boatIsStationaryForFishing,
        isPointerHeld:()=>fishingControlPointer.down,
        stopBoat:stopBoatForFishing,
        onStateChange:(state,detail={})=>{
          pushFishingTrace('STATE_'+state,{...detail});
          if(state==='BITE_ALERT')playFishBiteSfx();
          if(state==='MINIGAME')playFishHookSfx();
          if(state==='IDLE')stopRodCastPlayback();
        },
        onSuccess:()=>{
          playFishCompleteSfx();
          pushFishingTrace('RESULT_COMPLETE');
          console.info('[CosmicFishing] Fishing minigame COMPLETE');
          // Online ranking is intentionally isolated from the fishing state machine.
          // A failed DB request never blocks result animation, controls, or the next cast.
          if(window.CosmicOnline && typeof window.CosmicOnline.submitCatch==='function'){
            Promise.resolve(window.CosmicOnline.submitCatch()).catch(err=>{
              console.error('[CosmicFishing] online catch submission failed:',err);
            });
          }
        },
        onMiss:()=>{
          playFishEscapeSfx();
          pushFishingTrace('RESULT_ESCAPE');
          console.info('[CosmicFishing] Fishing minigame MISS');
        }
      });
      fishingAssetState=ASSET_STATE.LOADING;
      fishingInitPromise=fishingSystem.init().then(ok=>{
        fishingAssetState=ok?ASSET_STATE.READY:ASSET_STATE.FAILED;
        pushFishingTrace(ok?'FISHING_ASSETS_READY':'FISHING_ASSETS_FAILED',{error:fishingSystem.initError||''});
        return ok;
      }).catch(err=>{
        fishingAssetState=ASSET_STATE.FAILED;
        throw err;
      });
    }

    // Diagnostic-only path. START_CAST_TEST.bat uses this to prove that the animation renderer works
    // without depending on mouse input. Normal gameplay never enables this parameter.
    if(CAST_TEST_MODE){
      Promise.allSettled([Promise.resolve(rodCastInitPromise),Promise.resolve(fishingInitPromise)])
        .then(()=>setTimeout(()=>beginFishingAction('auto-cast-test'),700));
    }

    function onGamePointerDown(e){
      if(!e.isPrimary && e.pointerType!=='touch')return;
      unlockAudio();

      // Right mouse button is dedicated to fishing and never creates a move target.
      if(e.pointerType==='mouse' && e.button===2){
        e.preventDefault();
        beginFishingAction('canvas-right');
        return;
      }
      if(e.pointerType==='mouse' && e.button!==0)return;

      e.preventDefault();

      // Primary press controls the green bar only after the minigame has started.
      if(fishingSystem?.state==='MINIGAME'){
        fishingControlPointer.id=e.pointerId;
        fishingControlPointer.down=true;
        fishingSystem.setHeld(true);
        try{renderer.domElement.setPointerCapture(e.pointerId);}catch(_err){}
        return;
      }

      // While fishing is active, primary mouse cannot move the boat.
      // Touch can tap the visible ! because it has no right mouse button.
      if(fishingSystem?.isActive){
        if(e.pointerType==='touch' && fishingSystem.state==='BITE_ALERT'){
          fishingSystem.confirmBite();
        }
        return;
      }

      // Mobile-only fallback: long press while stopped casts the line.
      if(e.pointerType==='touch' && boatIsStationaryForFishing() && fishingSystem?.ready){
        clearTouchFishingLongPress();
        touchFishingPointer.id=e.pointerId;
        touchFishingPointer.down=true;
        touchFishingPointer.startX=e.clientX;
        touchFishingPointer.startY=e.clientY;
        touchFishingPointer.moved=false;
        touchFishingPointer.longTriggered=false;
        try{renderer.domElement.setPointerCapture(e.pointerId);}catch(_err){}
        touchFishingPointer.timer=setTimeout(()=>{
          touchFishingPointer.timer=0;
          if(!touchFishingPointer.down||touchFishingPointer.moved||fishingSystem?.isActive)return;
          if(!boatIsStationaryForFishing())return;
          touchFishingPointer.longTriggered=!!beginFishingAction('touch-long');
        },TOUCH_FISH_LONG_PRESS_MS);
        return;
      }

      // Left mouse / normal touch = movement only.
      setMoveTargetFromClient(e.clientX,e.clientY);
    }

    function onGamePointerMove(e){
      if(e.pointerType!=='touch')return;
      if(!touchFishingPointer.down||e.pointerId!==touchFishingPointer.id)return;
      const d=Math.hypot(e.clientX-touchFishingPointer.startX,e.clientY-touchFishingPointer.startY);
      if(d>TOUCH_FISH_LONG_PRESS_MOVE_PX){
        touchFishingPointer.moved=true;
        clearTouchFishingLongPress();
      }
    }

    function onGamePointerUp(e){
      if(fishingControlPointer.down && e.pointerId===fishingControlPointer.id){
        fishingControlPointer.down=false;
        fishingControlPointer.id=-1;
        fishingSystem?.setHeld(false);
      }

      if(e.pointerType==='touch' && touchFishingPointer.down && e.pointerId===touchFishingPointer.id){
        clearTouchFishingLongPress();
        const shouldMove=!touchFishingPointer.longTriggered && !fishingSystem?.isActive;
        touchFishingPointer.down=false;
        touchFishingPointer.id=-1;
        if(shouldMove)setMoveTargetFromClient(e.clientX,e.clientY);
      }
    }

    function onGamePointerCancel(e){
      if(fishingControlPointer.down && e.pointerId===fishingControlPointer.id){
        fishingControlPointer.down=false;
        fishingControlPointer.id=-1;
        fishingSystem?.setHeld(false);
      }
      if(e.pointerType==='touch' && touchFishingPointer.down && e.pointerId===touchFishingPointer.id){
        clearTouchFishingLongPress();
        touchFishingPointer.down=false;
        touchFishingPointer.id=-1;
      }
    }

    // CLEAN CORE: event registration/deduplication is isolated from fishing gameplay logic.
    const fishingInputRouter=installFishingInputRouter({
      rendererElement:renderer.domElement,
      beginFishingAction,
      onGamePointerDown,
      onGamePointerMove,
      onGamePointerUp,
      onGamePointerCancel,
      debounceMs:180
    });


    function rebaseFloatingOrigin(dx,dz){
      if(Math.abs(dx)<1e-7&&Math.abs(dz)<1e-7)return;
      worldState.originX+=dx; worldState.originZ+=dz; worldState.rebaseCount++;
      boatMotion.position.x-=dx; boatMotion.position.z-=dz;
      if(moveState.active){moveState.target.x-=dx;moveState.target.z-=dz;}
      for(const s of waveSpritesData){s.position.x-=dx;s.position.z-=dz;}
      for(const q of activeWakePixels){q.position.x-=dx;q.position.z-=dz;}
      if(wakeSocket.initialized){
        for(const v of [wakeSocket.left,wakeSocket.right,wakeSocket.center,wakeSocket.outPoint,wakeSocket.targetLeft,wakeSocket.targetRight,wakeSocket.targetCenter,wakeSocket.targetOutPoint]){v.x-=dx;v.z-=dz;}
      }
      if(wakeSpawn.initialized){wakeSpawn.lastPos.x-=dx;wakeSpawn.lastPos.z-=dz;}
      camera.position.x-=dx;camera.position.z-=dz;
      boatRoot.position.x-=dx;boatRoot.position.z-=dz;
      cloudSystem?.onRebase(dx,dz);
      windSystem?.onRebase(dx,dz);
      syncOceanWorldOffset();
    }
    function maybeRebaseFloatingOrigin(){
      if(Math.abs(boatMotion.position.x)<worldState.rebaseThreshold&&Math.abs(boatMotion.position.z)<worldState.rebaseThreshold)return;
      rebaseFloatingOrigin(boatMotion.position.x,boatMotion.position.z);
    }

    function updateBoatMovement(dt){
      if(fishingSystem?.locksBoatMovement()){
        moveState.active=false;
        boatMotion.velocity.set(0,0,0);
        maybeRebaseFloatingOrigin();
        const yd=Math.atan2(Math.sin(boatMotion.heading-boatMotion.visualYaw),Math.cos(boatMotion.heading-boatMotion.visualYaw));
        boatMotion.visualYaw+=yd*(1-Math.pow(.02,dt));
        return;
      }
      if(moveState.active){
        moveToTarget.set(
          moveState.target.x-boatMotion.position.x,
          0,
          moveState.target.z-boatMotion.position.z
        );
        const distance=moveToTarget.length();

        if(distance<=boatMotion.arrivalRadius){
          boatMotion.position.x=moveState.target.x;
          boatMotion.position.z=moveState.target.z;
          boatMotion.velocity.set(0,0,0);
          moveState.active=false;
        }else{
          moveToTarget.multiplyScalar(1/distance);

          // Physically safe arrival speed: farther targets use full speed, while the
          // last part of the route automatically brakes instead of overshooting.
          const brakingDistance=Math.max(0,distance-boatMotion.arrivalRadius);
          const brakingSpeed=Math.sqrt(2*boatMotion.brakeAcceleration*brakingDistance);
          const distanceEase=THREE.MathUtils.clamp(distance/boatMotion.slowRadius,.18,1);
          const desiredSpeed=Math.min(boatMotion.maxSpeed,brakingSpeed,boatMotion.maxSpeed*distanceEase);
          moveDesiredVelocity.copy(moveToTarget).multiplyScalar(desiredSpeed);
          moveVelocityDelta.copy(moveDesiredVelocity).sub(boatMotion.velocity);
          const accel=desiredSpeed<boatMotion.velocity.length()?boatMotion.brakeAcceleration:boatMotion.acceleration;
          const maxDelta=accel*dt;
          if(moveVelocityDelta.lengthSq()>maxDelta*maxDelta) moveVelocityDelta.setLength(maxDelta);
          boatMotion.velocity.add(moveVelocityDelta);

          const targetHeading=Math.atan2(-moveToTarget.x,-moveToTarget.z);
          const headingDelta=Math.atan2(Math.sin(targetHeading-boatMotion.heading),Math.cos(targetHeading-boatMotion.heading));
          boatMotion.heading+=headingDelta*Math.min(1,boatMotion.turnSpeed*dt);

          const beforeX=moveToTarget.x*distance;
          const beforeZ=moveToTarget.z*distance;
          boatMotion.position.addScaledVector(boatMotion.velocity,dt);
          moveAfterTarget.set(
            moveState.target.x-boatMotion.position.x,
            0,
            moveState.target.z-boatMotion.position.z
          );
          // If a high-speed frame crosses the destination, snap cleanly instead of
          // orbiting around the clicked point.
          if(beforeX*moveAfterTarget.x+beforeZ*moveAfterTarget.z<=0 || moveAfterTarget.lengthSq()<=boatMotion.arrivalRadius*boatMotion.arrivalRadius){
            boatMotion.position.x=moveState.target.x;
            boatMotion.position.z=moveState.target.z;
            boatMotion.velocity.set(0,0,0);
            moveState.active=false;
          }
        }
      }else{
        // Normally arrival already stops at zero, but this damps any residual motion
        // left by an interrupted pointer event or future external movement code.
        boatMotion.velocity.multiplyScalar(Math.exp(-5.5*dt));
        if(boatMotion.velocity.lengthSq()<.0004) boatMotion.velocity.set(0,0,0);
        boatMotion.position.addScaledVector(boatMotion.velocity,dt);
      }

      maybeRebaseFloatingOrigin();
      const yd=Math.atan2(Math.sin(boatMotion.heading-boatMotion.visualYaw),Math.cos(boatMotion.heading-boatMotion.visualYaw));
      boatMotion.visualYaw+=yd*(1-Math.pow(.02,dt));
    }

    let shipSector = 0;
    const sectorToImage = [5,6,7,8,1,2,3,4];
    function normalizeDeg(d){return((d%360)+360)%360;}
    function shortestDeg(a,b){return((a-b+540)%360)-180;}
    function updateShipDirection(){
      const deg=normalizeDeg(THREE.MathUtils.radToDeg(boatMotion.visualYaw));
      const currentCenter=shipSector*45;
      if(Math.abs(shortestDeg(deg,currentCenter))>27.5) shipSector=Math.round(deg/45)%8;
      shipImageNo=sectorToImage[shipSector];
    }

    function updateBoat(t,dt){
      updateBoatMovement(dt); const speed=boatMotion.velocity.length(),ratio=speed/boatMotion.maxSpeed;
      const waveY=oceanWaveHeight(boatMotion.position.x,boatMotion.position.z,t);
      // 픽셀 스프라이트는 과한 bob/roll에서 종이처럼 보여서 원본보다 작게 제한한다.
      const microBob=Math.sin(t*.95)*.012+Math.cos(t*.52)*.007;
      boatRoot.position.set(boatMotion.position.x,waveY+.055+microBob,boatMotion.position.z);
      const roll=Math.sin(t*.68)*.0045+boatMotion.velocity.x*.0014;
      shipScreenRoll=THREE.MathUtils.clamp(-roll,-0.0085,0.0085); // 약 +/-0.49도
      updateShipDirection();


      const sin=Math.sin(boatMotion.visualYaw), cos=Math.cos(boatMotion.visualYaw);
      // 보이지 않는 랜턴 앵커: 3D 랜턴 모델 없이 원본 Ocean warm reflection만 유지.
      lanternWorldPos.set(boatMotion.position.x + .42*cos + .06*sin, waveY+.58, boatMotion.position.z - .42*sin + .06*cos);
      oceanUniforms.uLanternPos.value.copy(lanternWorldPos); oceanUniforms.uLanternIntensity.value=0.0;
    }

    function updateEndlessSkyAnchor(){
      // Keep celestial elements around the local render bubble forever.
      stars.position.x=boatRoot.position.x;stars.position.z=boatRoot.position.z;
      moon.position.x=boatRoot.position.x-8;moon.position.z=boatRoot.position.z-18;
      moonGlow.position.copy(moon.position);
    }

    function drawAttachedSternWake(ratio,cloudShade=0){
      if(ratio<=.035||!wakeSocket.valid)return;
      const speedGate=smooth01(THREE.MathUtils.clamp((ratio-.035)/.30,0,1));
      if(speedGate<=.001)return;
      const cx=wakeSocket.screenCenter.x,cy=wakeSocket.screenCenter.y;
      const lx=wakeSocket.screenLeft.x,ly=wakeSocket.screenLeft.y;
      const rx=wakeSocket.screenRight.x,ry=wakeSocket.screenRight.y;
      let dirX=wakeSocket.screenOut.x-cx,dirY=wakeSocket.screenOut.y-cy;
      const dl=Math.hypot(dirX,dirY);if(dl<.001){dirX=0;dirY=1;}else{dirX/=dl;dirY/=dl;}
      const px=Math.max(2,Math.round((1.70+ratio*.55)*overlayScale));
      const wakeLight=1-cloudShade*.12;
      const alphaA=((.17+ratio*.20)*speedGate*wakeLight).toFixed(3);
      const alphaB=((.12+ratio*.15)*speedGate*wakeLight).toFixed(3);
      // Two contact patches originate at the SAME smoothed stern corners used by world particles.
      fxCtx.fillStyle=`rgba(220,238,247,${alphaA})`;
      fxCtx.fillRect(Math.round(lx+dirX*px*.25-px*.5),Math.round(ly+dirY*px*.25-px*.5),px,px);
      fxCtx.fillRect(Math.round(rx+dirX*px*.25-px*.5),Math.round(ry+dirY*px*.25-px*.5),px,px);
      // Short bridge only covers the sub-particle gap; the world wake continues from the same socket.
      fxCtx.fillStyle=`rgba(176,214,235,${alphaB})`;
      for(let i=1;i<=3;i++){
        const step=px*(.55+i*.72);
        fxCtx.fillRect(Math.round(cx+dirX*step-px*.5),Math.round(cy+dirY*step-px*.5),px,px);
      }
    }

    function eraseFxInsideHull(frameIndex,anchor,scale,sx,sy){
      if(!shipDiffuseAtlas)return;
      const padFx=Math.max(1,Math.round(1.25*overlayScale));
      const padSrc=padFx/Math.max(.0001,scale);
      const bx=boatVisual.fxBasisX,by=boatVisual.fxBasisY,o=boatVisual.fxOrigin;
      fxCtx.save();
      fxCtx.globalCompositeOperation='destination-out';
      fxCtx.globalAlpha=1;
      fxCtx.imageSmoothingEnabled=false;
      // Map source atlas pixels through the ACTUAL rendered world-plane basis including screen roll.
      fxCtx.setTransform(bx.x,bx.y,by.x,by.y,o.x,o.y);
      const offsets=[[0,0],[padSrc,0],[-padSrc,0],[0,padSrc],[0,-padSrc]];
      for(const [ox,oy] of offsets){
        fxCtx.drawImage(shipDiffuseAtlas,frameIndex*SHIP_FRAME,0,SHIP_FRAME,SHIP_FRAME,
          ox,oy,SHIP_FRAME,SHIP_FRAME);
      }
      fxCtx.restore();
    }

    function drawPixelWake(t, logicalW, logicalH){
      for(const p of activeWakePixels){
        const life01=THREE.MathUtils.clamp(1-p.age/Math.max(.001,p.life),0,1);
        if(life01<=0) continue;
        const wy=oceanWaveHeight(p.position.x,p.position.z,t)+p.verticalOffset;
        wakeProject.set(p.position.x,wy,p.position.z).project(camera);
        if(!Number.isFinite(wakeProject.x)||!Number.isFinite(wakeProject.y)||wakeProject.z<-1.2||wakeProject.z>1.2) continue;
        const x=Math.round((wakeProject.x*.5+.5)*logicalW);
        const y=Math.round((-wakeProject.y*.5+.5)*logicalH);
        if(x<-8||x>logicalW+8||y<-8||y>logicalH+8) continue;
        const fade=smooth01(life01), px=Math.max(2,Math.round(2.0*overlayScale));
        if(p.type==='contact'){
          fxCtx.fillStyle=`rgba(218,236,246,${(fade*.38).toFixed(3)})`;
          fxCtx.fillRect(x-px*2,y-px*.5,px*4,px*2);
        }else if(p.type==='foam'){
          fxCtx.fillStyle=`rgba(210,232,244,${(fade*.32).toFixed(3)})`;
          fxCtx.fillRect(x-px,y-px*.5,px*3,px*2);
        }else if(p.type==='side'){
          fxCtx.fillStyle=`rgba(154,197,222,${(fade*.24).toFixed(3)})`;
          fxCtx.fillRect(x-px,y-px*.5,px*3,px*2);
        }else{
          fxCtx.fillStyle=`rgba(124,168,202,${(fade*.20).toFixed(3)})`;
          fxCtx.fillRect(x-px*.5,y-px,px*2,px*3);
        }
      }
    }

    function drawShipReflection(frameIndex, anchor, scale, t, ratio, cloudShade=0){
      const source=shipReflectionAtlas;
      if(!source)return;
      const waterline=shipWaterlines[frameIndex];
      const prof=reflectionProfiles[frameIndex];
      let minY=SHIP_FRAME,maxY=0;
      for(const y of waterline){ if(y>=0){minY=Math.min(minY,y);maxY=Math.max(maxY,y);} }
      if(minY>maxY)return;
      const drawX=-anchor.x*scale;
      const drawY=-anchor.y*scale;
      const strip=PERF.reflectionStrip;
      fxCtx.save();
      // 사전 생성된 반사 atlas는 선체 접수선에 맞춰져 있다.
      // 아래쪽으로 갈수록 수평 흔들림만 조금 증가시켜 물결 느낌을 만든다.
      for(let sy=minY,idx=0;sy<REFLECTION_H;sy+=strip,idx++){
        const sh=Math.min(strip,REFLECTION_H-sy);
        const depth=Math.max(0,(sy-minY)/(REFLECTION_H-minY));
        const wave=(Math.sin(t*2.0+idx*.31+frameIndex*.67)+Math.sin(t*.77+idx*.13)*.45);
        const wobble=wave*(.18+depth*1.65)*prof.wobble*overlayScale*(.72+ratio*.40);
        const fade=1-depth*.28;
        fxCtx.globalAlpha=Math.max(.55,fade)*(1-cloudShade*.28);
        fxCtx.drawImage(source,frameIndex*SHIP_FRAME,sy,SHIP_FRAME,sh,
          drawX+wobble,drawY+sy*scale,SHIP_FRAME*scale,Math.max(1.2,sh*scale+0.65));
      }
      fxCtx.restore();
    }

    function drawWindowLightReflection(frameIndex,anchor,scale,t,cloudShade=0){
      if(!shipEmissiveAtlas)return;
      const prof=reflectionProfiles[frameIndex];
      const srcStep=4;
      const compression=Math.max(.25,prof.compression*.76);
      fxCtx.save();
      fxCtx.globalCompositeOperation='lighter';
      fxCtx.imageSmoothingEnabled=false;
      for(let sy=0,idx=0;sy<Math.min(SHIP_FRAME,Math.ceil(anchor.y));sy+=srcStep,idx++){
        const sh=Math.min(srcStep,Math.ceil(anchor.y)-sy);
        const depth=Math.max(0,anchor.y-(sy+sh*.5));
        const dy=depth*scale*compression+1.8*overlayScale;
        const wave=(Math.sin(t*1.85+idx*.42+frameIndex*.73)+Math.sin(t*.71+idx*.19)*.35);
        const wobble=wave*(.12+depth/SHIP_FRAME*.85)*prof.wobble*overlayScale;
        const fade=Math.exp(-depth/70);
        fxCtx.globalAlpha=(.045+.040*fade)*(1-cloudShade*.04);
        fxCtx.drawImage(shipEmissiveAtlas,frameIndex*SHIP_FRAME,sy,SHIP_FRAME,sh,
          -anchor.x*scale+wobble,dy,SHIP_FRAME*scale,Math.max(1,sh*scale*compression));
      }
      fxCtx.restore();
    }

    function drawWaterContact(frameIndex, anchor, scale, t, ratio, cloudShade=0){
      const waterline=shipWaterlines[frameIndex];
      const b=shipBounds[frameIndex];
      fxCtx.save();
      // 기존 수평 접촉선 대신 실제 선체 하단 contour를 따라 짧은 픽셀을 배치한다.
      // 대각선에서도 배와 물의 접점이 동일한 기울기를 가져 떠 보이지 않는다.
      const step=PERF.contactStep;
      for(let x=Math.max(0,b.minX);x<=Math.min(SHIP_FRAME-1,b.maxX);x+=step){
        const y=waterline[x];
        if(y<0)continue;
        const px=(x-anchor.x)*scale;
        const py=(y-anchor.y)*scale;
        const phase=(Math.floor(t*5.0)+x+frameIndex*3)%12;
        fxCtx.globalAlpha=.19;
        fxCtx.fillStyle='rgba(5,15,29,.92)';
        fxCtx.fillRect(px,py,Math.max(1.5,2.5*scale),Math.max(1,1.05*overlayScale));
        if(phase<3){
          fxCtx.globalAlpha=(.25+ratio*.045)*(1-cloudShade*.08);
          fxCtx.fillStyle='rgba(170,216,237,.72)';
          fxCtx.fillRect(px+(phase-1)*.5*overlayScale,py+1.1*overlayScale,Math.max(1.2,1.8*scale),Math.max(1,overlayScale));
        }
      }
      fxCtx.restore();
    }

    function updateShipCanvas(t){
      const w=shipFxCanvas.width,h=shipFxCanvas.height;
      fxCtx.clearRect(0,0,w,h);
      if(!shipReady){
        if(debugMode)debugPanel.textContent=`SHIP: LOADING\nPROFILE: ${PERF.tier}\nDPR: ${viewportState.dpr.toFixed(2)}\nTARGET: ${PERF.targetFps} FPS`;
        return;
      }

      // 반사/항적은 off-screen FX canvas에 그리고, 배 본체는 WebGL world-space pass에서 그린다.
      drawPixelWake(t,w,h);

      const frameIndex=shipImageNo-1;
      const anchor=shipAnchors[frameIndex]||{x:85,y:148};
      updateBoatWorldBillboard(frameIndex,anchor);
      updateBoatFxProjection(anchor,w,h);
      let sx=boatVisual.screenXFx,sy=boatVisual.screenYFx;
      const projectionOk=Number.isFinite(sx)&&Number.isFinite(sy);
      if(!projectionOk){sx=w*.5;sy=h*.57;}
      const scale=boatVisual.spritePixelScaleFx;
      const ratio=THREE.MathUtils.clamp(boatMotion.velocity.length()/boatMotion.maxSpeed,0,1);
      const cloudShade=cloudSystem?.getBoatShade?.()||0;

      // Draw all below-hull FX first. The exact diffuse alpha then punches the hull out of the FX
      // texture, so stale world wake / reflection / attached foam can never paint over the boat.
      fxCtx.save();
      fxCtx.translate(sx,sy);
      drawShipReflection(frameIndex,anchor,scale,t,ratio,cloudShade);
      drawWindowLightReflection(frameIndex,anchor,scale,t,cloudShade);
      fxCtx.restore();
      drawAttachedSternWake(ratio,cloudShade);
      eraseFxInsideHull(frameIndex,anchor,scale,sx,sy);

      // Contact sparkle is intentionally drawn after the hull punch-out because it belongs exactly
      // on the authored waterline, not underneath the vessel.
      fxCtx.save();
      fxCtx.translate(sx,sy);
      drawWaterContact(frameIndex,anchor,scale,t,ratio,cloudShade);
      fxCtx.restore();

      // Character + foot shadow share the hull's actual world transform, so browser zoom can never
      // split them from the boat. Only the reflection/wake remain in the under-hull FX texture.
      updateBoatCharacterWorldLayer(frameIndex,t,ratio,cloudShade);

      if(boatMaterial){
        if(boatMaterial.uniforms?.uFrame)boatMaterial.uniforms.uFrame.value=frameIndex;
        if(boatMaterial.uniforms?.uTime)boatMaterial.uniforms.uTime.value=t;
        if(boatMaterial.uniforms?.uLightDir)boatMaterial.uniforms.uLightDir.value.copy(boatLightDir);
        if(boatMaterial.uniforms?.uBoatBaseY)boatMaterial.uniforms.uBoatBaseY.value=boatRoot.position.y;
        if(boatMaterial.uniforms?.uBoatHeightScale)boatMaterial.uniforms.uBoatHeightScale.value=BOAT_WORLD_HEIGHT;
        cloudSystem?.applyBoatUniforms?.(boatMaterial.uniforms);
      }

      shipLastScreenX=Math.round(sx/overlayScale);
      shipLastScreenY=Math.round(sy/overlayScale);
      shipLastSize=Math.round(boatVisual.screenSizeCss);
      if(debugMode){
        debugPanel.textContent=`SHIP: READY
DIR: ${shipImageNo} / sector ${shipSector}
SCREEN: ${shipLastScreenX}, ${shipLastScreenY}
SIZE: ${shipLastSize}px
PROJECTION: ${projectionOk?'OK':'FALLBACK'}
WORLD: ${(worldState.originX+boatMotion.position.x).toFixed(1)}, ${(worldState.originZ+boatMotion.position.z).toFixed(1)}
REBASE: ${worldState.rebaseCount}
OVERLAY SCALE: ${overlayScale.toFixed(2)} / FX ${shipFxCanvas.width}x${shipFxCanvas.height} / CAP ${SHIP_FX_MAX_WIDTH}x${SHIP_FX_MAX_HEIGHT}
RENDER OPT2: ${RENDER_OPT2_ENABLED?'ON':'LEGACY'} / WIND RT ${windLayerTarget.width}x${windLayerTarget.height} @ ${WIND_RT_SCALE.toFixed(2)}
ZOOM LOCK: WORLD CHARACTER / EXACT BOAT FX PROJECTION
BOAT WORLD: ${BOAT_WORLD_SIZE.toFixed(2)}u / ${boatVisual.pixelsPerWorldCss.toFixed(1)}px-per-u
BODY: ${boatMaterial?.uniforms?.tNormal?'REALTIME NORMAL + AO + HEIGHT + CLOUD SHADOW':'LOADING / ERROR'}
REFLECTION: NORMAL-LIT HULL-CONTOUR
LOCAL GLOW: OFF
WAKE: STERN-ANCHORED + HULL-OCCLUDED (${activeWakePixels.length} active)
WIND: ${windSystem ? `${windSystem.stats.normal} normal + ${windSystem.stats.strong} strong / ${windSystem.stats.drawCalls} draws / ABOVE BOAT / strength ${windSystem.stats.strength.toFixed(2)} / dir ${windSystem.stats.direction}` : 'OFF'}
PROFILE: ${PERF.tier} @ DPR ${viewportState.dpr.toFixed(2)} / ${PERF.targetFps}fps\nPIXEL: GLOBAL ${GLOBAL_PIXEL_SIZE_RENDERPX.toFixed(2)}rpx / CLOUD ${CLOUD_PIXEL_SIZE_RENDERPX.toFixed(1)}rpx (${cloudPixelTarget.width}x${cloudPixelTarget.height})\nSHIP ASSETS: ${location.protocol==='file:'?'EMBEDDED PNG':'REAL IMG FILES'}
WAVES: ${waveSpritesData.length} sprites / 15 batches
CLOUDS: ${cloudSystem ? `${cloudSystem.stats.visible} paper / ${cloudSystem.stats.drawCalls} LOW-RES draws / shadow ${cloudSystem.stats.shadowHz}Hz / center-light-shadow ${cloudSystem.stats.boatShade.toFixed(2)} / ${cloudSystem.stats.renderMode}` : 'OFF'}
CHARACTER: ${characterReady ? `READY (${characterAtlases.size} dirs)` : `OFF${characterInitError ? ' / '+characterInitError : ''}`}
BUILD: ${BUILD_ID}
ROD EMBED: ${window.COSMIC_ROD_CAST_EMBEDDED_ASSETS ? Object.keys(window.COSMIC_ROD_CAST_EMBEDDED_ASSETS).length+' FILES' : 'MISSING'}
ROD CAST: ${rodCastReady ? `VISUAL READY ${rodCastAtlases.size} dirs / RAW DIFFUSE PLAYBACK / LIGHT ${rodCastLightingReadyCount}/${rodCastAtlases.size}` : `LOADING/OFF${rodCastInitError ? ' / '+rodCastInitError : ''}`}
ASSETS: ROD=${rodAssetState} / FISH=${fishingAssetState}
CHAR BUFFER: ${characterImageDataCache.size} sizes / alloc-hit ${characterImageDataCacheHits} / miss ${characterImageDataCacheMisses}
CHAR RENDER: redraw ${characterLayerRedrawCount} / cache-skip ${characterLayerCacheSkipCount} / uploads ${characterLayerUploadCount}
ROD PLAY: ${rodCastPlayback.active ? `ACTIVE ${rodCastPlayback.key} frame ${rodCastPlayback.frame+1}/${rodCastPlayback.frameCount} shown ${rodCastPlayback.renderedFrames.size}/${rodCastPlayback.frameCount} / ${rodCastPlayback.time.toFixed(2)}s${rodCastPlayback.finishPending?' DONE':''}` : 'IDLE'}
FISHING: ${fishingSystem ? fishingSystem.getDebugText() : 'OFF'}\nCAST QUEUED: ${pendingFishingCast?'YES':'NO'}
BITE TIMER: ${fishingSystem?.state==='WAIT_BITE' ? `${Math.max(0,fishingSystem.biteWait-fishingSystem.stateTime).toFixed(2)}s` : '-'}
ALERT: ${fishingSystem?.isBiteAlertVisible ? 'VISIBLE / CHARACTER-LAYER' : 'OFF'}
TRACE: ${fishingTrace.slice(-5).map(v=>v.event).join(' > ')}`;
      }
    }

    function updateMotorAudio(dt){
      if(!motorSfx)return; const speed=boatMotion.velocity.length(),moving=speed>.045,n=THREE.MathUtils.clamp(speed/boatMotion.maxSpeed,0,1),target=moving?THREE.MathUtils.lerp(.06,.34,Math.pow(n,.75)):0;
      motorSfx.volume+=(target-motorSfx.volume)*(1-Math.pow(.0008,dt));
      if(moving&&motorPrimed&&motorSfx.paused)motorSfx.play().catch(()=>{});
      if(!moving&&!motorSfx.paused&&motorSfx.volume<=.012){motorSfx.pause();motorSfx.currentTime=0;}
      if(!motorSfx.paused)motorSfx.playbackRate=.92+n*.22;
    }

    function updateFishingReelAudio(dt){
      if(!reelSfx||!fishingSystem)return;

      const cfg=REEL_SFX_CONFIG;
      const inMinigame=fishingSystem.state==='MINIGAME';
      const held=inMinigame&&!!fishingSystem.inputHeld;
      const vel=Number.isFinite(fishingSystem.barVel)?fishingSystem.barVel:0;
      const pos=Number.isFinite(fishingSystem.barPos)?fishingSystem.barPos:0;
      // Only positive/rightward bar travel increases reel intensity. Holding against leftward
      // momentum still produces a quieter mechanical wind, which makes braking taps readable.
      const drive=THREE.MathUtils.clamp(Math.max(0,vel)/cfg.barMaxSpeed,0,1);
      const driveCurve=Math.pow(drive,.62);
      const pinned=held&&pos>=.985&&Math.abs(vel)<.045;

      let targetVolume=0;
      let targetRate=cfg.minRate;
      if(held){
        targetVolume=THREE.MathUtils.lerp(cfg.minVolume,cfg.maxVolume,driveCurve);
        if(vel<0)targetVolume*=.86;
        if(pinned)targetVolume=cfg.pinnedVolume;
        targetRate=THREE.MathUtils.lerp(cfg.minRate,cfg.maxRate,driveCurve);
      }

      // Fast attack for tactile button response, slower release to avoid clicky audio on taps.
      const tau=targetVolume>reelSfx.volume?cfg.attackSeconds:cfg.releaseSeconds;
      const volumeAlpha=1-Math.exp(-dt/Math.max(.001,tau));
      reelSfx.volume+= (targetVolume-reelSfx.volume)*volumeAlpha;

      const rateAlpha=1-Math.exp(-dt/.08);
      reelPlaybackRate+=(targetRate-reelPlaybackRate)*rateAlpha;
      if(!reelSfx.paused)reelSfx.playbackRate=THREE.MathUtils.clamp(reelPlaybackRate,cfg.minRate,cfg.maxRate);

      if(held&&audioUnlocked&&reelPrimed&&reelSfx.paused){
        reelSfx.playbackRate=THREE.MathUtils.clamp(reelPlaybackRate,cfg.minRate,cfg.maxRate);
        reelSfx.play().catch(()=>{});
      }
      // Keep currentTime on pause. Rapid taps continue through the same loop instead of
      // restarting the same transient on every press.
      if(!held&&!reelSfx.paused&&reelSfx.volume<=.008){
        reelSfx.pause();
        reelSfx.volume=0;
      }
    }

    // Base movement camera + full fishing-session focus. The focus zoom changes only the real
    // perspective camera, so boat/character/reflection/wake/cloud projection stay locked together.
    const cameraNormalPos=new THREE.Vector3(),cameraNormalLook=new THREE.Vector3(),cameraDesiredPos=new THREE.Vector3(),cameraDesiredLook=new THREE.Vector3(),cameraMoveDir=new THREE.Vector3();
    const cameraMode={
      moveFocus:0,targetMoveFocus:0,normalFov:42,movingFovBoost:3.2,
      castFocus:0,targetCastFocus:0,castFov:34.0,castZoomInSpeed:8.5,castZoomOutSpeed:6.5,castMoveSuppression:.92,
      normalOffset:new THREE.Vector3(1,9.5,7.5),normalLookOffset:new THREE.Vector3(.10,.52,.02),
      moveBackBoost:1.8,moveHeightBoost:.65,moveLookAhead:1.45,moveShake:.060,moveZoomInSpeed:2.4,moveZoomOutSpeed:3.8
    };
    function updateCamera(t,dt){
      const ratio=THREE.MathUtils.clamp(boatMotion.velocity.length()/boatMotion.maxSpeed,0,1),active=moveState.active;
      cameraMode.targetMoveFocus=(active||ratio>.055)?THREE.MathUtils.clamp(ratio*1.15,0,1):0;
      const sp=cameraMode.targetMoveFocus>cameraMode.moveFocus?cameraMode.moveZoomInSpeed:cameraMode.moveZoomOutSpeed;
      cameraMode.moveFocus+=(cameraMode.targetMoveFocus-cameraMode.moveFocus)*(1-Math.exp(-sp*dt));

      // Keep the close framing for the entire fishing flow, not only the throw animation:
      // CAST -> WAIT_BITE -> BITE_ALERT -> MINIGAME -> RESULT. It releases only after the
      // fishing system returns to IDLE, so waiting for a bite and the minigame never pop back out.
      const fishingFocusActive=!!(fishingSystem&&fishingSystem.state&&fishingSystem.state!=='IDLE');
      cameraMode.targetCastFocus=(fishingFocusActive||rodCastPlayback.active)?1:0;
      const castSp=cameraMode.targetCastFocus>cameraMode.castFocus?cameraMode.castZoomInSpeed:cameraMode.castZoomOutSpeed;
      cameraMode.castFocus+=(cameraMode.targetCastFocus-cameraMode.castFocus)*(1-Math.exp(-castSp*dt));

      const mf=smooth01(cameraMode.moveFocus);
      const cf=smooth01(cameraMode.castFocus);
      // A cast can be triggered immediately after travel. Fade residual movement framing/shake as
      // the cast zoom arrives so the camera never backs away before moving in on the character.
      const framedMf=mf*(1-cf*cameraMode.castMoveSuppression);

      cameraNormalPos.copy(boatRoot.position).add(cameraMode.normalOffset);
      cameraNormalPos.y+=cameraMode.moveHeightBoost*framedMf;
      cameraNormalPos.z+=cameraMode.moveBackBoost*framedMf;
      cameraNormalLook.copy(boatRoot.position).add(cameraMode.normalLookOffset);
      // v10.2 mobile portrait composition: the ranking now occupies the lower screen,
      // so aim slightly below the boat to place gameplay a little higher on-screen.
      if(window.innerWidth<=700&&window.innerHeight>window.innerWidth)cameraNormalLook.y-=.78;
      if(boatMotion.velocity.lengthSq()>.0001)cameraMoveDir.copy(boatMotion.velocity).normalize();else cameraMoveDir.set(-Math.sin(boatMotion.heading),0,-Math.cos(boatMotion.heading));
      cameraNormalLook.addScaledVector(cameraMoveDir,cameraMode.moveLookAhead*framedMf);cameraNormalLook.y+=.18*framedMf;
      cameraDesiredPos.copy(cameraNormalPos);cameraDesiredLook.copy(cameraNormalLook);
      cameraDesiredPos.x+=Math.sin(t*.18)*.15;cameraDesiredPos.y+=Math.sin(t*.12)*.08;cameraDesiredPos.z+=Math.cos(t*.17)*.12;
      const shake=cameraMode.moveShake*framedMf;cameraDesiredPos.x+=Math.sin(t*10)*shake;cameraDesiredPos.y+=Math.sin(t*7.5)*shake*.55;cameraDesiredPos.z+=Math.cos(t*8.8)*shake*.75;
      camera.position.lerp(cameraDesiredPos,1-Math.pow(.0015,dt));

      const movementFov=cameraMode.normalFov+cameraMode.movingFovBoost*mf;
      const targetFov=THREE.MathUtils.lerp(movementFov,cameraMode.castFov,cf);
      if(Math.abs(camera.fov-targetFov)>.01){
        // Preserve the original 5.5 response during ordinary sailing. Fishing focus uses a
        // quicker filter so the camera reaches the closer framing near the authored release frame.
        const fovResponse=(cameraMode.targetCastFocus>0||cameraMode.castFocus>.001)?9.0:5.5;
        camera.fov+=(targetFov-camera.fov)*(1-Math.exp(-fovResponse*dt));
        camera.updateProjectionMatrix();
      }
      camera.lookAt(cameraDesiredLook);camera.updateMatrixWorld(true);
    }

    const compassConfig={pixelsPerDegree:6,segmentDegrees:360,repeatSegments:3,northOffsetDeg:180};
    const compassMajor=[{deg:0,label:'N'},{deg:45,label:'NE'},{deg:90,label:'E'},{deg:135,label:'SE'},{deg:180,label:'S'},{deg:225,label:'SW'},{deg:270,label:'W'},{deg:315,label:'NW'}];
    const compassLabels=[],compassTicks=[];
    function buildCompass(){const px=compassConfig.pixelsPerDegree,segW=360*px,total=segW*compassConfig.repeatSegments;compassStripEl.style.width=`${total}px`;const f=document.createDocumentFragment();for(let seg=0;seg<compassConfig.repeatSegments;seg++){const o=seg*segW;for(let deg=0;deg<360;deg+=15){const e=document.createElement('div');e.className=`compassTick ${deg%45===0?'major':'minor'}`;e.style.left=`${o+deg*px}px`;e.dataset.deg=deg;f.appendChild(e);compassTicks.push(e);}for(const ent of compassMajor){const e=document.createElement('div');e.className='compassLabel';e.textContent=ent.label;e.style.left=`${o+ent.deg*px}px`;e.dataset.deg=ent.deg;f.appendChild(e);compassLabels.push(e);}}compassStripEl.appendChild(f);}
    let lastCompassSector=-1,lastCompassCosmeticTime=-999;
    function updateCompass(t){const yaw=normalizeDeg(THREE.MathUtils.radToDeg(boatMotion.visualYaw)+compassConfig.northOffsetDeg),px=compassConfig.pixelsPerDegree,segW=360*px,center=Math.floor(compassConfig.repeatSegments/2);compassStripEl.style.transform=`translateX(${-(center*segW+yaw*px)}px)`;const sector=Math.round(yaw/45)%8;if(sector!==lastCompassSector){lastCompassSector=sector;compassCenterLabelEl.textContent=['N','NE','E','SE','S','SW','W','NW'][sector];}if(t-lastCompassCosmeticTime>=1/20){lastCompassCosmeticTime=t;for(const e of compassLabels){const d=Math.abs(shortestDeg(+e.dataset.deg,yaw)),focus=Math.max(0,1-d/90);e.style.opacity=(.34+focus*.66).toFixed(3);e.style.transform=`translateX(-50%) scale(${(.88+focus*.24).toFixed(3)})`;}for(const e of compassTicks){const d=Math.abs(shortestDeg(+e.dataset.deg,yaw)),focus=Math.max(0,1-d/120);e.style.opacity=(.18+focus*.82).toFixed(3);}}}
    buildCompass();

    let hidden=document.hidden;
    let lastRafTime=performance.now(),frameCarryMs=0,viewportProbeCarry=0;
    const targetFrameMs=1000/PERF.targetFps;
    document.addEventListener('visibilitychange',()=>{
      hidden=document.hidden;
      lastRafTime=performance.now();frameCarryMs=0;
      if(hidden && motorSfx && !motorSfx.paused){motorSfx.pause();}
      if(hidden && reelSfx){reelSfx.pause();reelSfx.volume=0;}
    });
    function animate(now){
      requestAnimationFrame(animate);
      if(hidden){lastRafTime=now;return;}
      const elapsedMs=Math.min(100,Math.max(0,now-lastRafTime));lastRafTime=now;frameCarryMs+=elapsedMs;
      if(frameCarryMs+0.1<targetFrameMs)return;
      const stepCount=Math.min(2,Math.floor(frameCarryMs/targetFrameMs));
      const dtMs=stepCount*targetFrameMs;frameCarryMs-=dtMs;
      const dt=Math.min(dtMs/1000,.05);simTime+=dt;const t=simTime;
      viewportProbeCarry+=dt;
      if(viewportProbeCarry>=.05){
        viewportProbeCarry=0;
        const dprNow=Math.min(window.devicePixelRatio||1,PERF.dprCap);
        if(window.innerWidth!==viewportState.width||window.innerHeight!==viewportState.height||Math.abs(dprNow-viewportState.dpr)>.001)applyResize();
      }
      oceanUniforms.uTime.value=t;starUniforms.uTime.value=t;stars.rotation.y+=dt*.01;moonGlow.material.opacity=.18+Math.sin(t*.7)*.03;
      updateBoat(t,dt);updateWaveSprites(t,dt);updateCamera(t,dt);
      // .project(camera) is used before renderer.render(), so explicitly publish the current camera
      // world/inverse matrices now instead of accidentally using the previous rendered frame.
      camera.updateMatrixWorld(true);
      windSystem?.update(t,dt);updateEndlessSkyAnchor();updateWakeSocket(t,dt);updateWake(t,dt);
      if(cloudSystem){cloudSystem.update(t,dt);cloudSystem.applyOceanUniforms(oceanUniforms);}
      // Advance the fishing state and CAST controller first.
      fishingSystem?.update(t,dt);
      updateRodCastPlayback(dt);

      // CAST may never deadlock silently. This also exposes a renderer/controller mismatch
      // as an on-screen error instead of making the player wait forever for a bite.
      if(fishingSystem?.state==='CAST' && !rodCastPlayback.active){
        const castOpenFor=fishingSystem.stateTime;
        const safeLimit=Math.max(2.25,(rodCastMeta?.maxDuration||1.4)+.75);
        if(castOpenFor>safeLimit){
          const message=`Fishing CAST deadlock detected (${castOpenFor.toFixed(2)}s).`;
          pushFishingTrace('CAST_DEADLOCK',{castOpenFor,safeLimit});
          showRuntimeError(message);
          console.error('[CosmicFishing]',message);
          if(typeof fishingSystem.completeCast==='function')fishingSystem.completeCast();
        }
      }
      updateShipCanvas(t);
      finalizeRodCastPlaybackAfterRender();
      // Upload the completed Canvas2D FX frame once. The final PixelShader samples it under clouds.
      shipFxTexture.needsUpdate=true;
      updateCompass(t);updateMotorAudio(dt);updateFishingReelAudio(dt);
      // Wind is rendered to a transparent full-resolution layer, then the coarse cloud layer.
      // Final shader order is Base -> Ship FX -> Wind -> Cloud.
      renderWindLayer();
      renderPixelCloudLayer();
      composer.render();
    }
    syncOceanWorldOffset();
    requestAnimationFrame(animate);

    let resizeQueued=false;
    function applyResize(){
      resizeQueued=false;
      const w=Math.max(1,window.innerWidth),h=Math.max(1,window.innerHeight);
      const dpr=Math.min(window.devicePixelRatio||1,PERF.dprCap);
      if(w===viewportState.width&&h===viewportState.height&&Math.abs(dpr-viewportState.dpr)<=.001)return;
      viewportState.width=w;viewportState.height=h;viewportState.dpr=dpr;RENDER_DPR=dpr;
      camera.aspect=w/h;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
      renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);
      if(typeof composer.setPixelRatio==='function')composer.setPixelRatio(dpr);
      composer.setSize(w,h);
      resizeShipCanvas();
      fishingSystem?.onResize();
      shipFxTexture.needsUpdate=true;
      syncWindLayerTarget();
      syncCloudPixelTarget();
      syncPostProcessResolution();
    }
    const queueResize=()=>{if(!resizeQueued){resizeQueued=true;requestAnimationFrame(applyResize);}};
    window.addEventListener('resize',queueResize,{passive:true});
    if(window.visualViewport)window.visualViewport.addEventListener('resize',queueResize,{passive:true});

};
