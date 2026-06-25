from fastapi import FastAPI, HTTPException, Header, Response
from pydantic import BaseModel
from typing import Optional

app = FastAPI()

# ============================================
# MODELOS PYDANTIC
# ============================================

class AddItemRequest(BaseModel):
    productId: str
    quantity: int = 1

class CheckoutRequest(BaseModel):
    userId: str

# ============================================
# ALMACENAMIENTO EN MEMORIA
# ============================================

carts = {}
checkout_attempts = {}

# ============================================
# ENDPOINT 1: Ver carrito
# ============================================

@app.get("/cart/{userId}")
async def get_cart(userId: str):
    if userId not in carts:
        carts[userId] = {
            "id": f"carrito-{userId}",
            "userId": userId,
            "status": "ACTIVE",
            "items": [],
            "totalAmount": 0
        }
    return carts[userId]

# ============================================
# ENDPOINT 2: Agregar producto
# ============================================

@app.post("/cart/{userId}/items")
async def add_item(userId: str, data: AddItemRequest):
    if userId not in carts:
        carts[userId] = {
            "id": f"carrito-{userId}",
            "userId": userId,
            "status": "ACTIVE",
            "items": [],
            "totalAmount": 0
        }

    if carts[userId]["status"] == "CHECKED_OUT":
        raise HTTPException(status_code=400, detail="El carrito ya fue procesado. No se pueden agregar productos.")

    new_item = {
        "productId": data.productId,
        "quantity": data.quantity,
        "unitPrice": 14990,
        "subtotal": data.quantity * 14990
    }

    carts[userId]["items"].append(new_item)
    carts[userId]["totalAmount"] = sum(item["subtotal"] for item in carts[userId]["items"])

    return carts[userId]

# ============================================
# ENDPOINT 3: Eliminar producto — 204 sin body
# ============================================

@app.delete("/cart/{userId}/items/{productId}", status_code=204)
async def delete_item(userId: str, productId: str):
    if userId not in carts:
        raise HTTPException(status_code=404, detail="Cart not found")

    carts[userId]["items"] = [
        item for item in carts[userId]["items"]
        if item["productId"] != productId
    ]
    carts[userId]["totalAmount"] = sum(item["subtotal"] for item in carts[userId]["items"])

    return Response(status_code=204)

# ============================================
# ENDPOINT 4: Checkout — Idempotency-Key en HEADER
# ============================================

@app.post("/checkout", status_code=201)
async def checkout(
    data: CheckoutRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")
):
    userId = data.userId
    idempotencyKey = idempotency_key

    if not userId or not idempotencyKey:
        raise HTTPException(status_code=400, detail="userId y Idempotency-Key requeridos")

    # IDEMPOTENCIA
    if idempotencyKey in checkout_attempts:
        existing = checkout_attempts[idempotencyKey]
        if existing["status"] == "SUCCESS":
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Intento duplicado",
                    "orderId": existing["orderId"],
                    "status": "DUPLICATED_ORDER"
                }
            )

    # Carrito no vacío
    if userId not in carts or len(carts[userId]["items"]) == 0:
        raise HTTPException(status_code=400, detail="Carrito vacío")

    orderId = f"ORD-{len(checkout_attempts) + 1001}"

    checkout_attempts[idempotencyKey] = {
        "orderId": orderId,
        "status": "SUCCESS",
        "totalAmount": carts[userId]["totalAmount"]
    }

    carts[userId]["status"] = "CHECKED_OUT"

    return {
        "orderId": orderId,
        "status": "CREATED",
        "totalAmount": carts[userId]["totalAmount"]
    }

# ============================================
# EJECUTAR SERVIDOR
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)