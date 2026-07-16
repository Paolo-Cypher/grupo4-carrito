const http = require("http");
const https = require("https");
const { URL } = require("url");
const { randomUUID } = require("crypto");

const express = require("express");
const swaggerUi = require("swagger-ui-express");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(express.json());

// ============================================
// TRAZABILIDAD — X-Request-Id / X-Correlation-Id
// ============================================

app.use((req, res, next) => {
  // Solo las rutas de negocio (/cart, /checkout) exigen los headers de
  // trazabilidad. Swagger (/docs y sus assets) queda exento.
  const requiresTracing =
    req.path.startsWith("/cart") || req.path.startsWith("/checkout");

  if (requiresTracing) {
    const requestId = req.headers["x-request-id"];
    const correlationId = req.headers["x-correlation-id"];

    if (!requestId) {
      return res.status(400).json({
        timestamp: new Date().toISOString(),
        status: 400,
        code: "MISSING_HEADER",
        message: "Header X-Request-Id es requerido",
        correlationId: "N/A",
      });
    }

    if (!correlationId) {
      return res.status(400).json({
        timestamp: new Date().toISOString(),
        status: 400,
        code: "MISSING_HEADER",
        message: "Header X-Correlation-Id es requerido",
        correlationId: "N/A",
      });
    }

    req.requestId = requestId;
    req.correlationId = correlationId;
    res.setHeader("x-request-id", req.requestId);
    res.setHeader("x-correlation-id", req.correlationId);
    console.log(
      `[${req.method}] ${req.path} | requestId=${req.requestId} | correlationId=${req.correlationId}`
    );
  }

  next();
});

