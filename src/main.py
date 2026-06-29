import os
from fastapi import FastAPI, HTTPException, Header, Response
from pydantic import BaseModel
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Inicializar Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
if not supabase_url or not supabase_key:
    raise ValueError("SUPABASE_URL y SUPABASE_KEY son requeridos")

supabase: Client = create_client(supabase_url, supabase_key)

# ============================================
# MODELOS PYDANTIC
# ============================================

class AddItemRequest(BaseModel):
    productId: str
    quantity: int = 1

class CheckoutRequest(BaseModel):
    userId: str

# ============================================
# ENDPOINT 1: Ver carrito
# ============================================

@app.get("/cart/{userId}")
async def get_cart(userId: str):
    try:
        # Obtener o crear carrito
        result = supabase.table("carts").select("*").eq("user_id", userId).eq("status", "ACTIVE").execute()
        
        if not result.data:
            # Si no existe carrito activo, crear uno
            new_cart = supabase.table("carts").insert({
                "user_id": userId,
                "status": "ACTIVE"
            }).execute()
            cart_id = new_cart.data[0]["id"]
        else:
            cart_id = result.data[0]["id"]
        
        # Obtener items del carrito
        items_result = supabase.table("cart_items").select("*").eq("cart_id", cart_id).execute()
        
        # Calcular total
        total_amount = sum(item["subtotal"] for item in items_result.data) if items_result.data else 0
        
        return {
            "id": cart_id,
            "userId": userId,
            "status": "ACTIVE",
            "items": items_result.data or [],
            "totalAmount": total_amount
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# ============================================
# ENDPOINT 2: Agregar producto
# ============================================

@app.post("/cart/{userId}/items")
async def add_item(userId: str, data: AddItemRequest):
    try:
        # Obtener carrito
        cart_result = supabase.table("carts").select("*").eq("user_id", userId).eq("status", "ACTIVE").execute()
        
        if not cart_result.data:
            raise HTTPException(status_code=404, detail="Cart not found")
        
        cart = cart_result.data[0]
        cart_id = cart["id"]
        
        # Validar que el carrito no esté CHECKED_OUT
        if cart["status"] == "CHECKED_OUT":
            raise HTTPException(status_code=400, detail="El carrito ya fue procesado. No se pueden agregar productos.")
        
        # Insertar o actualizar item
        subtotal = data.quantity * 14990
        
        supabase.table("cart_items").upsert({
            "cart_id": cart_id,
            "product_id": data.productId,
            "quantity": data.quantity,
            "unit_price": 14990,
            "subtotal": subtotal
        }, on_conflict="cart_id,product_id").execute()
        
        # Obtener carrito actualizado
        items_result = supabase.table("cart_items").select("*").eq("cart_id", cart_id).execute()
        total_amount = sum(item["subtotal"] for item in items_result.data)
        
        return {
            "id": cart_id,
            "userId": userId,
            "status": cart["status"],
            "items": items_result.data,
            "totalAmount": total_amount
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# ============================================
# ENDPOINT 3: Eliminar producto
# ============================================

@app.delete("/cart/{userId}/items/{productId}", status_code=204)
async def delete_item(userId: str, productId: str):
    try:
        # Obtener carrito
        cart_result = supabase.table("carts").select("*").eq("user_id", userId).eq("status", "ACTIVE").execute()
        
        if not cart_result.data:
            raise HTTPException(status_code=404, detail="Cart not found")
        
        cart = cart_result.data[0]
        cart_id = cart["id"]
        
        # Validar que el carrito no esté CHECKED_OUT
        if cart["status"] == "CHECKED_OUT":
            raise HTTPException(status_code=400, detail="El carrito ya fue procesado. No se pueden eliminar productos.")
        
        # Eliminar item
        supabase.table("cart_items").delete().eq("cart_id", cart_id).eq("product_id", productId).execute()
        
        return Response(status_code=204)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# ============================================
# ENDPOINT 4: Checkout
# ============================================

@app.post("/checkout", status_code=201)
async def checkout(
    data: CheckoutRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")
):
    try:
        userId = data.userId
        idempotencyKey = idempotency_key
        
        if not userId or not idempotencyKey:
            raise HTTPException(status_code=400, detail="userId y Idempotency-Key requeridos")
        
        # Verificar si ya existe este intento de checkout (idempotencia)
        existing = supabase.table("checkout_attempts").select("*").eq("idempotency_key", idempotencyKey).execute()
        
        if existing.data and existing.data[0]["status"] == "SUCCESS":
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Intento duplicado",
                    "orderId": existing.data[0]["order_id"],
                    "status": "DUPLICATED_ORDER"
                }
            )
        
        # Obtener carrito
        cart_result = supabase.table("carts").select("*").eq("user_id", userId).eq("status", "ACTIVE").execute()
        
        if not cart_result.data:
            raise HTTPException(status_code=400, detail="Carrito vacío")
        
        cart = cart_result.data[0]
        cart_id = cart["id"]
        
        # Verificar que el carrito tenga items
        items_result = supabase.table("cart_items").select("*").eq("cart_id", cart_id).execute()
        if not items_result.data:
            raise HTTPException(status_code=400, detail="Carrito vacío")
        
        total_amount = sum(item["subtotal"] for item in items_result.data)
        
        # Generar orderId
        all_attempts = supabase.table("checkout_attempts").select("*").execute()
        orderId = f"ORD-{len(all_attempts.data) + 1001}"
        
        # Insertar checkout attempt
        supabase.table("checkout_attempts").insert({
            "cart_id": cart_id,
            "idempotency_key": idempotencyKey,
            "order_id": orderId,
            "status": "SUCCESS"
        }).execute()
        
        # Marcar carrito como CHECKED_OUT
        supabase.table("carts").update({"status": "CHECKED_OUT"}).eq("id", cart_id).execute()
        
        return {
            "orderId": orderId,
            "status": "CREATED",
            "totalAmount": total_amount
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

# ============================================
# EJECUTAR SERVIDOR
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)