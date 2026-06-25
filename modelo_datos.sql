-- =============================================================
-- MODELO DE DATOS: Sistema de Carrito de Compras
-- Proyecto: grupo4-carrito
-- Persona 3 → entrega a Persona 4
-- PostgreSQL 14+
-- =============================================================

-- Habilitar extensión para generar UUIDs automáticamente
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================
-- TABLA: carts
-- Representa un carrito de compras por usuario.
-- Solo puede haber un carrito ACTIVE por usuario (garantizado
-- por el índice único parcial carts_user_active_idx).
-- =============================================================
CREATE TABLE carts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE', 'CHECKED_OUT', 'ABANDONED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garantiza que un usuario tenga como máximo 1 carrito activo al mismo tiempo.
-- Al ser un índice PARCIAL (WHERE status = 'ACTIVE'), permite múltiples
-- carritos históricos (CHECKED_OUT / ABANDONED) del mismo usuario.
CREATE UNIQUE INDEX carts_user_active_idx
    ON carts (user_id)
    WHERE status = 'ACTIVE';

-- =============================================================
-- TABLA: cart_items
-- Cada fila es un producto dentro de un carrito.
-- El precio se congela al momento de agregar (unit_price),
-- evitando que cambios de catálogo afecten pedidos en curso.
-- ON DELETE CASCADE: borrar el carrito borra sus ítems.
-- =============================================================
CREATE TABLE cart_items (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id     UUID            NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id  TEXT            NOT NULL,
    quantity    INTEGER         NOT NULL CHECK (quantity >= 1),
    unit_price  NUMERIC(10,2)   NOT NULL CHECK (unit_price >= 0),
    subtotal    NUMERIC(10,2)   NOT NULL CHECK (subtotal >= 0),
    UNIQUE (cart_id, product_id)
);

-- Acelera las consultas que buscan todos los ítems de un carrito específico.
CREATE INDEX cart_items_cart_idx ON cart_items (cart_id);

-- =============================================================
-- TABLA: checkout_attempts
-- Registra cada intento de pago/checkout para un carrito.
-- idempotency_key (UUID UNIQUE) garantiza que el mismo intento
-- de pago no se procese dos veces, incluso si el cliente reintenta.
-- order_id se llena solo cuando el intento tiene status SUCCESS.
-- =============================================================
CREATE TABLE checkout_attempts (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id           UUID        NOT NULL REFERENCES carts(id),
    idempotency_key   UUID        NOT NULL UNIQUE,
    order_id          TEXT,
    status            TEXT        NOT NULL DEFAULT 'PENDING'
                                  CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Acelera las consultas que buscan todos los intentos de checkout de un carrito.
CREATE INDEX checkout_attempts_cart_idx ON checkout_attempts (cart_id);
