// Cosmic Fishing CLEAN CORE - classic script for file:// compatibility.
(()=>{
'use strict';
// Shared asset loading/resolution for HTTP and direct file:// launch.
function createAssetTools(THREE){
  const ASSET_DEV_CACHE_TOKEN = Date.now().toString(36);

  function resolveAssetURL(path){
    const raw=String(path||'');
    const key=raw.replace(/^\.\//,'');

    if(location.protocol === 'file:'){
      return window.COSMIC_ROD_CAST_EMBEDDED_ASSETS?.[key]
        || window.COSMIC_WIND_EMBEDDED_ASSETS?.[key]
        || window.COSMIC_EMBEDDED_ASSETS?.[key]
        || raw;
    }

    const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if(isLocalDev && !raw.startsWith('data:') && !raw.startsWith('blob:')){
      const joiner = raw.includes('?') ? '&' : '?';
      return `${raw}${joiner}dev=${ASSET_DEV_CACHE_TOKEN}`;
    }
    return raw;
  }

  const textureLoader = new THREE.TextureLoader();

  function applyPixelTextureSettings(tex, flipVertical = false) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    if (flipVertical) { tex.repeat.y = -1; tex.offset.y = 1; }
    return tex;
  }

  function pixelTexture(path, flipVertical = false) {
    const resolvedPath=resolveAssetURL(path);
    const tex = textureLoader.load(
      resolvedPath,
      loaded => applyPixelTextureSettings(loaded, flipVertical),
      undefined,
      err => console.error('[CosmicFishing] texture load failed:', path, err)
    );
    return applyPixelTextureSettings(tex, flipVertical);
  }

  function loadImageAsset(src){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.decoding='async';
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('PNG decode failed: '+src));
      img.src=resolveAssetURL(src);
    });
  }

  function extractImageData(img){
    const canvas=document.createElement('canvas');
    canvas.width=img.width;canvas.height=img.height;
    const ctx=canvas.getContext('2d',{alpha:true,willReadFrequently:true});
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0);
    return ctx.getImageData(0,0,canvas.width,canvas.height);
  }

  return Object.freeze({
    resolveAssetURL,applyPixelTextureSettings,pixelTexture,loadImageAsset,extractImageData
  });
}

window.CosmicCore=window.CosmicCore||{};
window.CosmicCore.createAssetTools=createAssetTools;
})();
