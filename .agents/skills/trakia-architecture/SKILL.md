---
name: trakia-architecture
description: "Consulta las convenciones arquitectónicas de TRAKIA o revisa cambios y ámbitos contra sus reglas ARCH. Invócala como $trakia-architecture check HC-XX-YY, explain <módulo> o audit <ruta>."
---

# TRAKIA Architecture

Fuentes de verdad:

- `docs/decisions/ADR-015-arquitectura-modular.md`
- `docs/architecture/module-conventions.md`

Consulta siempre las versiones actuales de estos documentos. La guía contiene las 17 reglas `ARCH-*`; identifícalas según sean aplicables y no copies ni mantengas una lista duplicada en esta skill.

## Operaciones

### `check HC-XX-YY`

Invocación: `$trakia-architecture check HC-XX-YY`.

Revisa los cambios asociados a la tarea. Determina el alcance mediante el diff disponible, archivos modificados o el contexto explícito de la tarea. No supongas que una tarea equivale a un único commit. Si no puedes determinar el alcance, indícalo antes de emitir conclusiones.

### `explain <módulo>`

Invocación: `$trakia-architecture explain <módulo>`; por ejemplo, `$trakia-architecture explain workouts`.

Explica brevemente las convenciones relevantes para desarrollar o modificar el módulo indicado. No generes implementaciones ni modifiques archivos.

### `audit <ruta>`

Invocación: `$trakia-architecture audit <ruta>`; por ejemplo, `$trakia-architecture audit apps/api`, `$trakia-architecture audit apps/web` o `$trakia-architecture audit packages/contracts`.

Revisa la arquitectura solo dentro del ámbito indicado. No extiendas el análisis a otras rutas salvo que una dependencia directa sea necesaria para explicar evidencia del ámbito.

## Reglas de revisión

1. Lee ADR-015 y la guía de convenciones actualizadas.
2. Identifica las reglas `ARCH-*` aplicables en la guía.
3. Revisa dependencias y responsabilidades afectadas.
4. Distingue incumplimientos objetivos de advertencias y recomendaciones.
5. No exijas carpetas ni capas vacías; respeta las excepciones expresas.
6. No declares infracciones sin evidencia concreta.

## Informe de arquitectura

Para cada hallazgo informa el identificador `ARCH-*` cuando exista, archivo y ubicación, evidencia concreta, gravedad y corrección recomendada. Clasifica cada uno como:

- **Incumplimiento:** contradice una regla obligatoria.
- **Advertencia:** posible problema que requiere revisión.
- **Recomendación:** mejora opcional.

Si no hay hallazgos, indícalo expresamente. Una revisión manual no equivale a ejecutar pruebas automáticas.

## Límites

`check`, `explain` y `audit` son de solo lectura: no modifican archivos ni ejecutan refactorizaciones. No realizan commits, push, PR ni merges; tampoco alteran Docker o la base de datos.
