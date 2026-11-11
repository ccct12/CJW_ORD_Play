const V='ord-ec0861c7118e';const PRE=["./","app.js","art-index.js","i18n-en.js","i18n-ja.js","i18n-zh-Hans.js","i18n-zh-Hant.js","index.html","ord-stage.js","ord-stage3d.js","pack.js","pk-fx.webp","pk-icons.webp","pk-sound.mp3","pk-sprites.webp"];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>c.addAll(PRE)));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('ord-')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin||!u.pathname.startsWith(new URL('./',location).pathname))return;
e.respondWith(caches.open(V).then(c=>c.match(r,{ignoreSearch:true}).then(hit=>hit||fetch(r).then(res=>{if(res.ok&&res.type==='basic')c.put(r,res.clone());return res;}))));});
