(function(global){
  'use strict';

  const cfg = global.COSMIC_SUPABASE_CONFIG || {};
  const STORAGE = Object.freeze({
    playerId: 'cosmicFishing.playerId.v1'
  });

  const els = {};
  let client = null;
  let initialized = false;
  let submitInFlight = false;
  let lastCatch = null;
  let rankingTimer = 0;

  function $(id){ return document.getElementById(id); }
  function text(v){ return String(v == null ? '' : v); }

  function isConfigured(){
    return !!(
      cfg.enabled !== false &&
      typeof cfg.url === 'string' && /^https:\/\//.test(cfg.url) &&
      typeof cfg.publishableKey === 'string' &&
      cfg.publishableKey.length > 20 &&
      !cfg.publishableKey.includes('PASTE_YOUR')
    );
  }

  // Stable hidden browser id: only used to suppress accidental duplicate submissions.
  // It is NOT the public player name shown in ranking.
  function getPlayerId(){
    let id = localStorage.getItem(STORAGE.playerId);
    if(id) return id;
    if(global.crypto && typeof global.crypto.randomUUID === 'function'){
      id = global.crypto.randomUUID();
    }else{
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
    localStorage.setItem(STORAGE.playerId, id);
    return id;
  }

  function setStatus(kind, label){
    if(!els.dbStatus) return;
    els.dbStatus.dataset.state = kind;
    els.dbStatus.textContent = label;
  }

  function flashToast(message, kind='info', ms=2800){
    if(!els.toast) return;
    els.toast.textContent = message;
    els.toast.dataset.kind = kind;
    els.toast.classList.add('show');
    clearTimeout(flashToast.timer);
    flashToast.timer = setTimeout(() => els.toast?.classList.remove('show'), ms);
  }

  function bindUi(){
    els.dbStatus = $('dbStatus');
    els.rankingList = $('rankingList');
    els.rankingEmpty = $('rankingEmpty');
    els.catchCard = $('catchResultCard');
    els.catchClose = $('catchResultClose');
    els.catchFishName = $('catchFishName');
    els.catchLength = $('catchLength');
    els.catchPlayer = $('catchPlayer');
    els.catchRank = $('catchRank');
    els.toast = $('onlineToast');

    els.catchClose?.addEventListener('click', hideCatchResult);
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape' && els.catchCard?.classList.contains('show')) hideCatchResult();
    });
  }

  function connect(){
    if(!isConfigured()){
      setStatus('setup', 'DB SETUP');
      return false;
    }
    if(!global.supabase || typeof global.supabase.createClient !== 'function'){
      setStatus('error', 'OFFLINE');
      console.warn('[CosmicFishing] Supabase JS library is unavailable.');
      return false;
    }
    try{
      client = global.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      setStatus('ready', 'LIVE');
      return true;
    }catch(err){
      setStatus('error', 'DB ERROR');
      console.error('[CosmicFishing] Supabase client init failed:', err);
      return false;
    }
  }

  function titleFor(row){
    return [row?.title_1, row?.title_2, row?.title_3].filter(Boolean).join(' ');
  }

  function publicPlayerName(row){
    return text(row?.nickname || titleFor(row) || '이름 없는 어부');
  }

  function escapeHtml(value){
    return text(value).replace(/[&<>'"]/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
    }[ch]));
  }

  function renderRanking(rows){
    if(!els.rankingList) return;
    if(!Array.isArray(rows) || rows.length === 0){
      els.rankingList.innerHTML = '';
      els.rankingEmpty?.classList.add('show');
      return;
    }

    els.rankingEmpty?.classList.remove('show');
    els.rankingList.innerHTML = rows.map((row, i) => {
      const size = Number(row.length_cm || 0).toFixed(2);
      const isLastCatch = !!(lastCatch && row.id === lastCatch.id);
      return `<div class="ranking-row${isLastCatch ? ' is-me' : ''}">
        <div class="ranking-place">${i + 1}</div>
        <div class="ranking-main">
          <div class="ranking-nickname">${escapeHtml(publicPlayerName(row))}</div>
          <div class="ranking-meta">${escapeHtml(row.fish_name || '물고기')}</div>
        </div>
        <div class="ranking-size">${size}<span>cm</span></div>
      </div>`;
    }).join('');
  }

  async function loadRanking(showFeedback=false){
    if(!client){
      renderRanking([]);
      if(showFeedback) flashToast('Publishable Key를 설정하면 온라인 랭킹이 활성화돼.', 'warning', 4200);
      return [];
    }

    try{
      const limit = Number.isFinite(cfg.rankingLimit) ? Math.max(1, Math.min(100, cfg.rankingLimit)) : 20;
      const { data, error } = await client
        .from(cfg.table || 'fish_catches')
        .select('id,nickname,fish_name,length_cm,title_1,title_2,title_3,caught_at')
        .order('length_cm', { ascending: false })
        .order('caught_at', { ascending: true })
        .limit(limit);
      if(error) throw error;
      renderRanking(data || []);
      setStatus('ready', 'LIVE');
      return data || [];
    }catch(err){
      console.error('[CosmicFishing] ranking load failed:', err);
      setStatus('error', 'DB ERROR');
      if(showFeedback) flashToast('랭킹을 불러오지 못했어. SQL/RLS 설정을 확인해줘.', 'error', 4200);
      return [];
    }
  }

  function showCatchResult(row, rank=null){
    if(!row || !els.catchCard) return;
    const size = Number(row.length_cm || 0).toFixed(2);
    if(els.catchFishName) els.catchFishName.textContent = row.fish_name || '물고기';
    if(els.catchLength) els.catchLength.textContent = `${size} cm`;
    if(els.catchPlayer) els.catchPlayer.textContent = publicPlayerName(row);
    if(els.catchRank) els.catchRank.textContent = rank ? `현재 전체 ${rank}위` : '온라인 기록 저장 완료';
    els.catchCard.classList.add('show');
    clearTimeout(showCatchResult.timer);
    showCatchResult.timer = setTimeout(hideCatchResult, 7200);
  }

  function hideCatchResult(){
    clearTimeout(showCatchResult.timer);
    els.catchCard?.classList.remove('show');
  }

  async function calculateRank(lengthCm){
    if(!client) return null;
    try{
      const { count, error } = await client
        .from(cfg.table || 'fish_catches')
        .select('id', { count: 'exact', head: true })
        .gt('length_cm', lengthCm);
      if(error) return null;
      return Number.isFinite(count) ? count + 1 : null;
    }catch(_err){
      return null;
    }
  }

  async function submitCatch(){
    if(submitInFlight) return null;
    if(!client){
      flashToast('DB 키 설정 전이라 기록은 저장되지 않았어.', 'warning', 4200);
      return null;
    }

    submitInFlight = true;
    setStatus('busy', 'SAVING');
    try{
      const { data, error } = await client.rpc(cfg.submitRpc || 'submit_fish_catch', {
        p_player_id: getPlayerId()
      });
      if(error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if(!row) throw new Error('submit_fish_catch returned no row');

      lastCatch = row;
      const rank = await calculateRank(Number(row.length_cm));
      showCatchResult(row, rank);
      await loadRanking(false); // left ranking updates immediately after every successful catch.
      setStatus('ready', 'LIVE');
      console.info('[CosmicFishing] online catch saved:', row);
      return row;
    }catch(err){
      console.error('[CosmicFishing] catch save failed:', err);
      setStatus('error', 'DB ERROR');
      const msg = text(err?.message || err);
      if(msg.includes('too_many_requests')){
        flashToast('중복 저장 요청이 차단됐어.', 'warning');
      }else{
        flashToast('기록 저장 실패. Supabase SQL과 키를 확인해줘.', 'error', 4800);
      }
      return null;
    }finally{
      submitInFlight = false;
    }
  }

  function startRankingRefresh(){
    clearInterval(rankingTimer);
    const ms = Number.isFinite(cfg.rankingRefreshMs)
      ? Math.max(5000, Math.min(120000, cfg.rankingRefreshMs))
      : 12000;
    rankingTimer = global.setInterval(() => {
      if(document.visibilityState === 'visible') loadRanking(false);
    }, ms);

    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'visible') loadRanking(false);
    });
  }

  function init(){
    if(initialized) return;
    initialized = true;
    bindUi();
    connect();
    getPlayerId();
    loadRanking(false); // ranking is always visible; no button click required.
    startRankingRefresh();

    if(!isConfigured()){
      console.warn('[CosmicFishing] Supabase Publishable Key is not configured. Edit JS/supabase-config.js.');
    }
  }

  const api = Object.freeze({
    init,
    submitCatch,
    loadRanking,
    isConfigured
  });
  global.CosmicOnline = api;

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
