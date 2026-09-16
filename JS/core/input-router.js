// Cosmic Fishing CLEAN CORE - classic script for file:// compatibility.
(()=>{
'use strict';
// Fishing input registration kept out of the renderer/runtime body.
// Semantics intentionally match v9.9.12: global secondary-button fallback + canvas/touch handlers.
function installFishingInputRouter({
  rendererElement,
  beginFishingAction,
  onGamePointerDown,
  onGamePointerMove,
  onGamePointerUp,
  onGamePointerCancel,
  debounceMs=180
}){
  let lastRightFishingInputAt=-1e9;
  const handledFishingPointerEvents=new WeakSet();

  const fireRightFishingInput=source=>{
    const now=performance.now();
    if(now-lastRightFishingInputAt<debounceMs)return false;
    lastRightFishingInputAt=now;
    return beginFishingAction(source);
  };

  const onWindowPointerDown=e=>{
    if(e.pointerType==='mouse' && e.button===2){
      e.preventDefault();
      handledFishingPointerEvents.add(e);
      fireRightFishingInput('window-pointer-right');
    }
  };
  const onWindowContextMenu=e=>{
    e.preventDefault();
    fireRightFishingInput('window-contextmenu-right');
  };
  const onRendererPointerDown=e=>{
    if(handledFishingPointerEvents.has(e))return;
    onGamePointerDown(e);
  };

  window.addEventListener('pointerdown',onWindowPointerDown,{capture:true,passive:false});
  window.addEventListener('contextmenu',onWindowContextMenu,{capture:true});
  rendererElement.addEventListener('pointerdown',onRendererPointerDown,{passive:false});
  rendererElement.addEventListener('pointermove',onGamePointerMove,{passive:false});
  window.addEventListener('pointerup',onGamePointerUp,{passive:false});
  window.addEventListener('pointercancel',onGamePointerCancel,{passive:false});

  return Object.freeze({
    fireRightFishingInput,
    dispose(){
      window.removeEventListener('pointerdown',onWindowPointerDown,{capture:true});
      window.removeEventListener('contextmenu',onWindowContextMenu,{capture:true});
      rendererElement.removeEventListener('pointerdown',onRendererPointerDown);
      rendererElement.removeEventListener('pointermove',onGamePointerMove);
      window.removeEventListener('pointerup',onGamePointerUp);
      window.removeEventListener('pointercancel',onGamePointerCancel);
    }
  });
}

window.CosmicCore=window.CosmicCore||{};
window.CosmicCore.installFishingInputRouter=installFishingInputRouter;
})();
