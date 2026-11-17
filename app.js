if ('serviceWorker' in navigator) {

  navigator.serviceWorker.addEventListener('message', function (event) {
    if (event.data && event.data.tipo === 'OUTBOX_SINCRONIZADO') {
      console.log('[UI] Confirmación recibida del Service Worker. Actualizando bandeja...');
      renderizarColaOutbox();
    }
  });

  navigator.serviceWorker.register('./sw.js')
    .then(function (reg) {
      console.log('[SW] Service Worker registrado. Scope:', reg.scope);
    })
    .catch(function (error) {
      console.error('[SW] Error al registrar Service Worker:', error);
    });
}

var badgeRed = document.getElementById('badge-red');

function actualizarIndicadorRed() {
  if (navigator.onLine) {
    badgeRed.textContent = 'En Línea';
    badgeRed.className   = 'badge online';
  } else {
    badgeRed.textContent = 'Sin Conexión';
    badgeRed.className   = 'badge offline';
  }
}

actualizarIndicadorRed();

function renderizarColaOutbox() {
  return obtenerTodosLosRegistros()
    .then(function (registros) {
      var lista = document.getElementById('lista-outbox');
      lista.innerHTML = '';

      if (registros.length === 0) {
        lista.innerHTML = '<li class="vacio">No hay registros en la bandeja.</li>';
        return;
      }

      registros.forEach(function (item) {
        var li = document.createElement('li');
        var fecha = new Date(item.fechaCreacion);
        var horaFormateada = fecha.toLocaleString('es-MX', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        var claseEstado = item.estado === 'sincronizado' ? 'estado-sync' : 'estado-pend';

        li.innerHTML =
          '<div class="registro-info">' +
            '<strong>' + item.titulo + '</strong>' +
            '<p>' + (item.descripcion || '') + '</p>' +
            '<small>' + horaFormateada + '</small>' +
          '</div>' +
          '<span class="estado ' + claseEstado + '">' + item.estado + '</span>';

        lista.appendChild(li);
      });
    })
    .catch(function (error) {
      console.error('[UI] Error al renderizar la cola:', error);
    });
}

renderizarColaOutbox();

function procesarEnvioReporte(datosFormulario) {
  var endpoint = 'https://jsonplaceholder.typicode.com/posts';

  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datosFormulario)
  })
    .then(function (respuesta) {
      if (!respuesta.ok) throw new Error('Error HTTP del servidor');
      return respuesta.json();
    })
    .then(function () {
      
      return guardarRegistro({
        titulo:        datosFormulario.titulo,
        descripcion:   datosFormulario.descripcion,
        estado:        'sincronizado',
        fechaCreacion: Date.now()
      });
    })
    .catch(function () {
      console.warn('[Outbox] Sin conexión. Encolando en IndexedDB...');

      return guardarRegistro({
        titulo:        datosFormulario.titulo,
        descripcion:   datosFormulario.descripcion,
        estado:        'pendiente',
        fechaCreacion: Date.now()
      })
        .then(function () {
         
          if ('serviceWorker' in navigator && 'SyncManager' in window) {
            return navigator.serviceWorker.ready
              .then(function (registro) {
                console.log('[Outbox] Registrando etiqueta sync-reportes en el SW...');
                return registro.sync.register('sync-reportes');
              });
          }
        });
    })
    .then(function () {
     
      return renderizarColaOutbox();
    });
}

var formulario = document.getElementById('form-incidencia');

formulario.addEventListener('submit', function (e) {
  e.preventDefault();

  var campoTitulo      = document.getElementById('titulo');
  var campoDescripcion = document.getElementById('descripcion');

  var datos = {
    titulo:      campoTitulo.value.trim(),
    descripcion: campoDescripcion.value.trim()
  };

  procesarEnvioReporte(datos)
    .then(function () {
      formulario.reset();
    });
});

function sincronizarPendientesFallback() {
  console.log('[Outbox-Fallback] Conexión detectada. Buscando registros pendientes...');

  return obtenerTodosLosRegistros()
    .then(function (registros) {
      var pendientes = registros.filter(function (item) {
        return item.estado === 'pendiente';
      });

      if (pendientes.length === 0) {
        console.log('[Outbox-Fallback] No hay transacciones pendientes por sincronizar.');
        return;
      }

      var promesasDeEnvio = pendientes.map(function (item) {
        return fetch('https://jsonplaceholder.typicode.com/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: item.titulo, body: item.descripcion })
        })
          .then(function (res) {
            if (!res.ok) throw new Error('Falla al reintentar envío');
            return actualizarEstadoRegistro(item.id, 'sincronizado');
          });
      });

      return Promise.all(promesasDeEnvio);
    })
    .then(function () {
      return renderizarColaOutbox();
    })
    .catch(function (error) {
      console.error('[Outbox-Fallback] Error durante la sincronización masiva:', error);
    });
}

window.addEventListener('online', function () {
  actualizarIndicadorRed();

  if (!('SyncManager' in window)) {
    console.log('[Outbox] Navegador sin SyncManager. Ejecutando fallback por evento online...');
    sincronizarPendientesFallback();
  }
});

window.addEventListener('offline', actualizarIndicadorRed);

var btnPurgar = document.getElementById('btn-purgar');

btnPurgar.addEventListener('click', function () {
  obtenerTodosLosRegistros()
    .then(function (registros) {
      var sincronizados = registros.filter(function (item) {
        return item.estado === 'sincronizado';
      });

      if (sincronizados.length === 0) {
        console.log('[Outbox] No hay registros sincronizados para purgar.');
        return;
      }

      var promesasDeEliminacion = sincronizados.map(function (item) {
        return eliminarRegistro(item.id);
      });

      return Promise.all(promesasDeEliminacion);
    })
    .then(function () {
      return renderizarColaOutbox();
    })
    .catch(function (error) {
      console.error('[Outbox] Error al purgar registros:', error);
    });
});
