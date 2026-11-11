---
name: trakia-docker
description: "Gestiona de forma segura el entorno Docker Compose local del proyecto TRAKIA. Invócala explícitamente con $trakia-docker <start|stop|status|logs|restart|rebuild> [web|api|contracts|db|all]; no gestiona otros proyectos ni operaciones Git."
---

# TRAKIA Docker

Actúa solo ante una invocación explícita `$trakia-docker <operación> [servicio]`. Acepta `start`, `stop`, `status`, `logs`, `restart` y `rebuild`. Los únicos servicios son `web`, `api`, `contracts` y `db`. Si `restart` o `rebuild` no reciben servicio, muestra esas opciones y no ejecutes nada. `rebuild all` requiere que el usuario lo solicite literalmente. Rechaza nombres arbitrarios, operaciones distintas y objetivos ambiguos.

## Identificar el proyecto

Antes de operar, localiza la raíz del repositorio TRAKIA y confirma que contiene `compose.yaml` con `name: trakia` y los cuatro servicios admitidos. Ejecuta Docker Compose siempre con ese archivo y el nombre de proyecto explícitos, por ejemplo desde la raíz:

```sh
docker compose --project-name trakia --file /ruta/absoluta/TRAKIA/compose.yaml ps --all
```

Resuelve la ruta absoluta desde la raíz hallada, no desde el directorio de llamada. Usa siempre la combinación de archivo y proyecto validada en cada comando. No uses coincidencias parciales, IDs de contenedor ni comandos globales para descubrir o gestionar recursos. Si no puedes verificar inequívocamente la raíz, el nombre del proyecto, los servicios o el daemon, detente e informa el motivo. No incluyas valores de `.env.docker` en salidas: Compose carga ese `env_file` desde la ubicación del Compose. Verifica su existencia y validez mediante Compose sin imprimir su contenido; no crees ni edites archivos de entorno.

No ejecutes Docker automáticamente por estar en el repositorio: el usuario debe solicitar la operación. Nunca ejecutes migraciones ni comandos Git desde esta skill.

## Operaciones

### `start`

1. Comprueba que Docker CLI y Compose están disponibles, que el daemon responde, que el Compose del proyecto valida y que `.env.docker` está presente y contiene las variables requeridas, sin mostrar sus valores. Si falla cualquiera, detente con un diagnóstico seguro.
2. Consulta `ps --all` del proyecto antes de iniciar. Si los cuatro servicios ya están funcionando y saludables, informa que ya está iniciado y no hagas cambios.
3. Inicia con `docker compose ... up --detach --wait`, sin `--build`. Compose debe poder crear sus volúmenes Docker sin depender de directorios `dist` del host. No ejecutes migraciones ni edites configuración.
4. Consulta el estado y los healthchecks de los cuatro servicios. Informa cuáles quedaron saludables, cuáles siguen iniciando o fallaron y, cuando proceda, sugiere consultar sus logs.

### `stop`

Valida el proyecto y consulta `ps --all`. Detén únicamente este proyecto usando `docker compose ... down`, sin `-v`, `--rmi` ni limpieza. Conserva todos los volúmenes, especialmente `trakia_postgres_data`. Que ya esté detenido es un resultado correcto. Informa el estado final.

### `status`

Consulta el estado real con Compose (`ps --all`) sin iniciar, detener, reiniciar ni modificar recursos. Presenta para cada servicio su estado de contenedor, healthcheck (o indica que no tiene), puertos publicados y observaciones. Distingue no creado, detenido, en ejecución, healthy, starting y unhealthy; `running` no significa `healthy`. No inventes salud cuando Compose no la informa.

### `logs <servicio>`

Exige y valida uno de los cuatro servicios; si falta, muestra las opciones válidas. Usa `docker compose ... logs --tail 100 <servicio>` sin seguimiento continuo. Si no existe o aún no tiene logs, dilo claramente. Inspecciona la salida antes de presentarla: omite fragmentos dudosos y oculta credenciales, tokens, contraseñas y URLs sensibles. No afirmes que un filtro garantiza que cualquier log sea seguro. No guardes logs en el repositorio.

### `restart <servicio>`

Exige y valida un servicio. Consulta su estado primero. Si está detenido o no creado, informa y recomienda `start`; no lo inicies implícitamente. Si existe y está en ejecución, reinicia solo el servicio indicado con Compose y verifica su estado posterior. Aclara que `restart` no reconstruye imágenes ni aplica todos los cambios de configuración; recomienda `rebuild` si el cambio requiere reconstrucción, sin ejecutarlo.

### `rebuild <servicio|all>`

Exige un servicio válido. Para `all`, exige una solicitud explícita de reconstruir todo el entorno; reconstruye solo los servicios con `build` en el Compose validado (`contracts`, `web`, `api` en la configuración actual). Comprueba `ps --all` antes de cualquier cambio e informa qué servicios/dependencias podrían recrearse antes de aplicarlo. Construye solo los objetivos seleccionados y aplica sus imágenes mediante Compose respetando `depends_on`; evita recrear PostgreSQL por cambios de web/API y no fuerces la recreación de dependencias en ejecución. Si no puedes mantener ese alcance, detente y explica el impacto antes de cambiar recursos. `db` no tiene `build`: recházalo como objetivo reconstruible e indica que usa `postgres:17.6-bookworm`. Conserva volúmenes y verifica los estados posteriores. No uses `down -v`, no elimines imágenes ni volúmenes.

## Límites obligatorios

- Limita cada operación a `--project-name trakia` y al `compose.yaml` verificado de TRAKIA.
- No gestiones contenedores de otros proyectos ni aceptes identificadores arbitrarios.
- No ejecutes `docker compose down -v`, `docker compose down --rmi`, `docker volume prune`, `docker system prune`, `docker container prune` ni `docker image prune`.
- No elimines volúmenes ni datos de PostgreSQL, ni alteres la configuración global del daemon.
- No modifiques archivos `.env`, código fuente o configuración para resolver fallos; no ejecutes migraciones.
- No muestres secretos deliberadamente, no guardes logs y no ejecutes comandos destructivos no solicitados.
- No inicies servicios automáticamente fuera de `start`, ni ejecutes operaciones distintas de la invocada.
- Si el fallo queda fuera de este alcance, conserva el estado y propone una tarea específica.

## Informe

Resume la operación solicitada, alcance validado, resultado observado y estado/healthchecks relevantes. Identifica con claridad cualquier paso omitido, error de permisos, servicio no disponible o comprobación que no pudo realizarse; nunca presentes una acción no ejecutada como verificada.
