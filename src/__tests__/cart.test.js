const { randomUUID } = require("crypto");
const supertest = require("supertest");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Headers de trazabilidad obligatorios en /cart y /checkout (contrato).
// Se inyectan automáticamente en cada request de prueba vía el wrapper
// `request()` de abajo, para no repetirlos en los ~30 call sites.
const TRACE_HEADERS = {
  "X-Request-Id": "11111111-1111-1111-1111-111111111111",
  "X-Correlation-Id": "22222222-2222-2222-2222-222222222222",
};

// `rawRequest` = supertest sin headers de trazabilidad (para los tests que
// verifican precisamente la ausencia de esos headers).
const rawRequest = supertest;

// `request(app).get/post/delete(url)` inyecta los headers de trazabilidad y
// deja el resto del encadenamiento (.set, .send, etc.) intacto.
function request(app) {
  const agent = supertest(app);
  return {
    get: (url) => agent.get(url).set(TRACE_HEADERS),
    post: (url) => agent.post(url).set(TRACE_HEADERS),
    delete: (url) => agent.delete(url).set(TRACE_HEADERS),
  };
}

// El test de timeout de G2 necesita un timeout corto: se fuerza aquí (después
// de dotenv.config()) para no depender de si .env define REQUEST_TIMEOUT.
process.env.REQUEST_TIMEOUT = "200";

const app = require("../index");
const realFetch = global.fetch.bind(global);

const TEST_USER = "ci-test-" + Date.now();
const NEW_USER = `${TEST_USER}-new`;
const CHECKOUT_USER = `${TEST_USER}-checkout`;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const g3Products = {
  "P-100": 14990,
  "P-200": 20000,
  "P-205": 5000,
  "P-999": 9000,
};

function extractBearerToken(options) {
  const headers = (options && options.headers) || {};
  const authHeader = headers.Authorization || headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

function g2ValidResponseFor(token) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      valid: true,
      user_id: token,
      business_user_id: token,
      email: `${token}@test.local`,
      role: "customer",
      status: "active",
    }),
  };
}

function mockG3ProductFetch(productId, price) {
  return jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
    const strUrl = String(url);
    if (strUrl.includes("/auth/validate")) {
      return g2ValidResponseFor(extractBearerToken(options));
    }
    if (strUrl.includes(`/products/${encodeURIComponent(productId)}`)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: productId, price }),
      };
    }
    return realFetch(url, options);
  });
}

function mockG3NotFoundFetch() {
  return jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
    const strUrl = String(url);
    if (strUrl.includes("/auth/validate")) {
      return g2ValidResponseFor(extractBearerToken(options));
    }
    if (strUrl.includes("/products/")) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ detail: "Producto no encontrado" }),
      };
    }
    return realFetch(url, options);
  });
}

function mockG3UnavailableFetch() {
  return jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
    const strUrl = String(url);
    if (strUrl.includes("/auth/validate")) {
      return g2ValidResponseFor(extractBearerToken(options));
    }
    if (strUrl.includes("/products/")) {
      throw new Error("connect ECONNREFUSED");
    }
    return realFetch(url, options);
  });
}

function mockG2Valid() {
  return jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
    if (String(url).includes("/auth/validate")) {
      return g2ValidResponseFor(extractBearerToken(options));
    }
    return realFetch(url, options);
  });
}

function mockG2Invalid() {
  return jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
    if (String(url).includes("/auth/validate")) {
      return {
        ok: false,
        status: 401,
        json: async () => ({ valid: false }),
      };
    }
    return realFetch(url, options);
  });
}

function mockG2Error500() {
  return jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
    if (String(url).includes("/auth/validate")) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: "internal" }),
      };
    }
    return realFetch(url, options);
  });
}

function mockG2Timeout() {
  return jest.spyOn(global, "fetch").mockImplementation((url, options = {}) => {
    if (!String(url).includes("/auth/validate")) {
      return realFetch(url, options);
    }
    return new Promise((_, reject) => {
      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      }
    });
  });
}

// Limpia carrito, items y checkout_attempts de un usuario de prueba, sin
// filtrar por status (un checkout exitoso deja el carrito en CHECKED_OUT).
async function cleanupUser(userId) {
  const { data: carts } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", userId);

  if (!carts || carts.length === 0) return;

  const cartIds = carts.map((c) => c.id);
  await supabase.from("cart_items").delete().in("cart_id", cartIds);
  await supabase.from("checkout_attempts").delete().in("cart_id", cartIds);
  await supabase.from("carts").delete().in("id", cartIds);
}

beforeAll(async () => {
  const spy = mockG2Valid();
  // GET crea el carrito automáticamente si no existe
  await request(app)
    .get(`/cart/${TEST_USER}`)
    .set("Authorization", `Bearer ${TEST_USER}`);
  spy.mockRestore();
});

afterAll(async () => {
  await cleanupUser(TEST_USER);
  await cleanupUser(NEW_USER);
  await cleanupUser(CHECKOUT_USER);
});