// ============================================
// SWAGGER / OpenAPI — disponible en /docs
// ============================================

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "Grupo 4 - Carrito API",
    version: "1.0.0",
    description:
      "Microservicio de carrito de compras (Node.js + Express + Supabase). " +
      "Incluye gestión de items, consulta de precio al catálogo de Grupo 3, " +
      "validación de carrito CHECKED_OUT y checkout idempotente.",
  },
  servers: [{ url: "/", description: "Servidor actual" }],
  tags: [
    { name: "Cart", description: "Operaciones sobre el carrito" },
    { name: "Checkout", description: "Proceso de checkout idempotente" },
  ],
  components: {
    schemas: {
      CartItem: {
        type: "object",
        properties: {
          cart_id: { type: "string", example: "carrito-Juan" },
          product_id: { type: "string", example: "P-100" },
          quantity: { type: "integer", example: 2 },
          unit_price: { type: "integer", example: 14990 },
          subtotal: { type: "integer", example: 29980 },
        },
      },
      Cart: {
        type: "object",
        properties: {
          id: { type: "string", example: "carrito-Juan" },
          userId: { type: "string", example: "Juan" },
          status: {
            type: "string",
            enum: ["ACTIVE", "CHECKED_OUT"],
            example: "ACTIVE",
          },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/CartItem" },
          },
          totalAmount: { type: "integer", example: 29980 },
        },
      },
      AddItemRequest: {
        type: "object",
        required: ["productId"],
        properties: {
          productId: { type: "string", example: "P-100" },
          quantity: { type: "integer", minimum: 1, default: 1, example: 1 },
        },
      },
      CheckoutRequest: {
        type: "object",
        required: ["userId"],
        properties: {
          userId: { type: "string", example: "Juan" },
        },
      },
      CheckoutResponse: {
        type: "object",
        properties: {
          orderId: { type: "string", example: "ORD-1001" },
          status: { type: "string", example: "CREATED" },
          totalAmount: { type: "integer", example: 29980 },
        },
      },
      Error: {
        type: "object",
        properties: {
          detail: {
            oneOf: [{ type: "string" }, { type: "object" }],
            example: "Cart not found",
          },
        },
      },
      DuplicatedOrder: {
        type: "object",
        properties: {
          detail: {
            type: "object",
            properties: {
              message: { type: "string", example: "Intento duplicado" },
              orderId: { type: "string", example: "ORD-1001" },
              status: { type: "string", example: "DUPLICATED_ORDER" },
            },
          },
        },
      },
    },
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token emitido por G2 (Grupo Identidad)",
      },
    },
  },
  paths: {
    "/cart/{userId}": {
      get: {
        tags: ["Cart"],
        summary: "Ver carrito (lo crea si no existe)",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "userId",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "Juan",
          },
        ],
        responses: {
          200: {
            description: "Carrito obtenido/creado",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Cart" },
              },
            },
          },
          400: {
            description: "userId inválido",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          401: {
            description: "Token ausente, inválido o expirado",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          403: {
            description: "El userId no coincide con el usuario del token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          503: {
            description: "Servicio de identidad (G2) no disponible",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          500: {
            description: "Error interno",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/cart/{userId}/items": {
      post: {
        tags: ["Cart"],
        summary: "Agregar producto al carrito",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "userId",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "Juan",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AddItemRequest" },
              example: { productId: "P-100", quantity: 1 },
            },
          },
        },
        responses: {
          200: {
            description: "Item agregado, carrito actualizado",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Cart" },
              },
            },
          },
          400: {
            description:
              "Datos inválidos o carrito CHECKED_OUT (no se pueden agregar productos)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  detail:
                    "El carrito ya fue procesado. No se pueden agregar productos.",
                },
              },
            },
          },
          401: {
            description: "Token ausente, inválido o expirado",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          403: {
            description: "El userId no coincide con el usuario del token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          404: {
            description: "Producto no encontrado en catálogo",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { detail: "Producto no encontrado" },
              },
            },
          },
          503: {
            description: "Catálogo de Grupo 3 o servicio de identidad (G2) no disponible",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { detail: "Grupo 3 no responde" },
              },
            },
          },
          500: {
            description: "Error interno",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/cart/{userId}/items/{productId}": {
      delete: {
        tags: ["Cart"],
        summary: "Eliminar producto del carrito",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "userId",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "Juan",
          },
          {
            name: "productId",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "P-100",
          },
        ],
        responses: {
          204: { description: "Item eliminado (sin body)" },
          400: {
            description: "Carrito CHECKED_OUT (no se pueden eliminar productos)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: {
                  detail:
                    "El carrito ya fue procesado. No se pueden eliminar productos.",
                },
              },
            },
          },
          401: {
            description: "Token ausente, inválido o expirado",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          403: {
            description: "El userId no coincide con el usuario del token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          404: {
            description: "Carrito o item no encontrado",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { detail: "Item not found" },
              },
            },
          },
          503: {
            description: "Servicio de identidad (G2) no disponible",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          500: {
            description: "Error interno",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/checkout": {
      post: {
        tags: ["Checkout"],
        summary: "Procesar checkout (idempotente)",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            description: "Clave de idempotencia para evitar órdenes duplicadas",
            schema: { type: "string" },
            example: "550e8400-e29b-41d4-a716-446655440000",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CheckoutRequest" },
              example: { userId: "Juan" },
            },
          },
        },
        responses: {
          201: {
            description: "Orden creada",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutResponse" },
                example: {
                  orderId: "ORD-1001",
                  status: "CREATED",
                  totalAmount: 29980,
                },
              },
            },
          },
          400: {
            description:
              "Falta userId/Idempotency-Key o carrito vacío",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { detail: "Carrito vacío" },
              },
            },
          },
          401: {
            description: "Token ausente, inválido o expirado",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          403: {
            description: "El userId no coincide con el usuario del token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          503: {
            description: "Servicio de identidad (G2) no disponible",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          404: {
            description: "Carrito no encontrado",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { detail: "Cart not found" },
              },
            },
          },
          409: {
            description: "Intento duplicado (Idempotency-Key ya usada)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DuplicatedOrder" },
                example: {
                  detail: {
                    message: "Intento duplicado",
                    orderId: "ORD-1001",
                    status: "DUPLICATED_ORDER",
                  },
                },
              },
            },
          },
          500: {
            description: "Error interno o fallo con G5",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
  },
};

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ============================================
// INICIALIZAR SUPABASE
// ============================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const g5OrdersUrl = process.env.G5_ORDERS_URL;
const g3CatalogUrl = process.env.G3_CATALOG_URL || "https://catalog-api-cm1l.onrender.com/api/v1/products";
const g2AuthUrl = process.env.G2_AUTH_URL || "https://auth-minimarket-cloud.onrender.com";
const g2AuthValidateEndpoint = process.env.G2_AUTH_VALIDATE_ENDPOINT || "/auth/validate";
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT || 5000);

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY son requeridos");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Ejecuta una query de supabase-js y, si devuelve error, lo lanza.
// Equivale a que supabase-py levante una excepción (atrapada como 500).
async function run(query) {
  const { data, error } = await query;
  if (error) {
    const err = new Error(error.message);
    err.code = error.code;
    err.details = error.details;
    throw err;
  }
  return data;
}

