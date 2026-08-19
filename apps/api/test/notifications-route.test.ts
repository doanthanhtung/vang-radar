import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApiApp } from "../src/main.js";

describe("notifications unsubscribe route", () => {
  it("routes a signed-token-shaped path to the unsubscribe handler", async () => {
    process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/vangradar";
    process.env.REDIS_URL ??= "redis://localhost:6379";
    process.env.EMAIL_UNSUBSCRIBE_SECRET = "x".repeat(32);

    const app = await createApiApp();
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    const token = `${"payload".repeat(24)}.${"signature".repeat(6)}`;
    const response = await request(`http://127.0.0.1:${port}`)
      .post(`/api/v1/notifications/unsubscribe/${token}`)
      .expect(404);

    expect(response.body.message).toBe("Not Found");
    await app.close();
  });
});
