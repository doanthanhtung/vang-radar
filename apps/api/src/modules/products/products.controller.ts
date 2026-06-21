import { Controller, Get, Inject, UseInterceptors } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PublicCacheControlInterceptor } from "../../common/cache-control.interceptor.js";
import { ProductsService } from "./products.service.js";

@ApiTags("products")
@Controller("products")
@UseInterceptors(PublicCacheControlInterceptor)
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly productsService: ProductsService) {}

  @Get()
  getProducts() {
    return this.productsService.getProducts();
  }
}
