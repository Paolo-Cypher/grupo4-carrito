# Ejemplos de Requests y Respuestas Reales

## GET /cart/{userId}

### Request Exitoso
`http GET /cart/Juan

#Response 200

{
  "userId": "Juan",
  "items": [
    {
      "productId": "P-100",
      "name": "Caña XYZ",
      "price": 14990,
      "quantity": 1
    }
  ],
  "totalAmount": 14990,
  "status": "ACTIVE"
}

Response 404 - Carrito no encontrado
http
GET /cart/UsuarioInexistente
json
{
  "detail": "Carrito no encontrado"
}


#POST /cart/{userId}/items
Request

http
POST /cart/Juan/items
Content-Type: application/json

{
  "productId": "P-100",
  "name": "Caña XYZ",
  "price": 14990,
  "quantity": 1
}


#Response 200
json 
{
  "userId": "Juan",
  "items": [
    {
      "productId": "P-100",
      "name": "Caña XYZ",
      "price": 14990,
      "quantity": 1
    }
  ],
  "totalAmount": 14990,
  "status": "ACTIVE"
}


"Response 400 - Body inválido" 
http 
POST /cart/Juan/items
Content-Type: application/json

{
  "productId": "P-100"
}

json 
{
  "detail": "productId y quantity requeridos"
}

DELETE /cart/{userId}/items/{productId}
Request Exitoso
http 
DELETE /cart/Juan/items/P-100

# Response 204
(No content)
Response 404 - Item no encontrado
http 
DELETE /cart/Juan/items/P-999

json 
{
  "detail": "Item no encontrado en el carrito"
}


#POST /checkout
Request Exitoso

http
POST /checkout
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "userId": "Juan"
}

#Response 201
json
{
  "orderId": "ORD-12345",
  "status": "CREATED",
  "totalAmount": 14990
}

#Response 409 - Idempotency-Key duplicada

http
POST /checkout
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "userId": "Juan"
}

json
{
  "detail": "Duplicate Idempotency-Key",
  "orderId": "ORD-12345"
}


#Response 400 - Faltan campos
http 
POST /checkout
Content-Type: application/json

{}

json 
{
  "detail": "userId y idempotencyKey requeridos"
}

#Response 404 - Carrito no encontrado
http 
POST /checkout
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440001
Content-Type: application/json

{
  "userId": "UsuarioInexistente"
}

json 
{
  "detail": "Carrito no encontrado"
}



## Códigos de Estado HTTP

La API utiliza los siguientes códigos de estado HTTP según el estándar:

| Código | Significado | Ejemplo |
|--------|-------------|---------|
| 200 | OK - Request exitoso | GET /cart, POST /items |
| 201 | Created - Recurso creado | POST /checkout |
| 204 | No Content - Eliminación exitosa | DELETE /items |
| 400 | Bad Request - Datos inválidos | Body sin campos requeridos |
| 404 | Not Found - Recurso no existe | Carrito o item no encontrado |
| 409 | Conflict - Idempotencia | Checkout duplicado |
| 500 | Internal Server Error | Error de base de datos |
