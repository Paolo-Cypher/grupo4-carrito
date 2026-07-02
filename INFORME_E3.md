# Informe de Avance E3 - Grupo 4 (Carro y Checkout)

**Fecha:** Julio 2026  
**URL del Servicio:** https://grupo4-carrito.onrender.com  
**Documentación API:** https://grupo4-carrito.onrender.com/docs

---

## 1. Resumen del Proyecto

Servicio REST funcional del carrito de compras con persistencia real en Supabase PostgreSQL, desplegado en Render con CI/CD automatizado.

### Stack Tecnológico
- **Backend:** FastAPI (Python 3.14)
- **Base de datos:** Supabase (PostgreSQL)
- **Despliegue:** Render (tier free)
- **Pruebas:** Postman (colección automatizada)
- **Seguridad:** Variables de entorno + RLS policies

---

## 2. Endpoints Implementados

| Endpoint | Método | Descripción | Status |
|----------|--------|-------------|--------|
| `/cart/{userId}` | GET | Obtener carrito del usuario | ✅ 200 OK |
| `/cart/{userId}/items` | POST | Agregar item al carrito | ✅ 200 OK |
| `/cart/{userId}/items/{productId}` | DELETE | Eliminar item del carrito | ✅ 204 No Content |
| `/checkout` | POST | Realizar checkout con idempotencia | ✅ 201 Created |

### Manejo de Errores HTTP

| Código | Significado | Escenario |
|--------|-------------|-----------|
| 200 | OK | Operación exitosa |
| 201 | Created | Recurso creado (checkout) |
| 204 | No Content | Eliminación exitosa |
| 400 | Bad Request | Datos inválidos en body |
| 404 | Not Found | Carrito o item no existe |
| 409 | Conflict | Checkout duplicado (idempotencia) |
| 500 | Internal Server Error | Error de base de datos |

---

## 3. Evidencia de Base de Datos (Persistencia)

### Tablas en Supabase

1. **carts** - Carrito del usuario
   - Campos: id, userId, status, totalAmount, created_at, updated_at
   
2. **cart_items** - Items dentro del carrito
   - Campos: id, cart_id, productId, quantity, unitPrice, subtotal
   - FK: cart_id → carts.id (CASCADE)
   
3. **checkout_attempts** - Intentos de checkout con idempotencia
   - Campos: id, cart_id, idempotency_key, orderId, status, created_at
   - UNIQUE: idempotency_key

### Persistencia Verificada
✅ Los datos persisten incluso después de reiniciar el servicio en Render  
✅ Conexión real a Supabase PostgreSQL (no mock)  
✅ Variables de entorno configuradas en Render (DATABASE_URL)

*[INSERTAR CAPTURA DE PANTALLA DE SUPABASE MOSTRANDO LAS 3 TABLAS]*

---

## 4. Evidencia de Pruebas Funcionales (Postman)

### Colección Exportada
- Archivo: `postman_collection.json`
- Ambiente: `E2` con variable `BASE_URL`

### Resultados de Tests
- **Total de tests:** 8
- **Pasaron:** 8 ✅
- **Fallaron:** 0

### Tests Incluidos
1. ✅ GET /cart - Status 200
2. ✅ POST /items - Status 200
3. ✅ POST /checkout (primero) - Status 201
4. ✅ POST /checkout (duplicado) - Status 409 (idempotencia)
5. ✅ DELETE /items - Status 204
6. ✅ Tests de error 400, 404, 409

*[INSERTAR CAPTURA DE PANTALLA DE POSTMAN CON LOS 8 TESTS EN VERDE]*

---

## 5. Evidencia de CI/CD y Deploy

### Plataforma: Render
- **URL pública:** https://grupo4-carrito.onrender.com
- **Deploy automático:** Cada push a GitHub redeploya automáticamente
- **Variables de entorno:** Configuradas en Render Dashboard (no en código)

### Flujo de Deploy
1. Desarrollador hace push a GitHub
2. Render detecta el cambio automáticamente
3. Render construye y despliega la nueva versión
4. Logs disponibles en Render Dashboard

