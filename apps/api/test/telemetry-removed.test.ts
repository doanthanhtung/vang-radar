import { afterEach, describe, it } from "vitest";
import request from "supertest";
import { createApiApp } from "../src/main.js";

describe("removed visitor tracking routes", () => {
  let app: Awaited<ReturnType<typeof createApiApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("does not expose the telemetry access endpoint", async () => {
    process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/vangradar";
    process.env.REDIS_URL ??= "redis://localhost:6379";
    app = await createApiApp();
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;

    await request(`http://127.0.0.1:${port}`)
      .post("/api/v1/telemetry/access")
      .send({ ipAddress: "203.0.113.10", path: "/" })
      .expect(404);
  });
});
