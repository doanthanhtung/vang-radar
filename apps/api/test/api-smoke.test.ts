import { describe, it } from "vitest";
import request from "supertest";
import { createApiApp } from "../src/main.js";

describe("API smoke", () => {
  it("serves health, products, and market summary", async () => {
    process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/vangradar";
    process.env.REDIS_URL ??= "redis://localhost:6379";

    const app = await createApiApp();
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    const server = `http://127.0.0.1:${port}`;

    await request(server).get("/api/v1/health").expect(200);
    await request(server).get("/api/v1/products").expect(200);
    await request(server).get("/api/v1/market/summary").expect(200);

    await app.close();
  });
});
