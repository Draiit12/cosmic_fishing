// Cosmic Fishing CLEAN CORE - classic script for file:// compatibility.
(()=>{
'use strict';
// Shared finite loader lifecycle. Keep visual-ready distinct from full support-map readiness.
const ASSET_STATE=Object.freeze({
  UNLOADED:'UNLOADED',
  LOADING:'LOADING',
  VISUAL_READY:'VISUAL_READY',
  FULL_READY:'FULL_READY',
  READY:'READY',
  FAILED:'FAILED'
});

window.CosmicCore=window.CosmicCore||{};
window.CosmicCore.ASSET_STATE=ASSET_STATE;
})();
