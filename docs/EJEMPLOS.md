# Ejemplos de Uso

### Flujo completo

1. Ver carrito vacío

GET http://localhost:8000/cart/Juan

Response:
{ "items": [], "totalAmount": 0 }

2. Agregar producto

POST http://localhost:8000/cart/Juan/items

Body:
{ "productId": "P-100", "quantity": 1 }

Response:
{ "items": [{ "productId": "P-100", "quantity": 1, "unitPrice": 14990, "subtotal": 14990 }], "totalAmount": 14990 }

3. Agregar otro producto

POST http://localhost:8000/cart/Juan/items

Body:
{ "productId": "P-205", "quantity": 1 }

Response:
{ "items": [/* 2 items */], "totalAmount": 34980 }

4. Ver carrito

GET http://localhost:8000/cart/Juan

Response:
{ "items": [/* 2 items */], "totalAmount": 34980 }

5. Eliminar producto

DELETE http://localhost:8000/cart/Juan/items/P-100

Response:
204 No Content (sin body)

6. Hacer checkout

POST http://localhost:8000/checkout

Headers: Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

Body:
{ "userId": "Juan" }

Response:
{ "orderId": "ORD-1001", "status": "CREATED", "totalAmount": 14990 }

7. Intentar checkout duplicado (MISMO Idempotency-Key)

POST http://localhost:8000/checkout

Headers: Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

Body:
{ "userId": "Juan" }

Response:
{ "orderId": "ORD-1001" }

(Devuelve el anterior, NO crea duplicado)