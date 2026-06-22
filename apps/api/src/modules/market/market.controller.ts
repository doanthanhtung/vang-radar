import { BadRequestException, Controller, Get, Inject, MessageEvent, Query, Sse, UseInterceptors } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Observable } from "rxjs";
import { NoStoreCacheControlInterceptor } from "../../common/cache-control.interceptor.js";
import { MarketService } from "./market.service.js";

const SUMMARY_STREAM_CHECK_INTERVAL_MS = 30_000;

@ApiTags("market")
@Controller("market")
export class MarketController {
  constructor(@Inject(MarketService) private readonly marketService: MarketService) {}

  @Get("summary")
  @UseInterceptors(NoStoreCacheControlInterceptor)
  getSummary() {
    return this.marketService.getSummary();
  }

  @Get("world-gold")
  getWorldGoldHistory(@Query("days") days = "7") {
    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || ![7, 30].includes(parsedDays)) {
      throw new BadRequestException("days must be 7 or 30");
    }
    return this.marketService.getWorldGoldHistory(parsedDays);
  }

  @Get("usd-vnd")
  getUsdVndHistory(@Query("days") days = "7") {
    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || ![7, 30].includes(parsedDays)) {
      throw new BadRequestException("days must be 7 or 30");
    }
    return this.marketService.getUsdVndHistory(parsedDays);
  }

  @Sse("summary/stream")
  streamSummary(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let lastSummaryKey: string | null = null;

      const sendSummaryIfChanged = async () => {
        try {
          const summary = await this.marketService.getSummary();
          const summaryKey = JSON.stringify(summary);
          if (closed) return;

          if (summaryKey !== lastSummaryKey) {
            lastSummaryKey = summaryKey;
            subscriber.next({ type: "summary", data: summary });
            return;
          }

          subscriber.next({ type: "heartbeat", data: { time: new Date().toISOString() } });
        } catch {
          if (!closed)
            subscriber.next({
              type: "summary-error",
              data: { message: "Failed to load market summary" }
            });
        }
      };

      void sendSummaryIfChanged();
      const interval = setInterval(
        () => void sendSummaryIfChanged(),
        SUMMARY_STREAM_CHECK_INTERVAL_MS
      );

      return () => {
        closed = true;
        clearInterval(interval);
      };
    });
  }
}
