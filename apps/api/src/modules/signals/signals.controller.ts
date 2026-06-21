import { Controller, Get, Inject, Query, UseInterceptors } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { productCodeSchema } from "@vang-radar/domain";
import { PublicCacheControlInterceptor } from "../../common/cache-control.interceptor.js";
import { SignalsService } from "./signals.service.js";

@ApiTags("signals")
@Controller("signals")
@UseInterceptors(PublicCacheControlInterceptor)
export class SignalsController {
  constructor(@Inject(SignalsService) private readonly signalsService: SignalsService) {}

  @Get("latest")
  getLatest(@Query("productCode") productCode: string) {
    return this.signalsService.getLatest(productCodeSchema.parse(productCode));
  }
}
