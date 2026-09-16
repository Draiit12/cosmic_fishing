// Cosmic Fishing - Supabase public client configuration.
// IMPORTANT: Only paste a Publishable Key (sb_publishable_...) here.
// Never paste a Secret key, service_role key, or database password into browser code.
window.COSMIC_SUPABASE_CONFIG = Object.freeze({
  enabled: true,
  url: 'https://yhydpxqthinneawgcuzb.supabase.co',
  publishableKey: 'sb_publishable__am1EeHfOTEINZrnuVCNFQ_bgauRlRA',
  table: 'fish_catches',
  submitRpc: 'submit_fish_catch',
  rankingLimit: 20,
  rankingRefreshMs: 12000
});
