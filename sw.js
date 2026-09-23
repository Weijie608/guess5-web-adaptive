// Keep updates consistent within a session and isolate our cache from the old game.
const PREFIX='guess-five-adaptive:'+self.registration.scope+':';
const CACHE=PREFIX+'v2-model-20260922';
const ASSETS=['./','./index.html','./styles.css','./adaptive.css','./app.js','./engine.js',
  './numpy-random.js','./worker.js','./model.json','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||!url.href.startsWith(self.registration.scope))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const stored=await cache.match(event.request);if(stored)return stored;
    return fetch(event.request);
  }));
});
// No skipWaiting: a new release activates after existing game tabs are closed.
