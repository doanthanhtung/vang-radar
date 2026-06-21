import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service.js";

@Injectable()
export class ProductsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getProducts() {
    return this.prisma.goldProduct.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" }
    });
  }
}
