// Cosmic Fishing CLEAN CORE - classic script for file:// compatibility.
(()=>{
'use strict';
// Cosmic Fishing CLEAN CORE: runtime/profile/query configuration.
function createRuntimeConfig(THREE){
  const URL_PARAMS = new URLSearchParams(location.search);
  const CAST_TEST_MODE = URL_PARAMS.get('casttest') === '1';
  const RENDER_OPT2_ENABLED = URL_PARAMS.get('renderopt') !== '0';
  const IS_MOBILE_RENDER = matchMedia('(pointer: coarse)').matches
    || navigator.maxTouchPoints > 0
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const DEVICE_MEMORY_GB = Number(navigator.deviceMemory || 0);
  const CPU_CORES = Number(navigator.hardwareConcurrency || 0);
  const MOBILE_LOW_END = IS_MOBILE_RENDER
    && ((DEVICE_MEMORY_GB > 0 && DEVICE_MEMORY_GB <= 4) || (CPU_CORES > 0 && CPU_CORES <= 4));
  const requestedQuality = (URL_PARAMS.get('quality') || 'auto').toLowerCase();
  const mobileTier = requestedQuality === 'low' || requestedQuality === 'balanced' || requestedQuality === 'high'
    ? requestedQuality
    : (MOBILE_LOW_END ? 'low' : 'balanced');

  const PERF = !IS_MOBILE_RENDER ? {
    tier:'desktop', dprCap:2.0, targetFps:60, oceanSegments:192, starCount:900,
    waveCounts:{small:34,medium:12,large:5}, waveHz:60, wakeMax:320, wakeSpawnDistance:.07,
    wakeContact:2, wakeCenter:3, wakeSide:2, wakeFoam:3, boatShadowSteps:6,
    fxMaxWidth:1920, fxMaxHeight:1080, reflectionStrip:3, contactStep:4, bloom:true
  } : mobileTier === 'high' ? {
    tier:'mobile-high', dprCap:1.55, targetFps:60, oceanSegments:128, starCount:650,
    waveCounts:{small:30,medium:10,large:4}, waveHz:45, wakeMax:240, wakeSpawnDistance:.075,
    wakeContact:2, wakeCenter:3, wakeSide:2, wakeFoam:2, boatShadowSteps:4,
    fxMaxWidth:1440, fxMaxHeight:810, reflectionStrip:4, contactStep:5, bloom:true
  } : mobileTier === 'balanced' ? {
    tier:'mobile-balanced', dprCap:1.35, targetFps:45, oceanSegments:96, starCount:480,
    waveCounts:{small:24,medium:8,large:3}, waveHz:30, wakeMax:180, wakeSpawnDistance:.09,
    wakeContact:1, wakeCenter:2, wakeSide:1, wakeFoam:2, boatShadowSteps:3,
    fxMaxWidth:1280, fxMaxHeight:720, reflectionStrip:6, contactStep:6, bloom:true
  } : {
    tier:'mobile-low', dprCap:1.0, targetFps:30, oceanSegments:72, starCount:300,
    waveCounts:{small:18,medium:6,large:2}, waveHz:24, wakeMax:120, wakeSpawnDistance:.11,
    wakeContact:1, wakeCenter:1, wakeSide:1, wakeFoam:1, boatShadowSteps:2,
    fxMaxWidth:960, fxMaxHeight:540, reflectionStrip:8, contactStep:8, bloom:false
  };

  const OPT2_FX_CAP = PERF.tier==='desktop' ? {w:1280,h:720}
    : PERF.tier==='mobile-high' ? {w:960,h:540}
    : PERF.tier==='mobile-balanced' ? {w:720,h:405}
    : {w:540,h:304};
  const SHIP_FX_MAX_WIDTH = RENDER_OPT2_ENABLED ? Math.min(PERF.fxMaxWidth,OPT2_FX_CAP.w) : PERF.fxMaxWidth;
  const SHIP_FX_MAX_HEIGHT = RENDER_OPT2_ENABLED ? Math.min(PERF.fxMaxHeight,OPT2_FX_CAP.h) : PERF.fxMaxHeight;
  const WIND_RT_SCALE = !RENDER_OPT2_ENABLED ? 1.0
    : PERF.tier==='desktop' ? .75
    : PERF.tier==='mobile-high' ? .70
    : PERF.tier==='mobile-balanced' ? .55
    : .50;

  function readPixelParam(name,fallback,min,max){
    const text=URL_PARAMS.get(name);
    if(text===null || text.trim()==='') return fallback;
    const raw=Number(text);
    return Number.isFinite(raw)?THREE.MathUtils.clamp(raw,min,max):fallback;
  }
  const GLOBAL_PIXEL_DEFAULT = 1.0;
  const CLOUD_PIXEL_DEFAULT = PERF.tier==='desktop' ? 8.0
    : PERF.tier==='mobile-high' ? 7.0
    : PERF.tier==='mobile-balanced' ? 6.0 : 5.0;
  const GLOBAL_PIXEL_SIZE_RENDERPX = readPixelParam('globalpixel',GLOBAL_PIXEL_DEFAULT,1.0,4.0);
  const CLOUD_PIXEL_SIZE_RENDERPX = readPixelParam('cloudpixel',CLOUD_PIXEL_DEFAULT,2.0,32.0);

  function readNumberParam(name,fallback,min,max){
    const raw=URL_PARAMS.get(name);
    if(raw===null||raw.trim()==='')return fallback;
    const n=Number(raw);
    return Number.isFinite(n)?THREE.MathUtils.clamp(n,min,max):fallback;
  }
  const WIND_GUSTS_ENABLED=URL_PARAMS.get('wind')!=='0';
  const worldWind={
    direction:new THREE.Vector2(.92,.38).normalize(),
    strength:readNumberParam('windstrength',.55,0,1),
    cloudSpeed:.055
  };

  return Object.freeze({
    URL_PARAMS,CAST_TEST_MODE,RENDER_OPT2_ENABLED,
    IS_MOBILE_RENDER,DEVICE_MEMORY_GB,CPU_CORES,MOBILE_LOW_END,
    requestedQuality,mobileTier,PERF,
    OPT2_FX_CAP,SHIP_FX_MAX_WIDTH,SHIP_FX_MAX_HEIGHT,WIND_RT_SCALE,
    GLOBAL_PIXEL_DEFAULT,CLOUD_PIXEL_DEFAULT,
    GLOBAL_PIXEL_SIZE_RENDERPX,CLOUD_PIXEL_SIZE_RENDERPX,
    WIND_GUSTS_ENABLED,worldWind
  });
}

window.CosmicCore=window.CosmicCore||{};
window.CosmicCore.createRuntimeConfig=createRuntimeConfig;
})();
