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
| `G5_ORDERS_URL` | URL completa del POST /orders de G5 |

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
- **G5 (Pedidos):** Nosotros les llamamos en POST /checkout (implementa P2)

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