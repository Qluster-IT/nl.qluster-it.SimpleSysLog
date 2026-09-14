El nuevo y mejorado Simple (Sys) Log.

Esta aplicación permite agregar registros y/o notificaciones a tus Flows. Opcionalmente, un registro puede tener, además de su mensaje, una aplicación/grupo, gravedad e instalación.

También puedes conectarte a múltiples clientes Syslog para a) enviar mensajes específicos y b) hacer que todos los mensajes predeterminados (con ciertas gravedades) se envíen allí.

Y por último, pero no menos importante, puedes crear un dispositivo Servidor Syslog para que otros clientes Syslog se conecten a él, que se escribirá en el Simple (Sys) Log.

Esta nueva versión guarda los registros en archivos y no en memoria, permitiendo un registro mucho más grande que antes.

Hay una nueva página de Configuración, con una interfaz de tipo Syslog, en la que puedes:
* Rotar la pantalla para una mejor vista en un dispositivo móvil u otro dispositivo con pantalla apaisada.
* Buscar y filtrar mensajes específicos, fechas, etc.
* Ocultar o mover columnas.
* Guardar los filtros o columnas como predeterminados.
* Descargar el registro completo como Excel, Csv o JSON bien formateado, en la App Móvil, Herramientas de Desarrollo o dentro de flows.

API

Se pueden usar los siguientes puntos de conexión API:
- Obtener datos del registro:
  GET /api/app/nl.nielsdeklerk.log/
- Agregar datos al registro:
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST", "severity" : 6, "facility": 5, "timestamp":new Date() }
  * Solo el log es obligatorio, el resto es opcional.
- Limpiar registro:
  GET /api/app/nl.nielsdeklerk.log/clearlog

* Esta aplicación aún funciona como una aplicación independiente como solía hacerlo, sin embargo, para habilitar todas las funcionalidades y la nueva interfaz, se requiere instalar la Better Logic Library App.