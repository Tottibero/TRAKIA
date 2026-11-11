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
- `$trakia-git commit HC-XX-YY` cierra también el estado documental solo si la tarea tiene aprobación y evidencias de revisión y pruebas registradas; entonces sincroniza tarea, índice HC y progreso en el mismo commit. Invocar el comando no equivale a aprobar una tarea.
- Conserva el historial remoto existente. No uses force push ni sobrescribas ramas remotas.

## Seguridad y privacidad

- No publiques secretos, credenciales, claves, archivos de entorno reales ni datos privados.
- Revisa los archivos que se van a preparar y los commits que se vayan a publicar antes de publicar.
- Mantén fuera del repositorio los archivos personales y ajenos al proyecto. No los borres como parte de una limpieza del repositorio.

## Diseño y alcance

- Respeta las decisiones registradas en `docs/decisions/` (ADR) y los límites definidos por las tareas HC.
- No implementes trabajo de tareas posteriores ni cambies una decisión arquitectónica sin que la tarea lo autorice.
- Actualiza `docs/progress.md` cuando una tarea HC cambie de estado o complete trabajo relevante.

## Documentación

- Cada documento tiene una responsabilidad principal; consulta el [índice documental](docs/README.md) para encontrar arquitectura, ADR, desarrollo, tareas, progreso y cheatsheet.
- Registra decisiones arquitectónicas en ADR y convenciones técnicas en guías. No modifiques decisiones aprobadas sin autorización.
- Registra requisitos y aceptación en `docs/tasks/HC-XX/HC-XX-YY.md`, usando [la plantilla](docs/tasks/TEMPLATE.md); registra los resultados junto a la tarea.
- Mantén `docs/progress.md` como resumen navegable, sin especificaciones ni informes extensos.
- Mantén los comandos de skills sincronizados en `docs/skills-cheatsheet.md` y prefiere enlaces relativos a duplicar contenido.
- No crees documentos innecesarios ni reescribas requisitos aprobados sin autorización.
- Aplica documentación proporcional: registra solo requisitos, decisiones, convenciones y resultados relevantes. No describas cada función, reproduzcas diffs de Git ni crees Markdown sin una responsabilidad clara.
- No uses el README raíz para registrar progreso interno. Actualiza las rutas y enlaces cuando se mueva documentación.

## Skills de TRAKIA

- Las tareas HC siguen el procedimiento de [.agents/skills/trakia-task/SKILL.md](.agents/skills/trakia-task/SKILL.md).
- Las revisiones arquitectónicas utilizan ADR-015 y [module-conventions.md](docs/architecture/module-conventions.md), según [.agents/skills/trakia-architecture/SKILL.md](.agents/skills/trakia-architecture/SKILL.md).
- Mantén sincronizados los comandos de las skills con [docs/skills-cheatsheet.md](docs/skills-cheatsheet.md).
- Las operaciones Git siguen gestionándose mediante `trakia-git`; las operaciones Docker, mediante `trakia-docker`.

## Arquitectura modular

- Para la organización de backend, frontend y contratos, sigue la decisión [ADR-015](docs/decisions/ADR-015-arquitectura-modular.md) y la guía obligatoria [module-conventions.md](docs/architecture/module-conventions.md).
- Antes de implementar una funcionalidad, identifica sus módulos/features propietarios y las dependencias que necesita; las dependencias entre módulos deben usar capacidades públicas exportadas explícitamente.
- Mantén la organización por funcionalidad y evita dependencias circulares.
- Crea capas solo cuando haya responsabilidades que justifiquen separarlas. No añadas carpetas vacías, interfaces genéricas, servicios base ni repositorios abstractos preventivamente.

## Entorno Docker de desarrollo

- Usa la skill `trakia-docker` como procedimiento preferente para gestionar Docker Compose. Docker solo se inicia cuando el usuario lo solicita; limita toda gestión al proyecto `trakia`, conserva los datos persistentes y no ejecutes limpiezas globales. La skill no realiza operaciones Git.
- Mantén aislados los artefactos de compilación de Docker y del host.
- Opera los comandos Docker Compose únicamente sobre el proyecto TRAKIA (`compose.yaml`, nombre `trakia`).
- Inicia el entorno solo cuando el usuario lo solicite; no configures arranque automático.
- Antes de iniciar, reconstruir o detener, consulta `docker compose ps` y limita las acciones a los recursos de TRAKIA.
- Para apagar, usa `docker compose down` sin `-v`; el volumen PostgreSQL debe conservarse.
- No detengas servicios de otros proyectos ni ejecutes `docker system prune`, `docker volume prune` u otra limpieza global.
- No elimines el volumen PostgreSQL salvo autorización expresa.
