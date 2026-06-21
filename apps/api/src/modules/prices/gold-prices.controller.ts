import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  UseInterceptors
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { productCodeSchema } from "@vang-radar/domain";
import { PublicCacheControlInterceptor } from "../../common/cache-control.interceptor.js";
import { PricesService } from "./prices.service.js";

@ApiTags("gold-prices")
@Controller("gold-prices")
@UseInterceptors(PublicCacheControlInterceptor)
export class GoldPricesController {
  constructor(@Inject(PricesService) private readonly pricesService: PricesService) {}

  @Get("history")
  getHistory(@Query("type") type: string, @Query("days") days = "7") {
    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 30) {
      throw new BadRequestException("days must be an integer between 1 and 30");
    }
    return this.pricesService.getDailyHistory(productCodeSchema.parse(type), parsedDays);
  }
}
