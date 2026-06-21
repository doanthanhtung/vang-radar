import { Inject, Injectable } from "@nestjs/common";
import type { ProductCode } from "@vang-radar/domain";
import { PrismaService } from "../../common/prisma.service.js";
import { RedisService } from "../../common/redis.service.js";

@Injectable()
export class SignalsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService
  ) {}

  async getLatest(productCode: ProductCode) {
    const cached = await this.redis.getJson(`product:${productCode}:signal:latest`);
    if (cached) return cached;

    return this.prisma.signalSnapshot.findFirst({
      where: { product: { code: productCode } },
      orderBy: { time: "desc" }
    });
  }
}
