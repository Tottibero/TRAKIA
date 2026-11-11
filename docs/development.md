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

## Aplicaciones

Arranca cada aplicación en una terminal distinta:

```sh
pnpm dev:api
pnpm dev:web
```

La interfaz local está disponible en `http://localhost:5173`; la API escucha en `http://localhost:3033`. El endpoint de salud es `http://localhost:3033/api/health`.

La variable `PORT` cambia el puerto de la API; por defecto es `3033`. Los valores inválidos detienen el arranque con un error. `CORS_ORIGINS` acepta una lista de orígenes separada por comas y, por defecto, permite `http://localhost:5173`.

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

Los tres servicios principales son `web`, `api` y `db`. El servicio interno `contracts` realiza la compilación inicial y vigila `packages/contracts/src`; web y API no arrancan hasta que existe el artefacto ESM inicial. Nodemon reinicia Nest al cambiar `apps/api/src` o `packages/contracts/dist`. Vite ejecuta HMR sobre los archivos del host y su proxy `/api` usa `http://api:3033` dentro de Compose. API no depende del arranque de PostgreSQL porque todavía no consume la base de datos; esa integración corresponde a HC-01-03b.

En desarrollo local sin Docker, `pnpm dev:web` y `pnpm dev:api` continúan usando `localhost`; Vite conserva el proxy local a `http://localhost:3033`. En Compose se montan las fuentes del workspace y volúmenes separados para los `node_modules` instalados en Docker, de modo que los enlaces workspace de pnpm y sus dependencias no se sustituyen por dependencias del host.
