# Catálogo versionado de ejercicios

`data/exercise-catalog.json` es una instantánea informativa y versionada para consultar ejercicios al redactar planes. PostgreSQL sigue siendo la fuente operativa de ejercicios y claves; este archivo no sincroniza ni crea registros.

La versión inicial se obtuvo el 2026-11-24 desde la API de producción mediante Railway SSH temporal. Una transacción `REPEATABLE READ` y `READ ONLY` confirmó `current_database() = 'trakia'` y contó 0 filas en `exercises`, 0 en `exercise_catalog_keys` y 0 ejercicios con varias claves. Por ello, el catálogo inicial contiene una lista vacía: no había ejercicios persistidos que se pudieran exportar. No se incluyeron UUID, timestamps ni datos de otras tablas. La clave SSH temporal se retiró al terminar y Railway confirmó que no quedaban claves registradas.

## Validar

Desde la raíz del repositorio, ejecuta:

```sh
pnpm exercise-catalog:validate
```

El validador comprueba formato y versión, valida cada definición con `ExerciseDefinitionSchema`, detecta claves duplicadas y aplica las reglas actuales de referencias wger/YouTube. No añade una regla de unicidad de referencias entre ejercicios que el contrato y la base no definen.

## Incorporar ejercicios

1. Añade el ejercicio al catálogo operativo mediante el flujo autorizado de TRAKIA. Cada ejercicio persistido debe tener una clave estable, única y conforme al contrato.
2. Revisa su nombre, descripción, categoría, métricas y referencias en PostgreSQL. No cambies la definición de una clave existente para reutilizarla con otro ejercicio: las importaciones que encuentren la misma clave con datos distintos producen un conflicto.
3. Copia la definición verificada a `data/exercise-catalog.json` y ejecuta `pnpm exercise-catalog:validate`.
4. Si una misma fila de `exercises` tiene varias claves estables, documéntalas como claves equivalentes del mismo ejercicio; no copies la definición como ejercicios distintos. La instantánea actual no contiene ese caso. Antes de guardar un caso multiclave, amplía su representación y validación para conservar explícitamente esa relación.
5. En revisión de cambios, coteja el diff del JSON con el catálogo PostgreSQL. No uses este archivo para sembrar, actualizar ni borrar datos operativos.

El catálogo local puede quedar temporalmente detrás de PostgreSQL; no debe considerarse un catálogo operativo ni una promesa de sincronización automática.
