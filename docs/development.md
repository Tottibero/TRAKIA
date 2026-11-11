# Desarrollo local

## Requisitos

- Node.js 26.13.0 (versión fijada en `.nvmrc`).
- pnpm 12.19.0 (versión fijada en `package.json`).
- Para Docker: Docker Engine con Compose v2 (o Compose integrado) y puertos locales 5173, 3033 y 5434 disponibles.

Activa la versión de Node.js del proyecto e instala las dependencias:

```sh
nvm use
pnpm --version
pnpm install
```

Si `nvm` no está cargado en la terminal que ejecuta los comandos, cárgalo explícitamente desde la raíz del repositorio antes de `nvm use`:

```sh
source "$HOME/.nvm/nvm.sh"
nvm use
node --version
```

`.nvmrc` fija Node.js 26.13.0, pero no cambia automáticamente la versión activa de shells o herramientas que no cargan `nvm`.

## Aplicaciones

Arranca cada aplicación en una terminal distinta:

```sh
pnpm dev:api
pnpm dev:web
```

La interfaz local está disponible en `http://localhost:5173`; la API escucha en `http://localhost:3033`. El endpoint de salud es `http://localhost:3033/api/health`.

La variable `PORT` cambia el puerto de la API; por defecto es `3033`. Los valores inválidos detienen el arranque con un error. `CORS_ORIGINS` acepta una lista explícita de orígenes HTTP(S) separados por comas y, por defecto, permite `http://localhost:5173`; no admite rutas ni comodines. `TRUSTED_PROXIES` admite IP, rangos CIDR o nombres de interfaz separados por comas y por defecto no confía en ningún proxy. Configura únicamente los proxies que controlas y asegúrate de que sustituyen `X-Forwarded-For` al recibir tráfico externo: Express deriva `request.ip` usando esa lista y el rate limit de login cuenta por esa IP.

Las operaciones que modifican estado requieren `Origin` permitido y `X-TRAKIA-CSRF: 1`, incluido login. Las llamadas sin `Origin` también se rechazan; clientes de servidor deben usar un origen permitido y el encabezado CSRF. CORS admite credenciales solo para los orígenes configurados y limita métodos y encabezados. Para producción, sirve web y API bajo un mismo origen visible con un proxy inverso (por ejemplo `/` hacia web y `/api` hacia la API); configura ese origen exacto en `CORS_ORIGINS` y el proxy de entrada en `TRUSTED_PROXIES`. TLS debe terminar en el proxy y este debe sobrescribir cabeceras reenviadas no confiables.

Vite conserva el prefijo `/api` y reenvía esas peticiones a `http://localhost:3033`. Por ejemplo, `http://localhost:5173/api/health` llega al endpoint de salud de la API.

## Compilación y comprobaciones

Los comandos raíz compilan primero el paquete compartido `@trakia/contracts`:

```sh
pnpm build
pnpm typecheck
pnpm test
```

Los comandos `pnpm dev:web` y `pnpm dev:api` también compilan los contratos al arrancar. Después de modificar fuentes en `packages/contracts/src`, vuelve a compilarlos con:

```sh
pnpm --filter @trakia/contracts build
```

Vite y Nest consumen los artefactos compilados del paquete compartido en `dist`.

## Desarrollo con Docker Compose

El Compose de desarrollo utiliza Node.js 26.13.0 y pnpm 12.19.0 dentro de los contenedores. PostgreSQL usa la imagen oficial `postgres:17.6-bookworm`. Los puertos publicados se limitan a `127.0.0.1`.

La primera vez, crea el archivo local ignorado por Git con credenciales exclusivamente de desarrollo:

```sh
cp .env.docker.example .env.docker
```

Inicia el entorno solo cuando vayas a trabajar en él:

```sh
docker compose up -d
```

Reconstruye las imágenes e inicia los servicios tras cambiar dependencias o Dockerfiles:

```sh
docker compose up -d --build
```

Consulta estado y logs:

```sh
docker compose ps
docker compose logs -f
```

Detén y elimina los contenedores y la red del proyecto conservando los datos de PostgreSQL:

```sh
docker compose down
```

No añadas `-v`: PostgreSQL guarda sus datos en el volumen nombrado `trakia_postgres_data`, que sobrevive a `stop`, `down` y a la reconstrucción de web/API.

Los servicios principales son `web`, `api` y `db`. El servicio interno `contracts` realiza la compilación inicial y vigila `packages/contracts/src`; web y API no arrancan hasta que existen los artefactos necesarios y PostgreSQL está saludable para la API. Nodemon reinicia Nest al cambiar `apps/api/src` o `packages/contracts/dist`. Vite ejecuta HMR sobre los archivos del host y su proxy `/api` usa `http://api:3033` dentro de Compose.

En desarrollo local sin Docker, `pnpm dev:web` y `pnpm dev:api` continúan usando `localhost`; Vite conserva el proxy local a `http://localhost:3033`. En Compose se montan las fuentes del workspace y volúmenes separados para los `node_modules` instalados en Docker, de modo que los enlaces workspace de pnpm y sus dependencias no se sustituyen por dependencias del host.

En Compose, la API arranca con `dev:docker` y `nest-cli.docker.json`; sus artefactos JavaScript y metadatos incrementales quedan bajo `apps/api/node_modules/.cache`, dentro del volumen `api_node_modules`. Las compilaciones del host usan `apps/api/dist` y `apps/api/tsconfig.build.tsbuildinfo`. No ejecutes el script `dev` de la API dentro de Docker porque utiliza las salidas del host.

### PostgreSQL y migraciones

La API requiere `DATABASE_URL`. En Compose apunta a `db:5432`; las credenciales proceden del mismo `.env.docker` que configura PostgreSQL (`POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD`). Desde el host PostgreSQL se publica únicamente en `127.0.0.1:5434`. Para ejecución local, proporciona la URL de la base de desarrollo por el entorno. `DATABASE_SSL` acepta `true` o `false`; por defecto TLS está desactivado en desarrollo y activado en `NODE_ENV=production`. TLS valida el certificado del servidor. `DATABASE_URL` puede incluir credenciales y no debe compartirse ni registrarse.

TypeORM no sincroniza ni modifica el esquema al iniciar la API. Las migraciones son explícitas y están versionadas en `apps/api/src/database/migrations`. Compila la API antes de usar sus comandos CLI:

```sh
pnpm --filter @trakia/api db:build
pnpm --filter @trakia/api db:migration:show
pnpm --filter @trakia/api db:migration:run
pnpm --filter @trakia/api db:migration:revert
pnpm --filter @trakia/api db:migration:generate --name=NombreMigracion
```

En Compose los scripts usan el artefacto aislado bajo `apps/api/node_modules/.cache/trakia-api-dist`; desde el monorepo local usan `apps/api/dist`. Por ejemplo, tras iniciar el entorno de desarrollo: `docker compose exec api pnpm --filter @trakia/api db:migration:show`. Para ejecutar una migración dentro del contenedor: `docker compose exec api pnpm --filter @trakia/api db:migration:run`. La generación requiere que PostgreSQL esté disponible y compara el esquema con las entidades compiladas.

En un despliegue, compila previamente JavaScript con `pnpm --filter @trakia/api build`, configura `DATABASE_URL` y ejecuta el script `db:migration:run` desde `apps/api` antes de iniciar el servidor. El comando CLI no inicia Nest ni requiere Compose; con migraciones pendientes las aplica y con estado actualizado termina correctamente.