describe("GET /cart/:userId", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("retorna 200 y crea carrito si no existe", async () => {
    mockG2Valid();

    const res = await request(app)
      .get(`/cart/${NEW_USER}`)
      .set("Authorization", `Bearer ${NEW_USER}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body.userId).toBe(NEW_USER);
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.items).toEqual([]);
    expect(res.body.totalAmount).toBe(0);
  });

  test("retorna 400 si userId está vacío", async () => {
    mockG2Valid();

    // %20 decodifica a un espacio; normalizeUserId lo recorta y queda vacío
    const res = await request(app)
      .get("/cart/%20")
      .set("Authorization", "Bearer any-token");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
    expect(res.body.message).toBe("userId es requerido");
  });
});

describe("Headers de trazabilidad obligatorios", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("GET /cart sin X-Request-Id → 400 MISSING_HEADER", async () => {
    mockG2Valid();

    const res = await rawRequest(app)
      .get(`/cart/${TEST_USER}`)
      .set("X-Correlation-Id", "22222222-2222-2222-2222-222222222222")
      .set("Authorization", `Bearer ${TEST_USER}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MISSING_HEADER");
    expect(res.body.message).toBe("Header X-Request-Id es requerido");
  });

  test("GET /cart sin X-Correlation-Id → 400 MISSING_HEADER", async () => {
    mockG2Valid();

    const res = await rawRequest(app)
      .get(`/cart/${TEST_USER}`)
      .set("X-Request-Id", "11111111-1111-1111-1111-111111111111")
      .set("Authorization", `Bearer ${TEST_USER}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MISSING_HEADER");
    expect(res.body.message).toBe("Header X-Correlation-Id es requerido");
  });
});

describe("POST /cart/:userId/items", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("retorna 200 al agregar item", async () => {
    mockG3ProductFetch("P-100", g3Products["P-100"]);

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ productId: "P-100", quantity: 1 });

    expect(res.status).toBe(200);
    const item = res.body.items.find((i) => i.productId === "P-100");
    expect(item).toBeDefined();
    expect(item.quantity).toBe(1);
    expect(item.unitPrice).toBe(14990);
    expect(item.subtotal).toBe(14990);
  });

  test("retorna 400 si falta productId en body", async () => {
    mockG3ProductFetch("P-100", g3Products["P-100"]);

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ quantity: 1 });

    expect(res.status).toBe(400);
  });

  test("retorna 400 si quantity es 0", async () => {
    mockG3ProductFetch("P-100", g3Products["P-100"]);

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ productId: "P-100", quantity: 0 });

    expect(res.status).toBe(400);
  });

  test("retorna 400 si quantity es negativa", async () => {
    mockG3ProductFetch("P-100", g3Products["P-100"]);

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ productId: "P-100", quantity: -1 });

    expect(res.status).toBe(400);
  });

  test("retorna 400 si falta quantity en body", async () => {
    mockG3ProductFetch("P-100", g3Products["P-100"]);

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ productId: "P-100" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
    expect(res.body.message).toBe("quantity es requerido");
  });

  test("suma quantity si el mismo productId ya existe", async () => {
    mockG3ProductFetch("P-200", g3Products["P-200"]);

    await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ productId: "P-200", quantity: 2 });

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ productId: "P-200", quantity: 3 });

    expect(res.status).toBe(200);
    const item = res.body.items.find((i) => i.productId === "P-200");
    expect(item).toBeDefined();
    expect(item.quantity).toBe(5);
    expect(item.unitPrice).toBe(20000);
    expect(item.subtotal).toBe(100000);
  });

  test("retorna 404 si el producto no existe en catálogo", async () => {
    mockG3NotFoundFetch();

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ productId: "NO-EXISTE", quantity: 1 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  test("retorna 503 si el catálogo no responde", async () => {
    mockG3UnavailableFetch();

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ productId: "G3-HANG", quantity: 1 });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("DELETE /cart/:userId/items/:productId", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("retorna 204 al eliminar item existente", async () => {
    // Asegura el item para este test, independiente de otros describes
    mockG3ProductFetch("P-999", g3Products["P-999"]);

    await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ productId: "P-999", quantity: 1 });

    const res = await request(app)
      .delete(`/cart/${TEST_USER}/items/P-999`)
      .set("Authorization", `Bearer ${TEST_USER}`);

    expect(res.status).toBe(204);
  });

  test("retorna 404 si el item no existe", async () => {
    mockG2Valid();

    const res = await request(app)
      .delete(`/cart/${TEST_USER}/items/NO-EXISTE`)
      .set("Authorization", `Bearer ${TEST_USER}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /checkout", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("retorna 400 si userId está vacío en body", async () => {
    mockG2Valid();

    const res = await request(app)
      .post("/checkout")
      .set("Authorization", "Bearer any-token")
      .set("Idempotency-Key", randomUUID())
      .send({ userId: "" });

    expect(res.status).toBe(400);
  });

  test("retorna 409 si se envía el mismo Idempotency-Key dos veces", async () => {
    // Carrito propio para este test, con un item, independiente de otros describes
    mockG3ProductFetch("P-100", g3Products["P-100"]);

    await request(app)
      .get(`/cart/${CHECKOUT_USER}`)
      .set("Authorization", `Bearer ${CHECKOUT_USER}`);
    await request(app)
      .post(`/cart/${CHECKOUT_USER}/items`)
      .set("Authorization", `Bearer ${CHECKOUT_USER}`)
      .send({ productId: "P-100", quantity: 1 });

    const idempotencyKey = randomUUID();

    // Primer intento: puede fallar por validación de productId en G5 (500)
    // o completarse (201). No nos importa el resultado, solo que quede
    // registrado el intento con esta Idempotency-Key.
    await request(app)
      .post("/checkout")
      .set("Authorization", `Bearer ${CHECKOUT_USER}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ userId: CHECKOUT_USER });

    // Segundo intento con la MISMA Idempotency-Key: debe ser 409 sin
    // importar el resultado del primero.
    const res = await request(app)
      .post("/checkout")
      .set("Authorization", `Bearer ${CHECKOUT_USER}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ userId: CHECKOUT_USER });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DUPLICATED_ORDER");
  });
});

