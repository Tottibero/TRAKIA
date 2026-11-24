# Railway — configuración y operación

Estado: despliegue operativo en Railway `production`, comprobado el 2026-11-24. Web, API y PostgreSQL están en línea; el único dominio público activo comprobado es `https://trakia.up.railway.app`. El propietario autorizó esta fase de pruebas sin backups; no se han configurado backups/PITR y deben habilitarse antes de ampliar el uso productivo.

## Topología

- **Web**: único servicio público, HTTPS, raíz del workspace `/`, Dockerfile `apps/web/Dockerfile`, puerto `$PORT`, variable `API_UPSTREAM=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` y healthcheck `/healthz`.
- **API**: servicio privado, raíz `/`, Dockerfile `apps/api/Dockerfile`, `PORT=3033`, healthcheck `/api/health`, sin dominio público.
- **PostgreSQL**: servicio privado con imagen `ghcr.io/railwayapp-templates/postgres-ssl:17.12` (PostgreSQL 17, tag minor fijado y verificado el 2026-11-24), volumen en `/var/lib/postgresql/data`, `PGDATA=/var/lib/postgresql/data/pgdata` y sin TCP Proxy público. Si se prepara el lanzamiento más adelante, comprobar que la etiqueta minor sigue publicada y elegir el parche 17.x vigente antes de crear el servicio.
- La web sirve el build Vite con fallback `/index.html`; `/api/...` conserva la ruta y se envía a `http://api.railway.internal:3033` dentro del mismo proyecto y entorno.

En Railway, configura raíz `/` para que el contexto Docker incluya `pnpm-lock.yaml`, `pnpm-workspace.yaml` y `packages/contracts`. En cada servicio establece su ruta de Dockerfile (web `apps/web/Dockerfile`, API `apps/api/Dockerfile`). Añade Watch Paths para cambios de la app, `packages/contracts/**`, manifests/lockfile y configuración del workspace.

### Resolución dinámica del upstream Nginx

Railway conserva el nombre privado `api.railway.internal`, pero una nueva instancia de API puede recibir otra IP. La imagen Nginx no debe resolver ese nombre únicamente al cargar la configuración: Nginx conservaría la dirección hasta reiniciar el servicio web.

La plantilla de producción toma los servidores DNS de `/etc/resolv.conf` en cada arranque. La imagen oficial `nginx-unprivileged` incluye `/docker-entrypoint.d/15-local-resolvers.envsh`; al habilitar `NGINX_ENTRYPOINT_LOCAL_RESOLVERS`, exporta las direcciones reales del contenedor como `NGINX_LOCAL_RESOLVERS`. Esto evita fijar `127.0.0.11` (resolver de una red Docker local) o cualquier IP de Railway en el repositorio.

El bloque Nginx configura `resolver ${NGINX_LOCAL_RESOLVERS} valid=10s ipv6=on` y usa `proxy_pass` con una variable que contiene `API_UPSTREAM`. Nginx consulta de nuevo DNS al vencer esos 10 segundos y la ruta `/api/...` y su query string se mantienen. El upstream continúa usando la referencia privada y el puerto configurados en Railway.

Durante la ventana de caché tras un cambio de IP, una petición puede fallar antes de que la caché venza; la siguiente resolución permite que Nginx alcance la instancia nueva sin redesplegar la web. Esta configuración no añade health checks activos de upstream ni reintenta datos de escritura; los clientes deben seguir tratando una respuesta fallida como no guardada. El smoke local cambia el destino de un alias DNS manteniendo Nginx activo, pero no sustituye un redespliegue de validación en Railway.

