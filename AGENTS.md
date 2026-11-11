# Instrucciones para Codex

## GitHub y Git

- GitHub CLI (`gh`) es obligatorio para las operaciones de GitHub: consultar repositorios, incidencias, solicitudes de cambios y estado de autenticación.
- Usa Git para las operaciones locales del repositorio y `git push` para publicar commits.
- No uses APIs directas ni métodos alternativos para publicar cambios en GitHub.
- Los commits y los `git push` requieren autorización explícita dentro del alcance de la tarea activa. La autorización de una tarea se limita al repositorio, rama y archivos que esta indique.
- Conserva el historial remoto existente. No uses `--force` ni sobrescribas ramas remotas.

## Seguridad y privacidad

- No publiques secretos, credenciales, claves, archivos de entorno reales ni datos privados.
- Revisa los archivos que se van a preparar y los commits que se vayan a publicar antes de publicar.
- Mantén fuera del repositorio los archivos personales y ajenos al proyecto. No los borres como parte de una limpieza del repositorio.

## Diseño y alcance

- Respeta las decisiones registradas en `docs/decisions/` (ADR) y los límites definidos por las tareas HC.
- No implementes trabajo de tareas posteriores ni cambies una decisión arquitectónica sin que la tarea lo autorice.
- Actualiza `docs/progress.md` cuando una tarea HC cambie de estado o complete trabajo relevante.