describe("Authentication (G2 Integration)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("GET /cart sin token → 401 (Missing Auth Header)", async () => {
    const res = await request(app).get(`/cart/${TEST_USER}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(res.body.message).toBe("Token requerido");
  });

  test("GET /cart con token válido → 200 (devuelve carrito)", async () => {
    mockG2Valid();

    const res = await request(app)
      .get(`/cart/${TEST_USER}`)
      .set("Authorization", `Bearer ${TEST_USER}`);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(TEST_USER);
  });

  test("GET /cart con token inválido → 401 (Unauthorized)", async () => {
    mockG2Invalid();

    const res = await request(app)
      .get(`/cart/${TEST_USER}`)
      .set("Authorization", "Bearer bad-token");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(res.body.message).toBe("Token inválido o expirado");
  });

  test("GET /cart/:otherUser con token de otro usuario → 403 (Forbidden)", async () => {
    mockG2Valid();

    const res = await request(app)
      .get(`/cart/${TEST_USER}`)
      .set("Authorization", "Bearer someone-else");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  test("GET /cart con G2 timeout → 503 (Service Unavailable)", async () => {
    mockG2Timeout();

    const res = await request(app)
      .get(`/cart/${TEST_USER}`)
      .set("Authorization", `Bearer ${TEST_USER}`);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SERVICE_UNAVAILABLE");
  });

  test("GET /cart con error 500 de G2 → 503 (Service Unavailable)", async () => {
    mockG2Error500();

    const res = await request(app)
      .get(`/cart/${TEST_USER}`)
      .set("Authorization", `Bearer ${TEST_USER}`);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SERVICE_UNAVAILABLE");
  });

  test("POST /cart/:userId/items con token válido → 200", async () => {
    mockG3ProductFetch("P-205", g3Products["P-205"]);

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ productId: "P-205", quantity: 1 });

    expect(res.status).toBe(200);
  });

  test("DELETE /cart/:userId/items/:productId con token válido → 204", async () => {
    mockG3ProductFetch("P-205", g3Products["P-205"]);

    await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .set("Authorization", `Bearer ${TEST_USER}`)
      .send({ productId: "P-205", quantity: 1 });

    const res = await request(app)
      .delete(`/cart/${TEST_USER}/items/P-205`)
      .set("Authorization", `Bearer ${TEST_USER}`);

    expect(res.status).toBe(204);
  });

  test("POST /checkout con token válido pasa la autenticación (no 401/403)", async () => {
    // El resultado final (201 vs 500) depende del inventario real de G5, fuera
    // del control de este repo — igual que el test de idempotencia de arriba.
    // Aquí solo verificamos que un token válido y de dueño correcto atraviesa
    // authMiddleware/checkOwnership sin ser bloqueado.
    mockG3ProductFetch("P-100", g3Products["P-100"]);
    const checkoutAuthUser = `${CHECKOUT_USER}-auth`;

    await request(app)
      .get(`/cart/${checkoutAuthUser}`)
      .set("Authorization", `Bearer ${checkoutAuthUser}`);
    await request(app)
      .post(`/cart/${checkoutAuthUser}/items`)
      .set("Authorization", `Bearer ${checkoutAuthUser}`)
      .send({ productId: "P-100", quantity: 1 });

    const res = await request(app)
      .post("/checkout")
      .set("Authorization", `Bearer ${checkoutAuthUser}`)
      .set("Idempotency-Key", randomUUID())
      .send({ userId: checkoutAuthUser });

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);

    await cleanupUser(checkoutAuthUser);
  });
});
