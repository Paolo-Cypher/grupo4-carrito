![CI](https://github.com/Paolo-Cypher/grupo4-carrito/actions/workflows/ci.yml/badge.svg)

# grupo4-carrito

Servicio de Carrito y Checkout - E3 Cloud

## Descripción

Servicio REST funcional del carrito con persistencia en **Supabase PostgreSQL**.
Implementa 4 endpoints principales alineados al contrato E1.

### Stack
- **Backend:** Node.js + Express
- **Base de datos:** Supabase (PostgreSQL)
- **Despliegue:** Render (tier free)
- **Seguridad:** RLS policies + Supabase Anon Key

---

## Instalación Local

### 1. Clonar repositorio
```bash
git clone https://github.com/Paolo-Cypher/grupo4-carrito.git
cd grupo4-carrito
```

### 2. Crear archivo `.env`
Copia el archivo de ejemplo:
```bash
cp .env.example .env
```

Luego edita `.env` y rellena con tus credenciales de Supabase:
SUPABASE_URL=https://tuproyecto.supabase.co

SUPABASE_ANON_KEY=tu_anon_key_aqui

### Cómo obtener las credenciales de Supabase (SUPABASE_URL y SUPABASE_ANON_KEY)

1. Entra a [supabase.com](https://supabase.com) e inicia sesión.
2. Abre tu proyecto (o crea uno nuevo con "New Project").
3. Ve a **Settings → API Keys**.
4. Copia el **Project URL** → pégalo en `SUPABASE_URL`.
5. Copia la **anon / publishable key** → pégala en `SUPABASE_ANON_KEY`.
6. Guarda ambos valores solo en tu `.env` local (nunca los subas al repo; `.env` ya está en `.gitignore`).

### Cómo obtener la DATABASE_URL de Supabase

1. Entra a [supabase.com](https://supabase.com) e inicia sesión.
2. Abre tu proyecto.
3. Ve a **Project Settings → Database**.
4. Busca la sección **Connection string** o **Database connection string**.
5. Copia el string en formato URI y pégalo en `DATABASE_URL`.
6. Si Supabase te muestra varias opciones, usa la URL principal de conexión que te da el panel para tu proyecto.
7. Guarda ese valor solo en tu `.env` local o en las variables de entorno del deploy; nunca lo subas a GitHub.

### 3. Instalar dependencias
```bash
npm install
```

### 4. Correr localmente
```bash
npm start
```

Accede en: **http://localhost:8000/docs**

---

## Autenticación (E4 Integración)

### Requerimiento
Todos los endpoints requieren autenticación con token JWT emitido por **Grupo 2 (Identidad)**.

### Headers Requeridos
```
Authorization: Bearer {access_token}    // OBLIGATORIO
X-Correlation-Id: {uuid}                // Recomendado para trazabilidad
```

### Ejemplo: Obtener token y usar en G4

#### 1. Login en G2 (obtener token)
```bash
curl -X POST https://auth-minimarket-cloud.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "g4-test@correo.cl",
    "password": "TestG4Clave123"
  }'

# Respuesta:
{
  "user": {
    "user_id": "7a9b189c-80e4-4c30-99ab-9308acae08dd",
    "business_user_id": "USR-11",
    "email": "g4-test@correo.cl",
    "role": "customer",
    "status": "active"
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600
}
```

#### 2. Usar el token en G4
```bash
# Guardar el token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Obtener carrito (userId debe ser el business_user_id)
curl http://localhost:3000/cart/USR-11 \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Correlation-Id: 550e8400-e29b-41d4-a716-446655440000"

# Agregar item al carrito
curl -X POST http://localhost:3000/cart/USR-11/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId": "P-100", "quantity": 2}'
```

### Códigos de Error
- **401 Unauthorized** — Token ausente, inválido o expirado
- **403 Forbidden** — Usuario intenta acceder a carrito de otro usuario
- **503 Service Unavailable** — Servicio de identidad (G2) no disponible

### Estructura de Error
```json
{
  "timestamp": "2026-07-07T12:00:00Z",
  "status": 401,
  "code": "UNAUTHORIZED",
  "message": "Token requerido",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Deployment en Render

### URL en vivo
**https://grupo4-carrito.onrender.com**

Swagger: **https://grupo4-carrito.onrender.com/docs**

### Variables de Entorno en Render

En Render Dashboard → grupo4-carrito → Settings → Environment:

Agrega estas variables (obtén los valores de tu Supabase y del servicio de G5):

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Tu connection string de Supabase |
| `SUPABASE_URL` | Tu Project URL de Supabase |
| `SUPABASE_ANON_KEY` | Tu Publishable Key de Supabase |
| `G3_CATALOG_URL` | Base URL del catálogo de Grupo 3 (`https://catalog-api-cm1l.onrender.com/api/v1`) |
| `G5_ORDERS_URL` | URL completa del POST /orders de G5 |
| `G2_AUTH_URL` | Base URL de autenticación de Grupo 2 (`https://auth-minimarket-cloud.onrender.com`) |
| `G2_AUTH_VALIDATE_ENDPOINT` | Path del endpoint de validación de token (`/auth/validate`) |
| `REQUEST_TIMEOUT` | Timeout en ms para la validación de token contra G2 (`5000`) |

**IMPORTANTE:** Nunca compartir estos valores ni subirlos a GitHub.

### Flujo de Deploy

1. **Push a GitHub** (rama `P1/EV3`)
```bash
   git add .
   git commit -m "mensaje descriptivo"
   git push origin P1/EV3
```

2. **Render redeploy automático** 
   - Render detecta el push y redeploya automáticamente
   - O haz Manual Deploy en Render Dashboard

3. **Verificar logs** 
   - Ve a Render Dashboard → grupo4-carrito → Logs
   - Busca "Your service is live 🎉"

4. **Probar URL pública**
   - https://grupo4-carrito.onrender.com/docs
   - Prueba los endpoints

---

## Endpoints

### 1. GET /cart/{userId}
Obtiene el carrito del usuario (o crea uno si no existe)

**Request:**
```bash
GET /cart/juan
```

**Response (200):**
```json
{
  "id": "3ca18d75-1d89-4944-a9e6-371c6454c9f7",
  "userId": "juan",
  "status": "ACTIVE",
  "items": [],
  "totalAmount": 0
}
```

---

### 2. POST /cart/{userId}/items
Agrega un producto al carrito

**Request:**
```bash
POST /cart/juan/items
Content-Type: application/json

{
  "productId": "P-100",
  "quantity": 1
}
```

**Response (200):**
```json
{
  "id": "3ca18d75-1d89-4944-a9e6-371c6454c9f7",
  "userId": "juan",
  "status": "ACTIVE",
  "items": [
    {
      "productId": "P-100",
      "quantity": 1,
      "unitPrice": 14990,
      "subtotal": 14990
    }
  ],
  "totalAmount": 14990
}
```

---

### 3. DELETE /cart/{userId}/items/{productId}
Elimina un producto del carrito

**Request:**
```bash
DELETE /cart/juan/items/P-100
```

**Response (204):**
No Content (sin body)

---

### 4. POST /checkout
Crea un pedido. **IMPORTANTE:** Incluir `Idempotency-Key` en headers para evitar duplicados.

**Request:**
```bash
POST /checkout
Content-Type: application/json
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

{
  "userId": "juan"
}
```

**Response (201):**
```json
{
  "orderId": "ORD-1001",
  "status": "CREATED",
  "totalAmount": 14990
}
```

**Response (409 - Duplicado):**
```json
{
  "detail": {
    "message": "Intento duplicado",
    "orderId": "ORD-1001",
    "status": "DUPLICATED_ORDER"
  }
}
```

---

## Pruebas con Postman

1. **Importa:** `postman_collection.json`
2. **Selecciona ambiente:** `E2`
3. **Ejecuta:** Click "Run" en la colección
4. **Resultado:** 5+ tests verdes ✅

---

## Modelo de Datos

3 tablas en Supabase:

- **carts:** Carrito del usuario
- **cart_items:** Items dentro del carrito
- **checkout_attempts:** Intentos de checkout (con idempotencia)

Ver documentación:
- `modelo_datos.sql` - Script SQL
- `docs/diagrama_er.md` - Diagrama entidad-relación

### Seguridad (RLS)

Row Level Security habilitado con policies permisivas para anon role.

**Nota para E4:** Mejorar policies con autenticación real (coordinar con G2).

---

## Integración con otros grupos

- **G1 (Frontend):** Llama a nuestros 4 endpoints REST. Usa Swagger en `/docs`
- **G2 (Identidad):** Nosotros les llamamos para validar el token en cada request (implementa P2)
- **G5 (Pedidos):** Nosotros les llamamos en POST /checkout (implementa P2)

### Integración con G2

Un middleware global (`authMiddleware`) valida el header `Authorization: Bearer {token}`
en cada request contra `GET {G2_AUTH_URL}{G2_AUTH_VALIDATE_ENDPOINT}`, propagando
`X-Correlation-Id`. Si el token es válido, se adjunta `req.user` (con `business_user_id`,
`email`, `role`, `status`) y cada endpoint valida que el `userId` de la ruta coincida con
`req.user.business_user_id` antes de continuar. Ver sección
[Autenticación (E4 Integración)](#autenticación-e4-integración) para el detalle completo.

### Integración con G5

En `POST /checkout`, luego de marcar el carrito como `CHECKED_OUT`, el backend llama a G5 para crear la orden.

Contrato asumido por ahora:

- Endpoint: `POST /orders`
- Body enviado:
  - `userId`
  - `cartId`
  - `items` con `productId`, `quantity`, `unitPrice`, `subtotal`
  - `totalAmount`
  - `idempotencyKey`

Si G5 usa otro formato, solo hay que ajustar el payload en `src/index.js` y el valor de `G5_ORDERS_URL`.

---

## Estructura del proyecto
grupo4-carrito/

├── src/

│   └── index.js             # Endpoints Express (Node.js)

├── docs/

│   ├── diagrama_er.md       # Diagrama entidad-relación

│   ├── EJEMPLOS.md          # Ejemplos de uso de los endpoints

│   └── ESTRUCTURA.md        # Documentación de estructura del proyecto

├── modelo_datos.sql         # Script SQL (DDL) de la base de datos

├── modelo_documentacion.txt # Documentación detallada del modelo de datos

├── package.json             # Dependencias Node.js

├── .env.example            # Template de variables

├── .gitignore              # Archivos ignorados en Git

├── README.md               # Este archivo

└── postman_collection.json # Tests Postman

---

## Siguientes pasos (E4/E5)

- [x] Autenticación JWT real contra G2 en los endpoints (middleware `authMiddleware`)
- [ ] Mejorar RLS policies con autenticación real (G2)
- [ ] Implementar reintentos para llamadas a G5
- [ ] Circuit breaker para resiliencia
- [ ] Tests de carga y stress testing
- [ ] Monitoreo en Render

---

## Contribuidores (Grupo 4)

- **P1 (Paolo):** Infraestructura + Supabase + CI/CD
- **P2 (Mauricio):** Endpoints reales + Manejo de errores
- **P3 (Benjamin):** Persistencia BD + Migraciones SQL
- **P4 (Felipe):** Pruebas funcionales + Documentación