// ============================================
// EXCEPCIÓN HTTP (equivalente a HTTPException)
// ============================================

class HttpException extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

class ValidationException extends Error {
  constructor(errors) {
    super("RequestValidationError");
    this.errors = errors;
  }
}

// ============================================
// RESPUESTA DE ERROR ESTANDARIZADA (contrato G4)
// ============================================

function errorResponse(res, status, code, message, correlationId) {
  return res.status(status).json({
    timestamp: new Date().toISOString(),
    status,
    code,
    message,
    correlationId,
  });
}

// ============================================
// AUTENTICACIÓN / AUTORIZACIÓN (G2)
// ============================================

async function validateTokenWithG2(token, requestId, correlationId) {
  const url = `${g2AuthUrl}${g2AuthValidateEndpoint}`;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), requestTimeoutMs);

  console.log(`[G2] correlationId=${correlationId} | validating token`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Request-Id": requestId,
        "X-Correlation-Id": correlationId,
        "X-Consumer": "grupo-4",
      },
      signal: controller.signal,
    });

    console.log(`[G2] correlationId=${correlationId} | status=${response.status}`);

    if (response.status >= 500) {
      throw new HttpException(503, "SERVICE_UNAVAILABLE", "G2 no responde");
    }

    if (!response.ok) {
      throw new HttpException(401, "UNAUTHORIZED", "Token inválido o expirado");
    }

    return await response.json();
  } catch (error) {
    if (error instanceof HttpException) {
      console.error(`[G2] correlationId=${correlationId} | error: ${error.message}`);
      throw error;
    }

    if (error && error.name === "AbortError") {
      console.error(`[G2] correlationId=${correlationId} | error: timeout`);
      throw new HttpException(503, "SERVICE_UNAVAILABLE", "G2 no responde");
    }

    console.error(`[G2] correlationId=${correlationId} | error: ${error.message}`);
    throw new HttpException(503, "SERVICE_UNAVAILABLE", `G2 no responde: ${error.message}`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    console.log(`[AUTH] correlationId=${req.correlationId} | Token requerido`);
    return errorResponse(res, 401, "UNAUTHORIZED", "Token requerido", req.correlationId);
  }

  try {
    req.user = await validateTokenWithG2(token, req.requestId, req.correlationId);
    req.token = token;
    console.log(
      `[AUTH] correlationId=${req.correlationId} | Auth OK: ${req.user && req.user.business_user_id}`
    );
    return next();
  } catch (error) {
    return handleError(req, res, error);
  }
}

function checkOwnership(req, targetUserId) {
  const businessUserId = req.user && req.user.business_user_id;
  if (!businessUserId || businessUserId !== targetUserId) {
    throw new HttpException(
      403,
      "FORBIDDEN",
      "El usuario del token no coincide con el recurso solicitado"
    );
  }
}

// ============================================
// HELPERS
// ============================================

function normalizeUserId(userId) {
  const normalized = userId ? userId.trim() : "";
  if (!normalized) {
    throw new HttpException(400, "INVALID_REQUEST", "userId es requerido");
  }
  return normalized;
}

// Mapea una fila de cart_items (snake_case de Postgres) al contrato camelCase.
function mapCartItem(item) {
  return {
    id: item.id,
    productId: item.product_id,
    quantity: item.quantity,
    unitPrice: parseFloat(item.unit_price),
    subtotal: parseFloat(item.subtotal),
  };
}

// Arma la respuesta de carrito según el contrato (items en camelCase y
// totalAmount recalculado como SUM(subtotal) sobre los items ya mapeados).
function mapCartResponse(cartId, userId, status, items, createdAt, updatedAt) {
  const mappedItems = (items || []).map(mapCartItem);
  const totalAmount = mappedItems.reduce((sum, i) => sum + i.subtotal, 0);
  return {
    id: cartId,
    userId: userId,
    status: status,
    items: mappedItems,
    totalAmount: totalAmount,
    createdAt: createdAt,
    updatedAt: updatedAt,
  };
}

