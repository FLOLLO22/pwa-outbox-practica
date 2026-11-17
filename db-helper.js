var DB_NAME = 'pwa-outbox-db';
var DB_VERSION = 1;
var STORE_NAME = 'transacciones_pendientes';

function abrirDB() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function (event) {
      var db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = function (event) { resolve(event.target.result); };
    request.onerror   = function (event) { reject(event.target.error); };
  });
}

function guardarRegistro(datos) {
  return abrirDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx    = db.transaction([STORE_NAME], 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      var req   = store.add(datos);
      var idGenerado;

      req.onsuccess = function (event) {
        idGenerado = event.target.result;
      };

      tx.oncomplete = function () { resolve(idGenerado); };
      tx.onerror    = function (event) { reject(event.target.error); };
    });
  });
}

function obtenerTodosLosRegistros() {
  return abrirDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx    = db.transaction([STORE_NAME], 'readonly');
      var store = tx.objectStore(STORE_NAME);
      var req   = store.getAll();

      req.onsuccess = function (event) { resolve(event.target.result); };
      req.onerror   = function (event) { reject(event.target.error); };
    });
  });
}

function eliminarRegistro(id) {
  return abrirDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx    = db.transaction([STORE_NAME], 'readwrite');
      var store = tx.objectStore(STORE_NAME);

      store.delete(id);

      tx.oncomplete = function () { resolve(true); };
      tx.onerror    = function (event) { reject(event.target.error); };
    });
  });
}

function actualizarEstadoRegistro(id, nuevoEstado) {
  return abrirDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx    = db.transaction([STORE_NAME], 'readwrite');
      var store = tx.objectStore(STORE_NAME);

      var reqGet = store.get(id);

      reqGet.onsuccess = function (event) {
        var registro = event.target.result;
        if (!registro) {
          reject(new Error('No se encontró el registro con ID: ' + id));
          return;
        }
        registro.estado = nuevoEstado;
        registro.fechaSincronizacion = Date.now();
        store.put(registro);
      };

      tx.oncomplete = function () { resolve(true); };
      tx.onerror    = function (event) { reject(event.target.error); };
    });
  });
}
