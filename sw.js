/* Offline shell for the Goa itinerary.
   The whole plan — times, notes, numbers, Google Maps links — works with no signal.
   Map tiles are not cached; they need data. */
var CACHE = 'goa-v1';
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

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;

  /* Never cache tiles or the routing API — they are large and change. */
  var url = req.url;
  if(url.indexOf('tile.openstreetmap.org') > -1 || url.indexOf('router.project-osrm.org') > -1) return;

  /* Navigations: network first so an updated plan wins, cache as the offline fallback. */
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put('./index.html', copy); });
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
        if(res && (res.ok || res.type === 'opaque')){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return hit; });
    })
  );
});