### Variables de Entorno en Render
- `DATABASE_URL` - Connection string de Supabase
- `SUPABASE_URL` - Project URL de Supabase
- `SUPABASE_ANON_KEY` - Publishable Key de Supabase
- `G5_ORDERS_URL` - URL del servicio de pedidos (G5)

**Seguridad:** Ninguna variable sensible está en el código ni en GitHub

*[INSERTAR CAPTURA DE PANTALLA DEL DASHBOARD DE RENDER]*

---

## 6. Documentación Técnica

### Archivos de Documentación
- ✅ **README.md** - Instrucciones completas de instalación y uso
- ✅ **EJEMPLOS.md** - Ejemplos reales de requests y responses
- ✅ **modelo_datos.sql** - Script SQL de la base de datos
- ✅ **docs/diagrama_er.md** - Diagrama entidad-relación
- ✅ **.env.example** - Template de variables de entorno
- ✅ **postman_collection.json** - Colección de pruebas automatizadas

### API Documentation
- Swagger UI disponible en: https://grupo4-carrito.onrender.com/docs
- OpenAPI specification generada automáticamente por FastAPI

---

## 7. Integración con Otros Grupos

### G1 (Frontend)
- Consumen nuestros 4 endpoints REST
- Usan Swagger en `/docs` para documentación

### G5 (Pedidos)
- En `POST /checkout`, llamamos a G5 para crear la orden
- Endpoint: `POST /orders`
- Payload incluye: userId, cartId, items, totalAmount, idempotencyKey

---

## 8. Criterios de Rúbrica E3 - Cumplimiento

| Criterio | Peso | Estado | Evidencia |
|----------|------|--------|-----------|
| Servicio desplegado en cloud | 20% | ✅ Completo | URL pública funcionando |
| Implementación de endpoints | 25% | ✅ Completo | 4 endpoints alineados al contrato |
| Persistencia de datos | 15% | ✅ Completo | Supabase con datos reales |
| Manejo de errores | 15% | ✅ Completo | Códigos HTTP 400, 404, 409, 500 |
| CI/CD o deploy automatizado | 10% | ✅ Completo | Render con deploy automático |
| Documentación técnica | 10% | ✅ Completo | README, EJEMPLOS, Swagger |
| Seguridad/configuración básica | 5% | ✅ Completo | Variables de entorno sin secrets |

---

## 9. Entregables del Grupo 4

### ✅ Entregables Obligatorios
- [x] URL del servicio cloud: https://grupo4-carrito.onrender.com
- [x] Base de datos funcionando: Supabase PostgreSQL
- [x] Documentación de endpoints: Swagger + EJEMPLOS.md
- [x] Evidencia CI/CD: Render con deploy automático
- [x] Pruebas funcionales: postman_collection.json con 8 tests

### ✅ Entregables Adicionales
- [x] README.md completo con instrucciones
- [x] modelo_datos.sql actualizado
- [x] .env.example para configuración local
- [x] Integración con G5 implementada

---

## 10. Integrantes y Responsabilidades

| Persona | Nombre | Responsabilidad | Horas |
|---------|--------|-----------------|-------|
| P1 | Paolo Sepúlveda | Infraestructura + Supabase + CI/CD | 6-8h |
| P2 | Mauricio Reynoso | Endpoints reales + Manejo de errores | 6-8h |
| P3 | Benjamin Farias | Persistencia BD + Migraciones SQL | 5-6h |
| P4 | Felipe Cruz | Pruebas funcionales + Documentación | 5-6h |

---

## 11. Próximos Pasos (E4/E5)

- [ ] Mejorar RLS policies con autenticación real (coordinar con G2)
- [ ] Implementar reintentos para llamadas a G5
- [ ] Circuit breaker para resiliencia
- [ ] Tests de carga y stress testing
- [ ] Monitoreo avanzado en Render
- [ ] Logs estructurados

---

## 12. Enlaces Importantes

- **Repositorio GitHub:** https://github.com/Paolo-Cypher/grupo4-carrito
- **API en Producción:** https://grupo4-carrito.onrender.com
- **Documentación Swagger:** https://grupo4-carrito.onrender.com/docs
- **Colección Postman:** postman_collection.json (en el repo)

---

**Estado del Proyecto:** ✅ COMPLETO PARA ENTREGA E3
