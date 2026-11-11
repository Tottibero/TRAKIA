# Contrato técnico de salud

`GET /api/health` responde HTTP 200 con un objeto JSON validado por `HealthResponseSchema` de `@trakia/contracts`:

```json
{
  "status": "ok"
}
```

El endpoint es público y no consulta persistencia ni servicios externos. El frontend puede consultarlo en `/api/health`; Vite reenvía esa ruta al API local conservando el prefijo `/api`.
