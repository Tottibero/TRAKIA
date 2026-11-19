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
- Todas las tareas HC siguen obligatoriamente `$trakia-task HC-XX-YY` → `$trakia-architecture check HC-XX-YY` → `$trakia-git commit HC-XX-YY`. La tarea implementa, verifica, documenta resultados y termina en `en revisión`; la auditoría independiente registra el resultado arquitectónico en la tarea. También es obligatoria para cambios exclusivamente documentales, donde puede concluir «sin impacto arquitectónico».
- La invocación explícita del propietario de `$trakia-git commit HC-XX-YY` constituye autorización y aceptación del cierre. Antes, comprueba implementación terminada, pruebas satisfactorias documentadas y auditoría arquitectónica registrada sin hallazgos bloqueantes; las recomendaciones no bloqueantes deben constar como aceptadas. Si falta evidencia, hay fallos pendientes o hallazgos bloqueantes, detente sin modificar archivos. Si cumple, registra la aceptación durante el cierre y sincroniza tarea, índice HC y progreso en el mismo commit local. La auditoría favorable por sí sola no aprueba la tarea.
- **Política específica de HC-03:** las pruebas locales satisfactorias y la auditoría arquitectónica independiente son obligatorias para cada tarea. El workflow remoto `quality` se ejecuta una sola vez, al finalizar HC-03 y antes del merge; no es requisito remoto por tarea. En los cierres individuales, documenta que `quality` queda diferido al cierre del bloque. Un fallo de `quality` bloquea el merge y requiere corregir y volver a verificar el bloque.
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

## Diseño frontend de TRAKIA

- Desde HC-03-07, aplica este flujo a tareas HC que cambien la interfaz o la experiencia de usuario; reutilízalo en los bloques posteriores que tengan alcance frontend. No se aplica a cambios exclusivamente de backend, contratos o infraestructura.
- Antes de implementar cambios visuales, consulta `DESIGN.md` y prepara una propuesta de la superficie afectada en una maqueta HTML/CSS aislada o una vista de demostración sin conexiones reales. Muestra los estados y tamaños móviles relevantes y registra las decisiones pendientes.
- No modifiques componentes productivos de una nueva pantalla o rediseño hasta que el propietario apruebe la propuesta visual correspondiente. La aprobación de la dirección global no sustituye la revisión de la superficie específica. Conserva los cambios de trabajo existentes durante esta pausa; no los reviertas como parte del proceso de diseño.
- Usa las cuatro skills de diseño de forma complementaria, respetando sus instrucciones propias y el alcance de la tarea. No sustituyen `trakia-task`, la auditoría de `trakia-architecture` ni las decisiones de ADR-015.
- Para nuevas superficies o decisiones visuales amplias, consulta `ui-ux-pro-max` con `--design-system`; para cambios acotados, usa solo las búsquedas de dominio o stack que resuelvan la cuestión concreta. Comprueba que los resultados encajan con TRAKIA antes de aplicarlos y no persistas propuestas sin validar.
- Usa `frontend-design` para convertir la dirección aprobada en una interfaz funcional, accesible, adaptable y coherente con la arquitectura existente.
- Recurre a `ui-design-system` cuando la tarea cree o cambie tokens, componentes compartidos o documentación de sistema. Parte de los tokens y componentes vigentes; no generes ni sustituyas un sistema paralelo preventivamente.
- Usa Impeccable para cargar el contexto visual y la guía de calidad aplicable, y para la revisión/refinamiento final. En refinamientos conserva la identidad existente fuera del alcance; cualquier rediseño debe estar autorizado por la tarea.
- Para HC-05-10, la propuesta del calendario está aprobada y su implementación se autorizó. El detalle de sesión requiere una aprobación visual específica antes de futuros rediseños, salvo autorización expresa del propietario para el cambio concreto.
- La inspección visual y las comprobaciones de calidad se ajustan a la superficie y al alcance definidos por la tarea. Las recomendaciones de las skills no amplían ese alcance ni prevalecen sobre requisitos, ADR o convenciones del repositorio.

