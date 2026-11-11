---
name: trakia-git
description: "Gestiona el workflow Git y GitHub de TRAKIA por bloques HC: ramas, estado, commits convencionales, publicación, pull requests y cierre. Invócala explícitamente con $trakia-git o úsala para tareas de Git/GitHub de este repositorio."
---

# TRAKIA Git y GitHub

Aplica GitHub Flow adaptado a bloques funcionales `HC-XX`: una rama por bloque y una pull request por bloque, salvo que se acuerden entregas parciales. `main` debe mantenerse estable. Usa Git para el trabajo local y `gh` para todas las operaciones de GitHub, incluidas autenticación, consultas de PR y creación o merge de PR. No uses APIs directas, scripts HTTP ni clientes alternativos.

Interpreta el modo solicitado (`start`, `status`, `commit`, `publish`, `pr` o `finish`) y confirma el repositorio antes de actuar. No amplíes el alcance indicado por la tarea. Respeta la identidad Git local y nunca incluyas tokens o contraseñas en comandos.

## start — iniciar un bloque

Uso: `$trakia-git start HC-02 exercise-catalog`.

1. Comprueba raíz del repositorio, rama actual, `git status`, ramas locales y remotas, remoto `origin` y diferencias de la rama principal con `origin`; actualiza las referencias remotas con `git fetch origin` cuando sea posible.
2. Identifica la rama principal desde `origin/HEAD` o la configuración del repositorio y confirma su estado de sincronización. Si la principal local está detrás y el árbol está limpio, puede avanzar mediante fast-forward; si hay cambios locales o divergencia, conserva todo y detente para informar. Si no se puede verificar el remoto, informa y no supongas que está actualizado.
3. Valida el bloque como `HC-` seguido de dos dígitos y crea el nombre en minúsculas con guiones: `tipo/hc-xx-descripcion`. Usa un tipo coherente (`feat`, `fix` o `chore`, por ejemplo) y un slug sin espacios ni caracteres especiales. Ejemplos: `chore/hc-01-infrastructure`, `feat/hc-02-exercise-catalog`, `feat/hc-03-training-plans`, `fix/hc-05-workout-execution`.
4. Antes de cambiar de rama, inspecciona cambios staged, unstaged y no rastreados, y evalúa si pertenecen al bloque solicitado. Si hay cambios ajenos, ambiguos o que podrían verse afectados, detente y explica el conflicto. No uses automáticamente `stash`, `reset`, `clean` ni sobrescribas archivos.
5. Si la rama ya existe, inspecciónala y confirma que corresponde al bloque y que cambiar a ella conserva los cambios. Si no existe, créala desde la principal verificada manteniendo intacto el árbol de trabajo. No cambies de rama si hacerlo amenaza cambios locales.

## status — consultar el estado

Informa la rama actual, estado del árbol, cambios staged/unstaged/no rastreados, relación de commits con el remoto y commits locales sin publicar. Usa `gh` para comprobar si hay una PR asociada y resumir su estado, destino y checks disponibles. Si no existe PR o falla una consulta, indícalo con claridad; no publiques nada.

## commit — registrar una tarea

Formato: `type(scope): description [HC-XX-YY]`; scope opcional. Tipos permitidos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`. Valida el identificador como `HC-` + dos dígitos de bloque + `-` + dos dígitos de tarea y, opcionalmente, una letra minúscula (por ejemplo, `HC-01-03d`). Usa una descripción breve y específica. Ejemplos:

- `chore(docker): configure development environment [HC-01-03a]`
- `feat(api): integrate typeorm [HC-01-03b]`
- `test(api): verify database migrations [HC-01-03b]`
- `docs: update development instructions [HC-01-03b]`

Antes de cada commit, revisa el diff y los archivos afectados; comprueba que no se incluyan secretos; ejecuta las verificaciones pertinentes; prepara solo los archivos de la tarea (nunca uses `git add .` indiscriminadamente); revisa el diff staged y crea un mensaje descriptivo. No crees commits vacíos ni incluyas cambios ajenos. Si la autorización para implementar la tarea incluye registrarla mediante Git, crea los commits locales necesarios sin pedir autorización por cada commit. Esa autorización no permite publicar, hacer merge ni modificar otras ramas.

## publish — publicar la rama

Requiere autorización explícita para publicar. Comprueba `gh auth status`, remoto, rama actual y commits pendientes. Detente si la rama es la principal o si autenticación, destino o contenido no son claros. Publica con `git push` usando la autenticación GitHub ya configurada por `gh`; establece upstream si corresponde y verifica con `gh`/Git que la rama remota coincide con la local. No cambies la configuración global de Git para resolver autenticación; si falta, explica el bloqueo. Nunca hagas force push.

## pr — crear una pull request

Requiere autorización explícita y no se ejecuta automáticamente al terminar una tarea individual. Antes de crearla, confirma que todos los cambios pertenecen al bloque y que la rama está publicada. Usa `gh pr create` con destino `main`, título `HC-XX — Nombre del bloque` y cuerpo con resumen, tareas HC completadas, pruebas ejecutadas y limitaciones o incidencias pendientes. Si hay cambios ajenos o información incompleta, detente y solicita los datos necesarios antes de crearla.

## finish — finalizar un bloque

1. Comprueba que las tareas del bloque están completadas y revisa sus pruebas.
2. Consulta con `gh` los checks y el estado de la PR; verifica que no hay conflictos.
3. Antes del merge, presenta el estado y solicita autorización explícita. No interpretes autorización para implementar o publicar como autorización para mergear.
4. Solo tras recibir autorización, integra mediante `gh pr merge` con una estrategia compatible con las reglas del repositorio.
5. Actualiza `main` local de forma segura después del merge y verifica el resultado. No borres ramas que contengan cambios sin publicar.

## Límites de seguridad

No ejecutes automáticamente `git push --force`, `git reset --hard`, `git clean -fd`, `git branch -D`, ni `git rebase` sobre historial publicado sin autorización explícita. No elimines ramas con cambios sin publicar. Conserva el historial remoto; no modifiques la configuración global de Git. Ante un estado inesperado o un resultado ambiguo, detente y explica el estado antes de mutar el repositorio.
