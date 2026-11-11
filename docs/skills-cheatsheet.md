# TRAKIA — Cheatsheet de skills

Comandos disponibles para gestionar Git, Docker, tareas HC y revisiones arquitectónicas en TRAKIA.

## Git — trakia-git

| Comando | Acción |
|---|---|
| `$trakia-git start HC-02 exercise-catalog` | Inicia el bloque y prepara su rama. |
| `$trakia-git status` | Consulta el estado Git y de la PR asociada. |
| `$trakia-git commit HC-02-01` | Registra la tarea en un commit convencional. |
| `$trakia-git publish` | Publica la rama. |
| `$trakia-git pr` | Crea una PR para la rama publicada. |
| `$trakia-git finish` | Revisa y finaliza el bloque mediante su PR. |

## Docker — trakia-docker

Servicios admitidos: `web`, `api`, `contracts` y `db`.

| Comando | Acción |
|---|---|
| `$trakia-docker start` | Inicia el entorno TRAKIA. |
| `$trakia-docker stop` | Detiene el entorno y conserva sus volúmenes. |
| `$trakia-docker status` | Consulta el estado de los servicios. |
| `$trakia-docker logs api` | Muestra los últimos logs del servicio indicado. |
| `$trakia-docker restart web` | Reinicia el servicio indicado. |
| `$trakia-docker rebuild api` | Reconstruye el servicio indicado. |

`restart` y `rebuild` requieren servicio. `rebuild all` requiere solicitud explícita; `db` no es reconstruible porque usa `postgres:17.6-bookworm` sin imagen local.

## Tareas — trakia-task

| Comando | Acción |
|---|---|
| `$trakia-task HC-XX-YY` | Implementa y verifica una tarea HC especificada. |

## Arquitectura — trakia-architecture

| Comando | Acción |
|---|---|
| `$trakia-architecture check HC-XX-YY` | Revisa arquitectónicamente los cambios de la tarea. |
| `$trakia-architecture explain workouts` | Explica las convenciones de un módulo. |
| `$trakia-architecture audit apps/api` | Audita la arquitectura de una ruta. |

## Flujo habitual

```sh
$trakia-docker start
$trakia-task HC-02-01
$trakia-architecture check HC-02-01
$trakia-git commit HC-02-01
$trakia-docker stop
```
