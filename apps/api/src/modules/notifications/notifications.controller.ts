import { Body, Controller, HttpCode, Inject, Post, UseInterceptors } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { NoStoreCacheControlInterceptor } from "../../common/cache-control.interceptor.js";
import {
  NotificationsService,
  type SubscribeRequest
} from "./notifications.service.js";

@ApiTags("notifications")
@Controller("notifications")
@UseInterceptors(NoStoreCacheControlInterceptor)
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notificationsService: NotificationsService
  ) {}

  @Post("subscribe")
  @HttpCode(201)
  subscribe(@Body() body: SubscribeRequest) {
    return this.notificationsService.subscribe(body);
  }
}
