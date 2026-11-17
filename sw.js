importScripts('./db-helper.js');

var CACHE_STATIC_NAME = 'static-outbox-v2';
var STATIC_FILES = [
  './',
  './index.html',
  './styles.css',
  './db-helper.js',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', function (event) {
  console.log('[SW] Instalando Service Worker y cacheando App Shell...');
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME)
      .then(function (cache) {
        return cache.addAll(STATIC_FILES);
      })
      .then(function () {
      
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  console.log('[SW] Activando Service Worker. Limpiando cachés obsoletas...');
  event.waitUntil(
    caches.keys()
      .then(function (nombres) {
        var promesasBorrado = nombres
          .filter(function (nombre) {
            return nombre !== CACHE_STATIC_NAME;
          })
          .map(function (nombre) {
            console.log('[SW] Eliminando caché obsoleta:', nombre);
            return caches.delete(nombre);
          });
        return Promise.all(promesasBorrado);
      })
      .then(function () {
       
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
 
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(function (respuestaCache) {
        if (respuestaCache) {
          return respuestaCache;
        }
        return fetch(event.request);
      })
      .catch(function () {
        
        if (event.request.headers.get('accept').indexOf('text/html') !== -1) {
          return caches.match('./index.html');
        }
      })
  );
});

function notificarClientesActualizacion() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(function (clientes) {
      clientes.forEach(function (cliente) {
        cliente.postMessage({
          tipo: 'OUTBOX_SINCRONIZADO',
          timestamp: Date.now()
        });
      });
    });
}

function sincronizarPendientesSW() {
  console.log('[SW-Sync] Ejecutando barrido de transacciones pendientes...');

  return obtenerTodosLosRegistros()
    .then(function (registros) {
      var pendientes = registros.filter(function (item) {
        return item.estado === 'pendiente';
      });

      if (pendientes.length === 0) {
        console.log('[SW-Sync] Cola limpia. Nada por sincronizar.');
        return;
      }

      var promesasDeEnvio = pendientes.map(function (item) {
        return fetch('https://jsonplaceholder.typicode.com/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.titulo,
            body:  item.descripcion
          })
        })
          .then(function (respuesta) {
            if (!respuesta.ok) {
              throw new Error('Error HTTP ' + respuesta.status + ' al sincronizar ID ' + item.id);
            }
            return actualizarEstadoRegistro(item.id, 'sincronizado');
          });
      });

      return Promise.all(promesasDeEnvio)
        .then(function () {
          return notificarClientesActualizacion();
        });
    });
}

self.addEventListener('sync', function (event) {
  console.log('[SW-Sync] Evento sync disparado con etiqueta:', event.tag);

  if (event.tag === 'sync-reportes') {
    event.waitUntil(
      sincronizarPendientesSW()
        .catch(function (error) {
          console.error('[SW-Sync] Falla en sincronización; el navegador reintentará luego:', error);
          
          throw error;
        })
    );
  }
});