Fuentes técnicas: [Railway private DNS](https://docs.railway.com/networking/domains/working-with-domains), [Railway private networking](https://docs.railway.com/networking/private-networking/how-it-works), [Nginx resolver](https://nginx.org/en/docs/http/ngx_http_core_module.html#resolver), [Nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass) y [entrypoint oficial de la imagen Nginx](https://github.com/nginx/docker-nginx/blob/master/entrypoint/15-local-resolvers.envsh).

La imagen de producción debe usar Node `26.13.0` y pnpm `12.19.0`; son las versiones exigidas por `package.json`. El runtime API es una imagen Node separada; la web usa `nginx/nginx-unprivileged:1.31.10-alpine`, fijada también al digest `sha256:86628f2c9eaa5e84e3b98d25e26563c4a4f9b0ead9cf5656da4731d86e0621de`. Confirmar una versión parcheada vigente y actualizar tag/digest al configurar el lanzamiento. `compose.yaml` y los `Dockerfile.dev` siguen reservados al desarrollo.

## Variables

Configura en el servicio **API**:

| Variable | Valor/fuente |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3033`, igual al upstream privado configurado en Nginx |
| `DATABASE_URL` | Referencia Railway `${{postgres.DATABASE_URL}}`; confirmar que el valor resuelto usa el host privado `postgres.railway.internal`, no `DATABASE_PUBLIC_URL` ni un TCP Proxy |
| `DATABASE_SSL` | `false`; compatible únicamente con la topología privada descrita en «TLS PostgreSQL». No ofrece autenticación TLS del servidor |
| `JWT_SECRET` | Secreto aleatorio de al menos 32 bytes creado en el gestor de variables Railway; nunca incluir en repositorio o logs |
| `CORS_ORIGINS` | Origen HTTPS público exacto de la web, por ejemplo `https://<dominio>`, sin ruta ni `/` final |
| `TRUSTED_PROXIES` | `1`: solo el salto Nginx. La API no debe tener ingreso público; el proxy escribe `X-Forwarded-For` desde el `X-Real-IP` que Railway entrega en el ingreso público |

La web no necesita secretos ni `VITE_API_PROXY_TARGET`; su proxy de producción es Nginx. Railway inyecta `PORT` al servicio web y el template lo usa para el listener no privilegiado. `API_UPSTREAM` se configura como variable de referencia al dominio/puerto privado del servicio API para no compilar ni fijar DNS de otro entorno en los assets.

### Variables de PostgreSQL

En el servicio llamado `postgres`, fija la imagen anterior, el volumen y `PGDATA`, y genera `POSTGRES_PASSWORD` desde el gestor de secretos de Railway. Configura `POSTGRES_DB=trakia` y `POSTGRES_USER=trakia_app`; no copies valores reales al repositorio. La imagen/servicio debe exponer `DATABASE_URL` con el host interno para que la referencia de API sea `${{postgres.DATABASE_URL}}`. Si el valor generado apunta a una URL pública, no la uses: construye/elige la URL privada en la configuración de Railway y verifica su host antes de conectar. No habilites TCP Proxy ni `DATABASE_PUBLIC_URL` para la aplicación.

La cookie de producción ya es `__Host-trakia_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`; las operaciones de escritura requieren `Origin` permitido y `X-TRAKIA-CSRF: 1`. El acceso web/API comparte origen y evita CORS cruzado en el navegador. Mantén el API sin dominio público para que el único salto de confianza sea el proxy web.

### TLS PostgreSQL

La imagen oficial `postgres-ssl` de Railway genera una CA y un certificado de servidor autofirmados al inicializar PostgreSQL; el SAN incluye el hostname privado Railway cuando está disponible. TypeORM en TRAKIA usa `rejectUnauthorized: true` y no recibe esa CA mediante la configuración actual, así que `DATABASE_SSL=true` no confía en el certificado generado. No se debe desactivar `rejectUnauthorized` para forzarlo.

Para el despliegue inicial, `DATABASE_SSL=false` es compatible con la infraestructura elegida solo si API y PostgreSQL permanecen en el mismo entorno privado Railway y PostgreSQL no publica TCP Proxy. El tráfico entre servicios se cifra con los túneles WireGuard de Railway, pero al desactivar TLS PostgreSQL **el cliente no autentica el certificado ni la identidad TLS del servidor**. La confianza se limita al aislamiento y DNS interno de Railway; no es equivalente a TLS autenticado de extremo a extremo. Si se exige esa autenticación, crear una tarea para transportar/confiar en la CA y validar el hostname con `rejectUnauthorized: true` antes de producción.

## Health, reinicios y logs

- Configura healthcheck de Railway en web `/healthz` y API `/api/health`, con periodo de gracia suficiente para cargar NestJS. La API actual devuelve `status: ok` y no comprueba PostgreSQL; esto verifica proceso/ruta, no readiness de base.
- Railway usa el healthcheck durante el despliegue, no como monitorización continua. Configura límites/reinicio de servicio y alertas de disponibilidad/coste por separado.
- No imprimir entorno, `DATABASE_URL`, cookies, JWT, credenciales ni datos de usuarios. Revisa logs de salida ante cada despliegue y confirma errores sin volcar configuración.

## PostgreSQL, backups y migraciones

Antes del primer uso productivo:

1. Selecciona PostgreSQL 17 con la imagen fijada `ghcr.io/railwayapp-templates/postgres-ssl:17.12` (o el parche 17.x vigente que se confirme al configurar), monta un volumen persistente en `/var/lib/postgresql/data` y fija `PGDATA=/var/lib/postgresql/data/pgdata`. Confirma tamaño y plan; no habilites TCP Proxy. Railway documenta ese mount path para Postgres.
2. Habilita backups programados o PITR en el plan/servicio elegido y verifica que hay una copia recuperable antes de tocar esquema. Registra retención y propietario de restauración.
3. Comprueba en Railway que `DATABASE_URL` referencia el servicio privado correcto. No derives producción desde `.env.docker` ni desde `trakia_dev`/`trakia_test`.
4. Tras desplegar la imagen API, abre una sesión segura con `railway ssh --service api`, entra en `/app` y verifica la base efectiva antes de mostrar o ejecutar migraciones:

   ```sh
   node --input-type=module -e 'import ds from "./dist/database/data-source.js"; await ds.initialize(); try { const rows = await ds.query("SELECT current_database() AS name"); console.log(rows[0].name) } finally { await ds.destroy() }'
   ./node_modules/.bin/typeorm migration:show -d dist/database/data-source.js
   ```

   Compara el nombre devuelto con el nombre esperado visible en la configuración de Railway. Si falta URL, host o base no coincide, detente.
5. Con copia restaurable confirmada y revisión de pendientes, ejecutar explícitamente `./node_modules/.bin/typeorm migration:run -d dist/database/data-source.js` desde la sesión API. No configures `preDeployCommand` ni `migrationsRun`: las migraciones no deben ejecutarse automáticamente en cada release.
6. Vuelve a ejecutar `migration:show`, comprueba health y smoke autenticado. Si una migración falla, detén el despliegue y sigue el plan de recuperación/restore; no reviertas a ciegas ni edites la base manualmente.

Para el usuario inicial, después de aplicar y comprobar las migraciones, en una sesión interactiva segura de API ejecuta `node scripts/auth-admin.mjs bootstrap`. El script pide email y contraseña oculta, solo permite crear el primer usuario y no imprime la contraseña. No pases secretos como argumentos ni variables de build. Los resets posteriores requieren el procedimiento administrativo ya existente.

## Coste y persistencia

No se estima importe mensual sin plan, región, recursos, disco, transferencia y patrón de uso elegidos. Selecciona límites/replicas razonables, supervisa uso y coste, deja margen para picos y verifica los límites del plan antes de aceptar tráfico. Railway factura según plan y recursos; el egress y acceso público al Postgres añaden coste que esta topología privada evita. La disponibilidad, backups/PITR, retención y precio dependen del plan concreto.

## Smoke tras despliegue autorizado

Comprobado el 2026-11-24: HTTPS del dominio definitivo, `/healthz` HTTP 200, `/api/health` HTTP 200 vía proxy con `{"status":"ok"}`, tres servicios Railway en línea, base `trakia`, 17 migraciones aplicadas, ninguna pendiente y usuario inicial existente. Estos checks no prueban autenticación, cookie, CSRF, persistencia de una sesión deportiva ni readiness de PostgreSQL.

Pendiente: prueba autenticada de cookies/CSRF y flujo deportivo; comprobar la recuperación de datos; desplegar las correcciones locales HC-06-04 y HC-06-03 mediante una publicación autorizada; prueba manual de instalación Android/iOS por el propietario; habilitar y verificar backups/PITR antes de aceptar uso fuera de la fase temporal de pruebas.

## Estado de la auditoría (2026-11-24)

Railway CLI confirmó web, API y PostgreSQL en línea en `production`, con `https://trakia.up.railway.app` como dominio web activo. Se comprobó `current_database() = trakia`, se aplicaron una vez las 17 migraciones esperadas y no quedan pendientes; el bootstrap inicial se completó y existe un usuario. `/healthz` y `/api/health` devolvieron 200. No se consultó ni imprimió `DATABASE_URL`, JWT o credenciales.

El propietario indicó Railway Limited Trial. La documentación del plan declara red saliente restringida y puertos limitados para Limited Trial, además de límites de trial (1 GB RAM por servicio, CPU compartida, máximo de cinco servicios por proyecto y volumen máximo de 0.5 GB). El trial incluye un crédito único de $5 que vence a los 30 días o al agotarse; Railway conserva el volumen 30 días tras expirar los créditos. Verifica los límites vigentes de la cuenta antes de ampliar uso.

Backups/PITR siguen sin configurar por la autorización temporal del propietario para probar sin backups; no se declara que esta salvaguarda esté cumplida. La rama de HC-06 incorpora localmente la resolución DNS dinámica de HC-06-04 y la PWA mínima de HC-06-03, pero no se ha desplegado en Railway: el entorno público existente aún no tiene confirmada esta versión. El worker de la rama cachea shell/assets estáticos, no rutas `/api`, y muestra el estado offline sin guardar resultados; la instalación aún requiere verificación manual del propietario en el dominio definitivo. El health endpoint de API verifica proceso/ruta, no readiness continua de PostgreSQL.

Fuentes oficiales consultadas:

- [Railway monorepos](https://docs.railway.com/deployments/monorepo)
- [Railway private networking](https://docs.railway.com/networking/private-networking/how-it-works)
- [Railway public networking headers](https://docs.railway.com/networking/public-networking/specs-and-limits)
- [Railway healthchecks](https://docs.railway.com/deployments/healthchecks)
- [Railway PostgreSQL](https://docs.railway.com/databases/postgresql)
- [Railway construir un servicio de base de datos y volumen Postgres](https://docs.railway.com/databases/build-a-database-service)
- [Railway usar volúmenes](https://docs.railway.com/volumes)
- [Railway backups/PITR](https://docs.railway.com/volumes/point-in-time-recovery)
- [Railway pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command)
- [Railway cost control](https://docs.railway.com/pricing/cost-control)
- [Railway Free Trial y Limited Trial](https://docs.railway.com/pricing/free-trial)
- [Postgres SSL image del template Railway: tags de PostgreSQL 17](https://github.com/railwayapp-templates/postgres-ssl/pkgs/container/postgres-ssl)
- [Generación de certificados autofirmados del template Postgres SSL](https://github.com/railwayapp-templates/postgres-ssl/blob/main/init-ssl.sh)
- [Tags oficiales de NGINX unprivileged](https://github.com/nginx/docker-nginx-unprivileged/pkgs/container/nginx-unprivileged/versions)
- [pnpm deploy](https://pnpm.io/cli/deploy)
- [Node.js 26.13.0](https://nodejs.org/en/blog/release/v26.13.0)
