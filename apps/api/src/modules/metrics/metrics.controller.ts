import { Controller, Get, Inject, Query, UseInterceptors } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { historyRangeSchema, productCodeSchema } from "@vang-radar/domain";
import { PublicCacheControlInterceptor } from "../../common/cache-control.interceptor.js";
import { MetricsService } from "./metrics.service.js";

@ApiTags("metrics")
@Controller("metrics")
@UseInterceptors(PublicCacheControlInterceptor)
export class MetricsController {
  constructor(@Inject(MetricsService) private readonly metricsService: MetricsService) {}

  @Get("latest")
  getLatest(@Query("productCode") productCode: string) {
    return this.metricsService.getLatest(productCodeSchema.parse(productCode));
  }

  @Get("history")
  getHistory(@Query("productCode") productCode: string, @Query("range") range = "30d") {
    return this.metricsService.getHistory(productCodeSchema.parse(productCode), historyRangeSchema.parse(range));
  }
}
