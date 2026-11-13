# Decisiones de sincronización de ejecuciones deportivas

Este documento define el contrato conceptual de sincronización de ejecuciones cerradas. El transporte, la cola, el almacenamiento offline y el procesamiento del servidor se implementarán en tareas posteriores. Las formas externas Zod viven en `packages/contracts/src/workout-sync/`.

## Decisiones aprobadas

1. **Cierre y correcciones independientes.** Al cerrar localmente una ejecución se genera una operación completa con la ejecución cerrada y su snapshot de planificación. Cada corrección posterior es una operación separada que reutiliza el contrato `WorkoutCorrection` de HC-02-04.
2. **Estado técnico separado.** Una operación puede estar `pending`, `syncing`, `synced`, `conflict` o `rejected`. Estos estados describen transporte y no forman parte de `WorkoutExecution`.
3. **Identidad e inmutabilidad lógica.** `operationId` es un UUID estable. La identidad, secuencia y contenido de negocio de una operación no cambian entre reintentos. El cliente no necesita proporcionar un hash y el payload no incluye intentos HTTP.
4. **Secuencia por ejecución.** El cierre usa secuencia 1. Cada corrección posterior usa la secuencia consecutiva que le corresponde; ejecuciones distintas tienen secuencias independientes.
5. **Dependencias previas.** Una operación cuya dependencia todavía no está confirmada puede recibir `dependency_pending`, con una secuencia previa cuando el servidor pueda identificarla.

## Invariantes estructurales

- `close_execution` debe tener secuencia 1, una ejecución con estado `completed` y el mismo ID en el sobre y en la ejecución. No contiene correcciones posteriores.
- `correct_result` debe tener secuencia positiva mayor que 1 y un payload estructurado como corrección HC-02-04. Ese payload contiene `resultId`, pero no contiene la lista de resultados de la ejecución; el contrato por sí solo no puede probar que ese resultado pertenece al `executionId` de la operación.
- Las operaciones discriminan por `operationType`. El sobre valida la forma y los IDs, pero no conoce el estado remoto ni valida huecos de secuencia.
- `applied` y `already_applied` son respuestas sin incidencia; `conflict` y `rejected` requieren una incidencia con código estable y mensaje. `dependency_pending` permite `requiredSequence`, que debe ser anterior a la operación.
- `already_applied` corresponde al mismo `operationId` y contenido lógico que ya procesó el servidor. El mismo ID con contenido distinto es conflicto.
- `pending` puede reintentarse tras fallos recuperables. `syncing` es transitorio y debe recuperarse tras reinicios; `conflict` y `rejected` paran reintentos automáticos hasta resolver su causa.
- Una ejecución cerrada permanece cerrada aunque la sincronización esté pendiente. El dispositivo de origen mantiene el control de la ejecución hasta el cierre y la sincronización.
- No se puede aplicar una corrección N antes de confirmar las operaciones anteriores de esa ejecución. Ejecuciones diferentes se sincronizan independientemente.

## Incidencias

El catálogo inicial contempla `OPERATION_CONTENT_MISMATCH`, `DEPENDENCY_PENDING`, `EXECUTION_CONFLICT`, `INVALID_OPERATION` y `RESULT_NOT_FOUND`. No es un sistema genérico de errores de aplicación ni depende de los códigos de importación de planes.

## Pendiente de implementación

Quedan fuera de este contrato las transiciones y el almacenamiento local, la cola ordenada, reintentos, recuperación de `syncing`, comparación de contenido/hash, idempotencia persistida, aplicación de operaciones, detección remota de dependencias y resolución de conflictos. El backend determinará si el `resultId` corregido pertenece a la ejecución indicada y si las secuencias anteriores están confirmadas.