function buildG5OrderPayload(userId, items) {
  return {
    userId: userId,
    items: items.map((item) => ({
      productId: item.product_id,
      quantity: item.quantity,
      unitPrice: parseFloat(item.unit_price),
    })),
  };
}

async function rollbackCheckout(cartId, idempotencyKey) {
  await run(
    supabase.from("carts").update({ status: "ACTIVE" }).eq("id", cartId)
  );
  await run(
    supabase
      .from("checkout_attempts")
      .update({ status: "FAILED" })
      .eq("cart_id", cartId)
      .eq("idempotency_key", idempotencyKey)
  );
}

function buildG3ItemUrl(productId) {
  const catalogBaseUrl = g3CatalogUrl.trim();
  if (!catalogBaseUrl) {
    throw new HttpException(503, "SERVICE_UNAVAILABLE", "G3_CATALOG_URL no configurada");
  }

  const normalizedBase = catalogBaseUrl.replace(/\/+$/, "");
  const basePath = normalizedBase.endsWith("/products")
    ? normalizedBase
    : `${normalizedBase}/products`;

  return `${basePath}/${encodeURIComponent(productId)}`;
}

async function fetchG3Product(productId, requestId, correlationId) {
  let itemUrl;
  try {
    itemUrl = buildG3ItemUrl(productId);
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
    throw new HttpException(503, "SERVICE_UNAVAILABLE", "No se pudo construir la URL de Grupo 3");
  }

  const timeoutMs = Number(process.env.G3_CATALOG_TIMEOUT_MS || 5000);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  console.log(`[fetchG3Product] Sending request to G3: ${itemUrl}`);
  console.log(`[fetchG3Product] requestId: ${requestId} (type: ${typeof requestId})`);
  console.log(`[fetchG3Product] correlationId: ${correlationId} (type: ${typeof correlationId})`);

  try {
    const response = await fetch(itemUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Consumer": "grupo-4",
        "X-Request-Id": requestId,
        "X-Correlation-Id": correlationId,
      },
      signal: controller.signal,
    });

    if (response.status === 404) {
      throw new HttpException(404, "NOT_FOUND", "Producto no encontrado");
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "N/A");
      throw new HttpException(
        503,
        "SERVICE_UNAVAILABLE",
        `Grupo 3 respondió ${response.status}: ${errorText}`
      );
    }

    const body = await response.json();
    const price = Number(body.price ?? body.unit_price ?? body.unitPrice);

    if (!Number.isFinite(price) || price < 0) {
      throw new HttpException(
        503,
        "SERVICE_UNAVAILABLE",
        "Grupo 3 devolvió un precio inválido"
      );
    }

    return { price, raw: body };
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error && error.name === "AbortError") {
      throw new HttpException(503, "SERVICE_UNAVAILABLE", "Grupo 3 no responde");
    }

    throw new HttpException(
      503,
      "SERVICE_UNAVAILABLE",
      `Grupo 3 no responde: ${error.message}`
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function createOrderInG5(payload, idempotencyKey, requestId, correlationId, token) {
  return new Promise((resolve, reject) => {
    if (!g5OrdersUrl) {
      reject(new HttpException(500, "INTERNAL_SERVER_ERROR", "G5_ORDERS_URL no configurada"));
      return;
    }

    const body = Buffer.from(JSON.stringify(payload), "utf-8");
    let parsedUrl;
    try {
      parsedUrl = new URL(g5OrdersUrl);
    } catch (err) {
      reject(
        new HttpException(
          500,
          "INTERNAL_SERVER_ERROR",
          `No se pudo conectar con G5: ${err.message}`
        )
      );
      return;
    }

    const transport = parsedUrl.protocol === "https:" ? https : http;
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length,
        "Idempotency-Key": idempotencyKey,
        "X-Request-Id": requestId,
        "X-Correlation-Id": correlationId,
        "X-Consumer": "grupo-4",
        Authorization: `Bearer ${token}`,
      },
      timeout: 10000,
    };

    const request = transport.request(parsedUrl, options, (response) => {
      let responseText = "";
      response.setEncoding("utf-8");
      response.on("data", (chunk) => {
        responseText += chunk;
      });
      response.on("end", () => {
        const statusCode = response.statusCode || 0;
        console.log(`[G5] correlationId=${correlationId} | status=${statusCode}`);
        if (statusCode === 422) {
          reject(
            new HttpException(
              422,
              "OUT_OF_STOCK",
              `G5 respondió 422: ${responseText || response.statusMessage}`
            )
          );
          return;
        }
        if (statusCode >= 400) {
          reject(
            new HttpException(
              500,
              "INTERNAL_SERVER_ERROR",
              `G5 respondió ${statusCode}: ${responseText || response.statusMessage}`
            )
          );
          return;
        }
        try {
          resolve(responseText ? JSON.parse(responseText) : {});
        } catch (err) {
          resolve({});
        }
      });
    });

    request.on("timeout", () => {
      request.destroy();
      reject(
        new HttpException(500, "INTERNAL_SERVER_ERROR", "No se pudo conectar con G5: timeout")
      );
    });

    request.on("error", (err) => {
      reject(
        new HttpException(
          500,
          "INTERNAL_SERVER_ERROR",
          `No se pudo conectar con G5: ${err.message}`
        )
      );
    });

    request.write(body);
    request.end();
  });
}

