import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { noStoreCacheControl, publicCacheControl } from "@vang-radar/config";
import type { Observable } from "rxjs";

type CacheableResponse = {
  header(name: string, value: string): void;
};

@Injectable()
export class PublicCacheControlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<CacheableResponse>();
    response.header("Cache-Control", publicCacheControl);
    return next.handle();
  }
}

@Injectable()
export class NoStoreCacheControlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<CacheableResponse>();
    response.header("Cache-Control", noStoreCacheControl);
    response.header("Pragma", "no-cache");
    response.header("Expires", "0");
    return next.handle();
  }
}
