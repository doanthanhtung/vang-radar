import { Module } from "@nestjs/common";
import { AdminController } from "./modules/admin/admin.controller.js";
import { AuditService } from "./modules/admin/audit.service.js";
import { AdminService } from "./modules/admin/admin.service.js";
import { AccessLogService } from "./modules/telemetry/access-log.service.js";
import { TelemetryController } from "./modules/telemetry/telemetry.controller.js";
import { HealthController } from "./modules/health/health.controller.js";
import { MarketController } from "./modules/market/market.controller.js";
import { MarketService } from "./modules/market/market.service.js";
import { MetricsController } from "./modules/metrics/metrics.controller.js";
import { MetricsService } from "./modules/metrics/metrics.service.js";
import { PricesController } from "./modules/prices/prices.controller.js";
import { GoldPricesController } from "./modules/prices/gold-prices.controller.js";
import { PricesService } from "./modules/prices/prices.service.js";
import { ProductsController } from "./modules/products/products.controller.js";
import { ProductsService } from "./modules/products/products.service.js";
import { SignalsController } from "./modules/signals/signals.controller.js";
import { SignalsService } from "./modules/signals/signals.service.js";
import { PrismaService } from "./common/prisma.service.js";
import { RedisService } from "./common/redis.service.js";

@Module({
  controllers: [
    HealthController,
    ProductsController,
    PricesController,
    GoldPricesController,
    MetricsController,
    SignalsController,
    MarketController,
    AdminController,
    TelemetryController
  ],
  providers: [
    PrismaService,
    RedisService,
    ProductsService,
    PricesService,
    MetricsService,
    SignalsService,
    MarketService,
    AdminService,
    AuditService,
    AccessLogService
  ]
})
export class AppModule {}
