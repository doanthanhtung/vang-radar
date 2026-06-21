import { Controller, Get, UseInterceptors } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PublicCacheControlInterceptor } from "../../common/cache-control.interceptor.js";

@ApiTags("health")
@Controller("health")
@UseInterceptors(PublicCacheControlInterceptor)
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "vangscore-api",
      time: new Date().toISOString()
    };
  }
}
