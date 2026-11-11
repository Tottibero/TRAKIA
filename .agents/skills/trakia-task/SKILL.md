---
name: trakia-task
description: "Implementa y verifica tareas HC de TRAKIA a partir de una especificación accesible, siguiendo la arquitectura del proyecto y preparando una entrega documentada. Invócala con $trakia-task HC-XX-YY."
---

# TRAKIA Task

Usa esta skill para ejecutar una tarea HC previamente especificada. La invocación es `$trakia-task HC-XX-YY`.

La skill no sustituye la especificación funcional. Si no se encuentra una especificación accesible, el identificador no basta para inferir requisitos. Si el objetivo, alcance o criterios son ambiguos, identifica qué falta antes de realizar cambios potencialmente incorrectos.

## Especificación HC

Valida el identificador con el formato `HC-XX-YY` (dos dígitos para bloque y tarea, con sufijo minúsculo opcional, por ejemplo `HC-01-03g` o `HC-01-05a`). El componente completo `YY` incluye el sufijo: obtén el bloque `HC-XX` y lee `docs/tasks/HC-XX/HC-XX-YY.md` conservándolo, por ejemplo `HC-01-05a` resuelve a `docs/tasks/HC-01/HC-01-05a.md`. Comprueba que contiene objetivo, alcance y criterios de aceptación; revisa también exclusiones, dependencias, archivos/módulos afectados y pruebas previstas, junto con `AGENTS.md` y las ADR aplicables.

Si el archivo no existe, comunica la ruta esperada y solicita la especificación aprobada. No infieras requisitos desde el identificador. Si la especificación es insuficiente o contradictoria, detalla qué falta y no hagas cambios potencialmente incorrectos. No actualices unilateralmente la sección **Especificación aprobada**: solicita revisión si hay que cambiar requisitos.

La plantilla única está en `docs/tasks/TEMPLATE.md`; el índice de cada bloque está en `docs/tasks/HC-XX/README.md`. Estados permitidos: `pendiente`, `en desarrollo`, `en revisión`, `completada` y `bloqueada`.

## Flujo de trabajo

### 1. Inspección inicial

- Lee `AGENTS.md` y las instrucciones aplicables del área.
- Comprueba la rama actual y el estado de Git; conserva los cambios preexistentes y evita sobrescribirlos.
- Localiza módulos, features y archivos afectados.
- Identifica sus dependencias y las decisiones arquitectónicas aplicables, en particular ADR-015 y `docs/architecture/module-conventions.md` cuando corresponda.
- Al comenzar una implementación válida, cambia el estado de la tarea a `en desarrollo`, sin editar su especificación aprobada.

### 2. Planificación

- Confirma objetivo, alcance, criterios de aceptación y verificaciones requeridas a partir de la especificación.
- Identifica los archivos previstos, dependencias y riesgos.
- No amplíes el alcance sin una justificación derivada de la tarea.

### 3. Implementación

- Aplica cambios mínimos y mantenibles, respetando la arquitectura documentada.
- Crea capas o abstracciones solo cuando una responsabilidad real lo justifique.
- Mantén separadas entidades y modelos internos, contratos externos y presentación.
- No introduzcas funcionalidades ajenas a la tarea.

### 4. Verificación

- Ejecuta verificaciones proporcionales a los cambios y a los criterios de aceptación.
- Informa por separado cuáles se ejecutaron y superaron, cuáles fallaron y cuáles se omitieron.
- No afirmes que una prueba pasó si no la ejecutaste; no ocultes errores ni limitaciones.
- Evita operaciones destructivas sobre datos. No elimines datos, bases ni volúmenes.

### 5. Documentación

- Registra en **Ejecución y resultados** un resumen, los archivos realmente modificados, verificaciones ejecutadas y sus resultados, desviaciones justificadas e incidencias/riesgos pendientes. Registra una referencia de commit cuando exista una forma limpia de hacerlo sin exigir un commit adicional; no inventes hashes.
- Aplica documentación proporcional: registra solo los requisitos, decisiones, convenciones y resultados relevantes para trazabilidad. No describas cada función ni reproduzcas diffs de Git; evita texto redundante o documentos adicionales sin responsabilidad clara.
- Al estar lista para valoración, cambia el estado a `en revisión`. Usa `bloqueada` solo ante un impedimento real. No marques automáticamente `completada`: requiere aceptación y las verificaciones acordadas.
- Actualiza `docs/progress.md` con el estado y enlace a la tarea cuando cambie el estado o complete trabajo relevante. Mantén allí solo el resumen global.
- Actualiza documentación técnica si cambian comportamientos o decisiones.
- No uses el README raíz para registrar progreso.
- Crea una ADR solo cuando exista una decisión arquitectónica que lo justifique.

### 6. Entrega

Presenta el informe estándar descrito abajo, de forma concisa y sin repetir información.
Añade la ruta de especificación utilizada, el estado final registrado y la documentación actualizada; no repitas el contenido HC.

## Informe estándar

1. **Resultado:** completada, parcial o bloqueada.
2. **Cambios:** archivos creados o modificados y resumen.
3. **Pruebas:** verificaciones ejecutadas y superadas, fallidas y omitidas.
4. **Arquitectura:** reglas relevantes, desviaciones y justificación.
5. **Riesgos:** limitaciones o problemas pendientes.
6. **Estado final:** Git y, cuando corresponda, Docker y PostgreSQL.

## Git y publicación

Esta skill no ejecuta por defecto commits, push, creación de PR, merge ni cambios de rama. Esas operaciones se gestionan mediante `trakia-git` y requieren autorización expresa aplicable a la operación. No invoques otra skill para operaciones Git sin solicitud del usuario.

## Docker y PostgreSQL

No inicies, detengas, reinicies ni reconstruyas servicios Docker por iniciativa propia como mantenimiento. Las verificaciones pueden usar un entorno ya disponible, respetando las instrucciones y permisos del proyecto. Si hace falta cambiar el estado del entorno, usa `trakia-docker` dentro del alcance autorizado. No elimines datos, bases ni volúmenes.

## Delegación

- **Tarea sencilla:** trabaja con el agente principal; no se requieren subagentes.
- **Tarea intermedia:** considera una revisión independiente solo si aporta valor.
- **Tarea compleja:** valora uno o dos subagentes para análisis, pruebas o revisión arquitectónica.

Considera delegar cuando haya cambios en varios módulos, integraciones externas complejas, persistencia o migraciones con riesgos relevantes, problemas difíciles de diagnosticar o necesidad de revisión independiente. Los subagentes revisores trabajan por defecto en solo lectura. No delegues operaciones Git, eliminación de datos ni acciones destructivas. Evita ediciones simultáneas de los mismos archivos. La indisponibilidad de subagentes no bloquea una tarea sencilla; no son obligatorios para las implementaciones.
