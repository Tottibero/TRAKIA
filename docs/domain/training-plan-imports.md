# Importación de planes de entrenamiento

Este documento define el formato externo autocontenido y las políticas de revisión previstas para importar planificación. Las reglas generales de calendario, bloques y objetivos siguen en [training-plans.md](training-plans.md); la importación no realiza operaciones sobre el catálogo o los planes persistidos.

## Decisiones aprobadas

1. **Sobre versionado.** El documento v1 contiene `format: "trakia.training-plan"`, `version: 1` y `plan`, además de `exercises`. El par de formato/versión identifica el contrato y permite evolucionarlo.
2. **Definiciones autocontenidas.** `exercises` incluye la definición de cada ejercicio utilizado, con su clave estable de catálogo, métricas y referencias externas según el contrato de ejercicios. Las claves internas UUID y las instrucciones de persistencia no forman parte del documento.
3. **Referencias locales.** Toda `exerciseKey` principal o alternativa, incluidos ejercicios de intervalos y recuperación activa, debe resolver a una definición dentro del mismo documento. Se permiten definiciones incluidas que el plan no use.
4. **Incidencias diferenciadas.** Las incidencias de validación usan `code`, `path` y `message`; sus rutas incluyen nombres de propiedades e índices numéricos. Los errores estructurales del documento se separan de conflictos que solo pueden detectarse comparando datos persistidos. Códigos estables: `INVALID_FORMAT` para otro identificador de formato; `UNSUPPORTED_VERSION` para una versión no implementada; `INVALID_STRUCTURE` para propiedades o formas no admitidas; `DUPLICATE_EXERCISE_KEY` para claves repetidas en las definiciones; `EXERCISE_NOT_DEFINED` para referencias internas sin definición; `INCOMPATIBLE_METRIC` para objetivos no admitidos por el ejercicio; e `INVALID_PLAN` para invariantes estructurales de planificación. La conversión exhaustiva de errores Zod a estas incidencias se hará en una tarea posterior.
5. **Actualización conservadora.** La ausencia de un elemento en el JSON no significa eliminación. Los elementos ausentes se conservan.
6. **Sin modo de operación.** No existe una propiedad `mode` (por ejemplo, reemplazar/combinar). Las claves estables del plan, sesiones, bloques y apariciones permiten identificar creaciones y posibles actualizaciones.
7. **Estructura estricta.** Se rechazan propiedades desconocidas en el sobre y en todas sus estructuras anidadas para que una versión antigua no interprete silenciosamente campos nuevos.

## Objetivos y métricas

El objetivo explícito del ejercicio principal debe ser compatible con sus métricas declaradas. Al seleccionar una alternativa, solo se heredan objetivos compatibles con ella; sus ajustes pueden sobrescribir un objetivo compatible o eliminarlo con `null`. Los ajustes por serie o ronda se aplican tras elegir el ejercicio y deben poder aplicarse a las opciones declaradas. Una incompatibilidad explícita produce error de validación. La selección efectiva durante una ejecución futura seguirá respetando la precedencia y filtrado definidos en [training-plans.md](training-plans.md); el contrato de importación no crea un motor de prescripción.

El JSON permite comprobar ahora claves duplicadas, estructura, fechas, referencias locales y compatibilidad de métricas frente a todas las definiciones incluidas. La resolución de una clave contra el catálogo persistido, la igualdad o contradicción de las definiciones, y los conflictos con planes o sesiones existentes requieren comparar datos guardados en una tarea posterior.

## Revisión y actualización previstas

Toda importación tendrá una revisión previa antes de aplicar cambios. El resultado propuesto será:

- Un plan cuya clave no existe propone una creación; si existe, se comparan diferencias.
- Una sesión con clave nueva propone incorporación. Una sesión existente sin cambios se conserva.
- Una sesión futura aún no iniciada puede proponerse para actualización, siempre con revisión.
- Las sesiones iniciadas o cerradas están protegidas frente a modificaciones. Una ejecución iniciada conserva su snapshot original; el cierre y sus resultados no se reabren al editar planificación, según las reglas de [workouts.md](workouts.md) y HC-02-01.
- Los elementos ausentes del JSON se conservan y no se interpretan como bajas.
- Una clave de ejercicio ya existente con una definición contradictoria se señala como conflicto para revisión, sin deduplicación automática por similitud de nombres.
- Una importación repetida sin diferencias no requiere escrituras adicionales.

La protección por estado, las comparaciones, la detección de claves existentes, la presentación de conflictos y la decisión de aplicar cambios requieren consultar persistencia. Esta tarea solo valida el documento y no implementa consultas, transacciones ni operaciones de actualización.
