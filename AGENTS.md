# Instrucciones para Codex

## GitHub y Git

- Sigue GitHub Flow por bloques funcionales `HC-XX`: una rama por bloque y una pull request por bloque, salvo entregas parciales acordadas.
- Usa preferentemente la skill local `trakia-git` para iniciar, consultar y cerrar el workflow Git/GitHub del proyecto.
- Usa Conventional Commits con el identificador de tarea, por ejemplo `feat(api): add exercise catalog [HC-02-01]`.
- GitHub CLI (`gh`) es obligatorio para las operaciones de GitHub: consultar repositorios, incidencias, solicitudes de cambios y estado de autenticación.
- Usa Git para las operaciones locales del repositorio y `git push` para publicar commits.
- No uses APIs directas ni métodos alternativos para publicar cambios en GitHub.
- `main` debe permanecer estable: integra bloques mediante pull request y no trabajes en ella para implementar tareas.
- La autorización para implementar una tarea y registrarla mediante commits permite crear esos commits locales dentro de su alcance. Publicar ramas y hacer merge requieren autorización explícita; una autorización no cubre otras ramas ni archivos.
- Conserva el historial remoto existente. No uses force push ni sobrescribas ramas remotas.

## Seguridad y privacidad

- No publiques secretos, credenciales, claves, archivos de entorno reales ni datos privados.
- Revisa los archivos que se van a preparar y los commits que se vayan a publicar antes de publicar.
- Mantén fuera del repositorio los archivos personales y ajenos al proyecto. No los borres como parte de una limpieza del repositorio.

## Diseño y alcance

- Respeta las decisiones registradas en `docs/decisions/` (ADR) y los límites definidos por las tareas HC.
- No implementes trabajo de tareas posteriores ni cambies una decisión arquitectónica sin que la tarea lo autorice.
- Actualiza `docs/progress.md` cuando una tarea HC cambie de estado o complete trabajo relevante.

## Entorno Docker de desarrollo

- Opera los comandos Docker Compose únicamente sobre el proyecto TRAKIA (`compose.yaml`, nombre `trakia`).
- Inicia el entorno solo cuando el usuario lo solicite; no configures arranque automático.
- Antes de iniciar, reconstruir o detener, consulta `docker compose ps` y limita las acciones a los recursos de TRAKIA.
- Para apagar, usa `docker compose down` sin `-v`; el volumen PostgreSQL debe conservarse.
- No detengas servicios de otros proyectos ni ejecutes `docker system prune`, `docker volume prune` u otra limpieza global.
- No elimines el volumen PostgreSQL salvo autorización expresa.
