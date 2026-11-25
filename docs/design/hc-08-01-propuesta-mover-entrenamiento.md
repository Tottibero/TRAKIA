# Propuesta visual — Mover entrenamiento (HC-08-01)

**Estado:** aprobada por el propietario con los ajustes recogidos abajo.

## Dirección

Extensión pequeña del detalle de sesión existente. Conserva la identidad visual de `DESIGN.md`: carbón, blanco cálido, acento rojo medido, superficies planas, tipografía Inter y controles de al menos 44 px. No rediseña la pantalla ni añade navegación.

## Flujo propuesto

- «Mover entrenamiento» aparece inmediatamente después del botón de inicio actual como acción secundaria.
- Al activarla, abre un diálogo compacto tipo hoja inferior en móvil y centrado en pantallas amplias.
- El diálogo enumera solo días elegibles de lunes a domingo en la semana original, sin fechas pasadas. Cada fila táctil muestra día y fecha; identifica «Día libre» o «Descanso» con una diferencia visual discreta.
- Un descanso del mismo plan lleva una nota neutral de que se sustituirá. La selección destaca con los colores habituales de TRAKIA.
- El texto introductorio es «Elige otro día de esta semana». «Cancelar» cierra sin guardar; «Confirmar cambio» guarda una sola vez y durante la petición muestra «Guardando…».
- El error aparece bajo las opciones, con recuperación clara. El éxito cierra el diálogo y actualiza calendario y detalle.

## Estados y tamaños revisables

El HTML aislado presenta la acción cerrada y el selector abierto con descanso seleccionado en marcos de 375 px y 390 px. No consulta la API ni altera componentes productivos.

## Notas de aprobación

El propietario aprobó la propuesta y pidió integrar el selector en el detalle existente, mantenerlo compacto y evitar pantallas nuevas, calendarios complejos o elementos redundantes. La implementación productiva puede proceder dentro de esos límites.

## Artefacto

[Abrir propuesta HTML](hc-08-01-propuesta-mover-entrenamiento.html).