## Arquitectura modular

- Para la organización de backend, frontend y contratos, sigue la decisión [ADR-015](docs/decisions/ADR-015-arquitectura-modular.md) y la guía obligatoria [module-conventions.md](docs/architecture/module-conventions.md).
- Antes de implementar una funcionalidad, identifica sus módulos/features propietarios y las dependencias que necesita; las dependencias entre módulos deben usar capacidades públicas exportadas explícitamente.
- Mantén la organización por funcionalidad y evita dependencias circulares.
- Crea capas solo cuando haya responsabilidades que justifiquen separarlas. No añadas carpetas vacías, interfaces genéricas, servicios base ni repositorios abstractos preventivamente.

## Entorno Docker de desarrollo

- Usa la skill `trakia-docker` como procedimiento preferente para gestionar Docker Compose. Docker solo se inicia cuando el usuario lo solicita; limita toda gestión al proyecto `trakia`, conserva los datos persistentes y no ejecutes limpiezas globales. La skill no realiza operaciones Git.
- Mantén aislados los artefactos de compilación de Docker y del host.
- En este entorno, los comandos lanzados dentro del sandbox pueden crear artefactos de workspace con UID/GID `65534` (`nobody:nogroup`). Ejecuta `pnpm build`, tests y `pnpm check` que escriban en `dist` con la identidad del usuario del host, fuera del sandbox; no cambies propietarios/permisos de forma global ni redirijas las builds como solución permanente.
- Opera los comandos Docker Compose únicamente sobre el proyecto TRAKIA (`compose.yaml`, nombre `trakia`).
- Inicia el entorno solo cuando el usuario lo solicite; no configures arranque automático.
- Antes de iniciar, reconstruir o detener, consulta `docker compose ps` y limita las acciones a los recursos de TRAKIA.
- Cuando se cree un endpoint nuevo en NestJS, comprueba que el contenedor API carga y registra la ruta y verifícala con una petición HTTP. Una respuesta `401` por falta de autenticación confirma que una ruta protegida existe; `404` no. Si hace falta, reinicia o reconstruye únicamente `api`, siguiendo la skill `trakia-docker`; no reinicies Docker por cambios en la lógica de un endpoint existente. No declares completado el endpoint hasta verificar su registro.
- Para apagar, usa `docker compose down` sin `-v`; el volumen PostgreSQL debe conservarse.
- No detengas servicios de otros proyectos ni ejecutes `docker system prune`, `docker volume prune` u otra limpieza global.
- No elimines el volumen PostgreSQL salvo autorización expresa.

## Migraciones PostgreSQL

- Toda tarea que añada migraciones debe aplicarlas primero en `trakia_test` mediante el procedimiento de integración existente y también en `trakia_dev` si son aditivas y no destructivas. Antes de ejecutar cada migración, comprueba con el mismo DataSource/comando que la ejecutará que `SELECT current_database()` devuelve exactamente la base autorizada. Revisa qué migraciones están pendientes.
- Confirma después que las migraciones figuran como aplicadas. Registra en la ficha HC la base efectiva y las migraciones aplicadas.
- Para `trakia_dev`, comprueba el estado de Compose del proyecto TRAKIA y ejecuta las migraciones versionadas de forma explícita (`db:migration:run`). No habilites `synchronize`/`dropSchema`, no reviertas migraciones ni limpies datos como parte de este paso.
- Mantén las pruebas de integración restringidas a `trakia_test`; nunca las apuntes a `trakia_dev`. No ejecutes migraciones en producción.
- Las migraciones destructivas o que modifiquen datos existentes requieren autorización expresa antes de ejecutarse.
- Si una base autorizada no está disponible o el destino efectivo no coincide, no ejecutes la migración ni cambies de base para sortear la comprobación; informa del bloqueo concreto.
