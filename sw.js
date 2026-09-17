/* Offline shell for the Goa itinerary.
   The whole plan — times, notes, numbers, Google Maps links — works with no signal.
   Map tiles are not cached; they need data. */
var CACHE = 'goa-v2';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      /* addAll rejects the whole install if any one URL fails, so add individually. */
      return Promise.all(SHELL.map(function(u){
        return c.add(new Request(u, {mode: 'no-cors'})).catch(function(){});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; })
                            .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

/* Cache.put() throws on anything that isn't http(s) — browser extensions route
   chrome-extension:// requests through here — and on partial (206) responses. */
function cacheable(req, res){
  if(req.method !== 'GET') return false;
  if(req.url.indexOf('http') !== 0) return false;
  if(res && res.type !== 'opaque' && res.status !== 200) return false;
  return true;
}

function put(req, res){
  if(!cacheable(req, res)) return;
  var copy = res.clone();
  caches.open(CACHE).then(function(c){
    return c.put(req, copy);
  }).catch(function(){ /* quota, opaque redirect, unsupported scheme — never fatal */ });
}

self.addEventListener('fetch', function(e){
  var req = e.request, url = req.url;

  /* Only ever touch plain http(s) GETs. Everything else goes straight to the network. */
  if(req.method !== 'GET' || url.indexOf('http') !== 0) return;

  /* Range requests come back 206 and cannot be cached. */
  if(req.headers.get('range')) return;

  /* Tiles and routing are large and volatile — never cache them. */
  if(url.indexOf('tile.openstreetmap.org') > -1 || url.indexOf('router.project-osrm.org') > -1) return;

  /* Navigations: network first so an updated plan wins, cache as the offline fallback. */
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        put(new Request('./index.html'), res);
        return res;
      }).catch(function(){
        return caches.match('./index.html').then(function(r){ return r || Response.error(); });
      })
    );
    return;
  }

  /* Everything else: cache first, fall back to network and store it. */
  e.respondWith(
    caches.match(req).then(function(hit){
      return hit || fetch(req).then(function(res){
        put(req, res);
        return res;
      }).catch(function(){ return hit; });
    })
  );
});
