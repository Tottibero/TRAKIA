# ADR-006: Guardado automático de resultados

- **Estado:** Aprobada en HC-00
- **Decisión original:** los resultados del entrenamiento se guardan automáticamente.
- **Concreción en HC-05-09-02:** la API valida y confirma cada resultado en PostgreSQL antes de que la interfaz lo presente como guardado o avance. La escritura en navegador no cuenta como confirmación deportiva.
- No se persisten formularios incompletos ni resultados offline.
- **Historial:** HC-05-03 a HC-05-08 implementaron confirmación local seguida de envío y sincronización. Ese comportamiento describe la implementación histórica y queda sustituido para la arquitectura objetivo de ejecución.