// ============================================
// VALIDACIÓN DE BODY (equivalente a modelos Pydantic)
// ============================================

function parseAddItemRequest(body) {
  const errors = [];
  if (!body || typeof body.productId !== "string") {
    errors.push({ loc: ["body", "productId"], msg: "productId es requerido" });
  }
  if (!body || body.quantity === undefined || body.quantity === null) {
    errors.push({ loc: ["body", "quantity"], msg: "quantity es requerido" });
  } else if (!Number.isInteger(body.quantity) || body.quantity <= 0) {
    errors.push({ loc: ["body", "quantity"], msg: "quantity debe ser > 0" });
  }
  if (errors.length > 0) {
    throw new ValidationException(errors);
  }
  return { productId: body.productId, quantity: body.quantity };
}

function parseCheckoutRequest(body) {
  const errors = [];
  if (!body || typeof body.userId !== "string") {
    errors.push({ loc: ["body", "userId"], msg: "userId es requerido" });
  }
  if (errors.length > 0) {
    throw new ValidationException(errors);
  }
  return { userId: body.userId };
}

app.use(authMiddleware);

// ============================================
// ENDPOINT 1: Ver carrito
// ============================================

app.get("/cart/:userId", async (req, res) => {
  try {
    const userId = normalizeUserId(req.params.userId);
    checkOwnership(req, userId);

    // Obtener o crear carrito
    const result = await run(
      supabase
        .from("carts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
    );

    let cart;
    if (!result || result.length === 0) {
      // Si no existe carrito activo, crear uno
      const newCart = await run(
        supabase
          .from("carts")
          .insert({ user_id: userId, status: "ACTIVE" })
          .select()
      );
      cart = newCart[0];
    } else {
      cart = result[0];
    }

    const cartId = cart.id;

    // Obtener items del carrito
    const items = await run(
      supabase.from("cart_items").select("*").eq("cart_id", cartId)
    );

    return res
      .status(200)
      .json(
        mapCartResponse(
          cartId,
          userId,
          cart.status,
          items,
          cart.created_at,
          cart.updated_at
        )
      );
  } catch (e) {
    return handleError(req, res, e);
  }
});

// ============================================
// ENDPOINT 2: Agregar producto
// ============================================

app.post("/cart/:userId/items", async (req, res) => {
  try {
    const userId = normalizeUserId(req.params.userId);
    checkOwnership(req, userId);
    const data = parseAddItemRequest(req.body);

    const catalogProduct = await fetchG3Product(data.productId, req.requestId, req.correlationId);
    const catalogPrice = catalogProduct.price;
    
    // Obtener carrito
    const cartData = await run(
      supabase
        .from("carts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
    );

    if (!cartData || cartData.length === 0) {
      throw new HttpException(404, "NOT_FOUND", "Cart not found");
    }

    const cart = cartData[0];
    const cartId = cart.id;

    // Validar que el carrito no esté CHECKED_OUT
    if (cart.status === "CHECKED_OUT") {
      throw new HttpException(
        400,
        "CART_ALREADY_CHECKED_OUT",
        "El carrito ya fue procesado. No se pueden agregar productos."
      );
    }

    // Verificar si el producto ya existe en el carrito
    const existingItem = await run(
      supabase
        .from("cart_items")
        .select("*")
        .eq("cart_id", cartId)
        .eq("product_id", data.productId)
    );

    if (existingItem && existingItem.length > 0) {
      // Producto existe → sumar cantidad
      const newQuantity = existingItem[0].quantity + data.quantity;
      const unitPrice = Number(existingItem[0].unit_price ?? catalogPrice);
      const newSubtotal = newQuantity * unitPrice;
      await run(
        supabase
          .from("cart_items")
          .update({ quantity: newQuantity, subtotal: newSubtotal, unit_price: unitPrice })
          .eq("cart_id", cartId)
          .eq("product_id", data.productId)
      );
    } else {
      // Producto no existe → insertar
      const subtotal = data.quantity * catalogPrice;
      await run(
        supabase.from("cart_items").insert({
          cart_id: cartId,
          product_id: data.productId,
          quantity: data.quantity,
          unit_price: catalogPrice,
          subtotal: subtotal,
        })
      );
    }

    // Obtener carrito actualizado
    const items = await run(
      supabase.from("cart_items").select("*").eq("cart_id", cartId)
    );

    return res
      .status(200)
      .json(
        mapCartResponse(
          cartId,
          userId,
          cart.status,
          items,
          cart.created_at,
          cart.updated_at
        )
      );
  } catch (e) {
    return handleError(req, res, e);
  }
});

// ============================================
// ENDPOINT 3: Eliminar producto — 204 sin body
// ============================================

app.delete("/cart/:userId/items/:productId", async (req, res) => {
  try {
    const userId = normalizeUserId(req.params.userId);
    checkOwnership(req, userId);
    const productId = req.params.productId;

    // Obtener carrito
    const cartData = await run(
      supabase
        .from("carts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
    );

    if (!cartData || cartData.length === 0) {
      throw new HttpException(404, "NOT_FOUND", "Cart not found");
    }

    const cart = cartData[0];
    const cartId = cart.id;

    const itemData = await run(
      supabase
        .from("cart_items")
        .select("*")
        .eq("cart_id", cartId)
        .eq("product_id", productId)
    );
    if (!itemData || itemData.length === 0) {
      throw new HttpException(404, "NOT_FOUND", "Item not found");
    }

    // Validar que el carrito no esté CHECKED_OUT
    if (cart.status === "CHECKED_OUT") {
      throw new HttpException(
        400,
        "CART_ALREADY_CHECKED_OUT",
        "El carrito ya fue procesado. No se pueden eliminar productos."
      );
    }

    // Eliminar item
    await run(
      supabase
        .from("cart_items")
        .delete()
        .eq("cart_id", cartId)
        .eq("product_id", productId)
    );

    return res.status(204).send();
  } catch (e) {
    return handleError(req, res, e);
  }
});

// ============================================
// ENDPOINT 4: Checkout — Idempotency-Key en HEADER
// ============================================

app.post("/checkout", async (req, res) => {
  try {
    const data = parseCheckoutRequest(req.body);
    const userId = normalizeUserId(data.userId);
    checkOwnership(req, userId);
    const idempotencyKey = req.get("Idempotency-Key");

    if (!userId || !idempotencyKey) {
      throw new HttpException(400, "INVALID_REQUEST", "userId y Idempotency-Key requeridos");
    }

    // Verificar si ya existe este intento de checkout (idempotencia)
    const existing = await run(
      supabase
        .from("checkout_attempts")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
    );

    if (existing && existing.length > 0) {
      const currentAttempt = existing[0];
      throw new HttpException(
        409,
        "DUPLICATED_ORDER",
        `Intento duplicado, orderId existente: ${currentAttempt.order_id ?? "N/A"}`
      );
    }

    // Obtener carrito
    const cartData = await run(
      supabase
        .from("carts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
    );

    if (!cartData || cartData.length === 0) {
      throw new HttpException(404, "NOT_FOUND", "Cart not found");
    }

    const cart = cartData[0];
    const cartId = cart.id;

    // Verificar que el carrito tenga items
    const items = await run(
      supabase.from("cart_items").select("*").eq("cart_id", cartId)
    );
    if (!items || items.length === 0) {
      throw new HttpException(400, "EMPTY_CART", "Carrito vacío");
    }

    // Registrar intento antes de llamar a G5
    let attemptRows;
    try {
      attemptRows = await run(
        supabase
          .from("checkout_attempts")
          .insert({
            cart_id: cartId,
            idempotency_key: idempotencyKey,
            status: "PENDING",
          })
          .select()
      );
    } catch (error) {
      if (error.code === "23505") {
        const raceWinner = await run(
          supabase
            .from("checkout_attempts")
            .select("*")
            .eq("idempotency_key", idempotencyKey)
        );
        const orderId = raceWinner && raceWinner[0] && raceWinner[0].order_id;
        throw new HttpException(
          409,
          "DUPLICATED_ORDER",
          `Intento duplicado, orderId existente: ${orderId ?? "N/A"}`
        );
      }
      throw error;
    }
    const attemptId = attemptRows[0].id;

    // Marcar carrito como CHECKED_OUT
    await run(
      supabase.from("carts").update({ status: "CHECKED_OUT" }).eq("id", cartId)
    );

    const g5Payload = buildG5OrderPayload(userId, items);
    let g5Response;
    try {
      g5Response = await createOrderInG5(
        g5Payload,
        idempotencyKey,
        req.requestId,
        req.correlationId,
        req.token
      );
    } catch (error) {
      await rollbackCheckout(cartId, idempotencyKey);
      throw error;
    }

    // G5 devuelve el UUID del pedido en `id` y el legible en `orderNumber`
    // (verificado contra el servicio real). G6 necesita el UUID para reconciliar
    // pagos, así que `id` va primero; el resto son fallbacks defensivos por si
    // G5 cambia el nombre del campo, y orderNumber evita romper el checkout.
    const orderId =
      g5Response.id ||
      g5Response.orderId ||
      g5Response.order_id ||
      g5Response.orderNumber;
    const orderNumber = g5Response.orderNumber || g5Response.orderId;

    if (!orderId) {
      await rollbackCheckout(cartId, idempotencyKey);
      throw new HttpException(500, "INTERNAL_SERVER_ERROR", "G5 no devolvió orderId");
    }

    await run(
      supabase
        .from("checkout_attempts")
        .update({ order_id: orderId, status: "SUCCESS" })
        .eq("cart_id", cartId)
        .eq("idempotency_key", idempotencyKey)
    );

    return res.status(201).json({
      attemptId: attemptId,
      orderId: orderId,         // UUID real — lo que necesita G6
      orderNumber: orderNumber, // legible — solo para mostrar en UI de G1
      uuid: userId,
      status: "SUCCESS",
      message: "Checkout completado exitosamente.",
    });
  } catch (e) {
    return handleError(req, res, e);
  }
});

// ============================================
// MANEJO DE ERRORES CENTRALIZADO
// ============================================

function handleError(req, res, e) {
  const correlationId = req.correlationId;
  console.error("TRACING_ERROR | correlationId=" + correlationId + " | " + e.message);

  if (e instanceof ValidationException) {
    const message = e.errors.map((err) => err.msg).join("; ");
    return errorResponse(res, 400, "INVALID_REQUEST", message, correlationId);
  }
  if (e instanceof HttpException) {
    return errorResponse(res, e.statusCode, e.code, e.message, correlationId);
  }
  // Cualquier otro error → 500
  return errorResponse(
    res,
    500,
    "INTERNAL_SERVER_ERROR",
    `Error: ${e.message}`,
    correlationId
  );
}

// ============================================
// MANEJO DE ERRORES DE EXPRESS (body JSON malformado, etc.)
// ============================================

app.use((err, req, res, next) => {
  const correlationId =
    req.correlationId || req.headers["x-correlation-id"] || randomUUID();

  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return errorResponse(
      res,
      400,
      "INVALID_REQUEST",
      "El body de la request no es JSON válido",
      correlationId
    );
  }

  console.error("TRACING_ERROR | correlationId=" + correlationId + " | " + err.message);
  return errorResponse(
    res,
    500,
    "INTERNAL_SERVER_ERROR",
    `Error: ${err.message}`,
    correlationId
  );
});

// ============================================
// EJECUTAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 8000;
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
