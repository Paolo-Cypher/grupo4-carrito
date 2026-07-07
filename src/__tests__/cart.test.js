const { randomUUID } = require("crypto");
const request = require("supertest");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = require("../index");

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

function mockG3ProductFetch(productId, price) {
  return jest.spyOn(global, "fetch").mockImplementation(async (url) => {
    if (String(url).includes(`/products/${encodeURIComponent(productId)}`)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: productId, price }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ detail: "Producto no encontrado" }),
    };
  });
}

function mockG3NotFoundFetch() {
  return jest.spyOn(global, "fetch").mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({ detail: "Producto no encontrado" }),
  });
}

function mockG3UnavailableFetch() {
  return jest.spyOn(global, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));
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
  // GET crea el carrito automáticamente si no existe
  await request(app).get(`/cart/${TEST_USER}`);
});

afterAll(async () => {
  await cleanupUser(TEST_USER);
  await cleanupUser(NEW_USER);
  await cleanupUser(CHECKOUT_USER);
});

describe("GET /cart/:userId", () => {
  test("retorna 200 y crea carrito si no existe", async () => {
    const res = await request(app).get(`/cart/${NEW_USER}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body.userId).toBe(NEW_USER);
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.items).toEqual([]);
    expect(res.body.totalAmount).toBe(0);
  });

  test("retorna 400 si userId está vacío", async () => {
    // %20 decodifica a un espacio; normalizeUserId lo recorta y queda vacío
    const res = await request(app).get("/cart/%20");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
    expect(res.body.message).toBe("userId es requerido");
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
      .send({ productId: "P-100", quantity: 1 });

    expect(res.status).toBe(200);
    const item = res.body.items.find((i) => i.product_id === "P-100");
    expect(item).toBeDefined();
    expect(item.quantity).toBe(1);
    expect(item.unit_price).toBe(14990);
    expect(item.subtotal).toBe(14990);
  });

  test("retorna 400 si falta productId en body", async () => {
    mockG3ProductFetch("P-100", g3Products["P-100"]);

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .send({ quantity: 1 });

    expect(res.status).toBe(400);
  });

  test("retorna 400 si quantity es 0", async () => {
    mockG3ProductFetch("P-100", g3Products["P-100"]);

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .send({ productId: "P-100", quantity: 0 });

    expect(res.status).toBe(400);
  });

  test("retorna 400 si quantity es negativa", async () => {
    mockG3ProductFetch("P-100", g3Products["P-100"]);

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .send({ productId: "P-100", quantity: -1 });

    expect(res.status).toBe(400);
  });

  test("suma quantity si el mismo productId ya existe", async () => {
    mockG3ProductFetch("P-200", g3Products["P-200"]);

    await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .send({ productId: "P-200", quantity: 2 });

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .send({ productId: "P-200", quantity: 3 });

    expect(res.status).toBe(200);
    const item = res.body.items.find((i) => i.product_id === "P-200");
    expect(item).toBeDefined();
    expect(item.quantity).toBe(5);
    expect(item.unit_price).toBe(20000);
    expect(item.subtotal).toBe(100000);
  });

  test("retorna 404 si el producto no existe en catálogo", async () => {
    mockG3NotFoundFetch();

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .send({ productId: "NO-EXISTE", quantity: 1 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  test("retorna 503 si el catálogo no responde", async () => {
    mockG3UnavailableFetch();

    const res = await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .send({ productId: "G3-HANG", quantity: 1 });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("DELETE /cart/:userId/items/:productId", () => {
  test("retorna 204 al eliminar item existente", async () => {
    // Asegura el item para este test, independiente de otros describes
    mockG3ProductFetch("P-999", g3Products["P-999"]);

    await request(app)
      .post(`/cart/${TEST_USER}/items`)
      .send({ productId: "P-999", quantity: 1 });

    const res = await request(app).delete(`/cart/${TEST_USER}/items/P-999`);

    expect(res.status).toBe(204);
  });

  test("retorna 404 si el item no existe", async () => {
    const res = await request(app).delete(
      `/cart/${TEST_USER}/items/NO-EXISTE`
    );

    expect(res.status).toBe(404);
  });
});

describe("POST /checkout", () => {
  test("retorna 400 si userId está vacío en body", async () => {
    const res = await request(app)
      .post("/checkout")
      .set("Idempotency-Key", randomUUID())
      .send({ userId: "" });

    expect(res.status).toBe(400);
  });

  test("retorna 409 si se envía el mismo Idempotency-Key dos veces", async () => {
    // Carrito propio para este test, con un item, independiente de otros describes
    mockG3ProductFetch("P-100", g3Products["P-100"]);

    await request(app).get(`/cart/${CHECKOUT_USER}`);
    await request(app)
      .post(`/cart/${CHECKOUT_USER}/items`)
      .send({ productId: "P-100", quantity: 1 });

    const idempotencyKey = randomUUID();

    // Primer intento: puede fallar por validación de productId en G5 (500)
    // o completarse (201). No nos importa el resultado, solo que quede
    // registrado el intento con esta Idempotency-Key.
    await request(app)
      .post("/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .send({ userId: CHECKOUT_USER });

    // Segundo intento con la MISMA Idempotency-Key: debe ser 409 sin
    // importar el resultado del primero.
    const res = await request(app)
      .post("/checkout")
      .set("Idempotency-Key", idempotencyKey)
      .send({ userId: CHECKOUT_USER });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DUPLICATED_ORDER");
  });
});
