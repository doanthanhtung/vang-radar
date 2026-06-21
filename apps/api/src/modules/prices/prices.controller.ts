import { Controller, Get, Inject, Query, UseInterceptors } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { historyRangeSchema, productCodeSchema } from "@vang-radar/domain";
import { PublicCacheControlInterceptor } from "../../common/cache-control.interceptor.js";
import { PricesService } from "./prices.service.js";

@ApiTags("prices")
@Controller("prices")
@UseInterceptors(PublicCacheControlInterceptor)
export class PricesController {
  constructor(@Inject(PricesService) private readonly pricesService: PricesService) {}

  @Get("latest")
  getLatest() {
    return this.pricesService.getLatest();
  }

  @Get("history")
  getHistory(@Query("productCode") productCode: string, @Query("range") range = "30d") {
    return this.pricesService.getHistory(
      productCodeSchema.parse(productCode),
      historyRangeSchema.parse(range)
    );
  }
}
