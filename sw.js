// オフラインでも動くようにアプリ本体と画像をキャッシュする
const CACHE = 'mtest-v11';
const IMGS = ['neck_ext', 'neck_flex', 'neck_lat', 'sho_ext', 'sho_flex', 'sho_hflex', 'sho_hext',
  'elb_pro', 'elb_sup', 'elb_flex', 'elb_ext', 'wr_uln', 'wr_rad', 'wr_palm', 'wr_dors',
  'low_ext', 'low_flex', 'low_lat', 'hip_ext', 'hip_flex', 'hip_er', 'hip_add', 'hip_abd',
  'hip_flexk', 'knee_flex', 'ank_pf', 'ank_df', 'ank_inv', 'ank_ev',
  ...['A', 'B', 'C', 'D', 'E', 'F'].flatMap(g => [`care_${g}1`, `care_${g}2`])];
const ASSETS = ['./', 'index.html', 'style.css', 'data.js', 'app.js', 'export.js', 'vendor/exceljs.min.js', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', ...IMGS.map(n => `img/${n}.jpg`)];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;  // スプレッドシート通信は素通し
  // 本体はネット優先（更新を反映）、失敗時はキャッシュ
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
