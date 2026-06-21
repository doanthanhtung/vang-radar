import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { loadConfig } from "@vang-radar/config";
import { AppModule } from "./app.module.js";

export async function createApiApp() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    {
      logger: ["error", "warn", "log"]
    }
  );

  if (process.env.NODE_ENV !== "test") {
    await app.register(helmet);
    await app.register(rateLimit, {
      max: 300,
      timeWindow: "1 minute"
    });
  }
  const publicWebUrls = (process.env.PUBLIC_WEB_URL ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const allowedOrigins = new Set(
    [...publicWebUrls, "http://localhost:3000", "http://127.0.0.1:3000"].filter(
      (origin): origin is string => Boolean(origin)
    )
  );
  app.enableCors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.has(origin) ||
        /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: false
  });
  app.setGlobalPrefix("api/v1");

  if (process.env.NODE_ENV !== "test") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("VangScore API")
      .setDescription("Public market data and administrative API for VangScore")
      .setVersion("0.1.0")
      .addBasicAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  return app;
}

async function bootstrap() {
  const config = loadConfig();
  const app = await createApiApp();
  await app.listen(config.API_PORT, "0.0.0.0");
}

if (process.env.NODE_ENV !== "test") {
  void bootstrap();
}
