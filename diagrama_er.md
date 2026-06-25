# Diagrama Entidad-Relación — Carrito de Compras

## Leyenda

```
[PK]  → Clave primaria (Primary Key)
[FK]  → Clave foránea (Foreign Key)
[UQ]  → Restricción de unicidad (Unique)
[UQ*] → Índice único PARCIAL (Unique parcial, solo filas que cumplen condición)
[CK]  → Restricción de valor (Check)
─────  → Relación 1 a N  (uno a muchos)
```

---

## Diagrama

```
┌──────────────────────────────────────────────┐
│                    carts                     │
├──────────────────────────────────────────────┤
│ id            UUID    [PK]  DEFAULT uuid()   │
│ user_id       TEXT    NOT NULL               │
│ status        TEXT    [CK]  DEFAULT 'ACTIVE' │
│                       IN (ACTIVE,            │
│                           CHECKED_OUT,       │
│                           ABANDONED)         │
│ created_at    TIMESTAMPTZ  DEFAULT now()     │
│ updated_at    TIMESTAMPTZ  DEFAULT now()     │
├──────────────────────────────────────────────┤
│ [UQ*] carts_user_active_idx                  │
│       UNIQUE (user_id) WHERE status='ACTIVE' │
│       → Solo 1 carrito activo por usuario    │
└───────────────────┬──────────────────────────┘
                    │ 1
          ┌─────────┴─────────┐
          │                   │
          │ N                 │ N
          ▼                   ▼
┌────────────────────┐   ┌──────────────────────────────────────┐
│    cart_items      │   │         checkout_attempts            │
├────────────────────┤   ├──────────────────────────────────────┤
│ id        UUID [PK]│   │ id             UUID  [PK]            │
│ cart_id   UUID [FK]│   │ cart_id        UUID  [FK] → carts.id │
│           → carts  │   │ idempotency_key UUID [UQ]  ✨        │
│           CASCADE  │   │                → Previene duplicados  │
│ product_id TEXT    │   │ order_id       TEXT  (nullable)       │
│ quantity   INT [CK]│   │ status         TEXT  [CK]            │
│            >= 1    │   │                DEFAULT 'PENDING'      │
│ unit_price NUM [CK]│   │                IN (PENDING,          │
│            >= 0    │   │                    SUCCESS,           │
│ subtotal   NUM [CK]│   │                    FAILED)            │
│            >= 0    │   │ created_at     TIMESTAMPTZ           │
├────────────────────┤   │ updated_at     TIMESTAMPTZ           │
│ [UQ] (cart_id,     │   ├──────────────────────────────────────┤
│       product_id)  │   │ [IDX] checkout_attempts_cart_idx     │
│ [IDX] cart_items   │   │       ON (cart_id)                   │
│       _cart_idx    │   └──────────────────────────────────────┘
│       ON (cart_id) │
└────────────────────┘
```

---

## Relaciones

| Desde       | Hacia              | Tipo | Detalle                                        |
|-------------|--------------------|------|------------------------------------------------|
| carts       | cart_items         | 1→N  | Un carrito tiene muchos ítems. Si se borra el carrito, se borran sus ítems (CASCADE). |
| carts       | checkout_attempts  | 1→N  | Un carrito puede tener múltiples intentos de checkout (reintentos). |

---

## Restricciones clave destacadas

- **`carts_user_active_idx` (índice único parcial):** Impide que un mismo usuario tenga más de un carrito en estado `ACTIVE` simultáneamente. Al ser parcial, no afecta a los carritos históricos (`CHECKED_OUT` / `ABANDONED`).

- **`idempotency_key` (UUID UNIQUE):** Cada intento de checkout debe enviar una clave única. Si el cliente reintenta la misma solicitud (por error de red, doble clic, etc.), la base de datos rechazará la inserción duplicada, evitando cobros dobles.

- **`UNIQUE(cart_id, product_id)` en cart_items:** Garantiza que un mismo producto no aparezca dos veces en el mismo carrito. Para cambiar la cantidad se actualiza la fila existente, no se inserta una nueva.
