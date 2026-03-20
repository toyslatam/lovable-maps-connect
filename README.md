# GeoTrack - lovable-maps-connect

GeoTrack es una aplicacion web para gestionar establecimientos (localizacion, contactos y notas) y sincronizarlos con una hoja de Google Sheets a traves de una Supabase Edge Function.

## Funcionalidades
- Login protegido por rutas (frontend) y seccion de "Usuarios" solo para rol `admin` (demo).
- CRUD local de establecimientos en memoria (agregar/editar/eliminar).
- Importar/exportar establecimientos con Google Sheets:
  - `read`: lee filas desde la hoja y carga el estado del cliente.
  - `write`: limpia (mantiene encabezado) y reescribe el rango con los datos actuales.
- Envio de mensajes de WhatsApp desde el modulo de "Contactos".

## Estructura relevante
- `src/context/DataContext.tsx`: mantiene la lista de `establishments` y ejecuta `supabase.functions.invoke("google-sheets", ...)`.
- `supabase/functions/google-sheets/index.ts`: Edge Function que lee/escribe Google Sheets.
- `src/context/AuthContext.tsx`: autenticacion demo (usa `localStorage` + usuarios mock).
- `src/pages/*Module.tsx`: modulos de UI (Localizacion, Contactos, Conexiones, Usuarios).

## Flujo de sincronizacion (Google Sheets)
- Se invoca `supabase.functions.invoke("google-sheets")` con un body tipo:
  - `{ action: "read" }`
  - `{ action: "write", data: rows }`
- La Edge Function usa un Service Account de Google para generar un JWT y llamar a la API:
  - Lee el rango `A:G`
  - Para `write`:
    - limpia `A2:G`
    - asegura encabezado en `A1:G1`
    - escribe los datos en `A2:G{N}`

### Columnas esperadas en Sheets (A:G)
- `A`: name (Nombre)
- `B`: address (Direccion)
- `C`: latitude
- `D`: longitude
- `E`: phone
- `F`: contactName (Contacto)
- `G`: notes (Notas)

## Requisitos / Variables de entorno

### Variables para el frontend (archivo `.env`)
Este proyecto usa variables de entorno `VITE_*` para conectar con Supabase desde el cliente.

Ejemplos de nombres (valores se configuran en tu `.env`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID` (puede ser requerido por configuraciones/tooling)

> Nota: no agregues valores reales de credenciales a este README.

### Variables para la Edge Function (en Supabase)
La funcion `google-sheets` requiere:
- `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON de service account, como string)
- `GOOGLE_SHEET_ID` (ID de la hoja)

Estas variables se configuran en el entorno de Supabase para las Edge Functions (dashboard / settings).

## Seguridad (importante)
- La funcion `google-sheets` actualmente tiene `verify_jwt = false` en `supabase/config.toml`.
- Ademas, la CORS permite `Access-Control-Allow-Origin: *`.

Aunque el frontend tenga rutas protegidas, eso **no** protege la funcion por si sola. Si vas a exponer esto en produccion, es recomendable endurecer:
- verificacion JWT,
- autorizacion por rol,
- CORS restrictivo.

## Ejecutar localmente
1. Instalar dependencias:
   - `npm install`
2. Crear/ajustar `.env` con las variables `VITE_SUPABASE_*`.
3. Iniciar el servidor de desarrollo:
   - `npm run dev`

## Build y tests
- Build: `npm run build`
- Tests: `npm test`

## Credenciales de demo
En la pantalla de login (Auth demo):
- Admin: `admin@demo.com` / `admin123`
- Usuario: `user@demo.com` / `user123`
