import { PrismaClient } from "@prisma/client";
import { GOLD_PRODUCTS } from "@vang-radar/domain";

const prisma = new PrismaClient();

const sources = [
  { code: "VNAPPMOB", name: "VNAppMob", type: "fx", baseUrl: "https://vapi.vnappmob.com" },
  { code: "VIETNAM_GOLD_API", name: "Vietnam domestic gold API", type: "domestic_gold" },
  {
    code: "TWENTY_FOUR_H_GOLD",
    name: "24h domestic gold",
    type: "domestic_gold",
    baseUrl: "https://www.24h.com.vn"
  },
  {
    code: "TWENTY_FOUR_MONEY_GOLD",
    name: "24HMoney domestic gold",
    type: "domestic_gold",
    baseUrl: "https://24hmoney.vn"
  },
  {
    code: "BAOMOI_BTMC_GOLD",
    name: "Bao Moi BTMC gold",
    type: "domestic_gold",
    baseUrl: "https://baomoi.com/tien-ich-gia-vang-btmc.epi"
  },
  {
    code: "TWENTY_FOUR_H_FX",
    name: "24h USD/VND",
    type: "fx",
    baseUrl: "https://www.24h.com.vn"
  },
  {
    code: "TWENTY_FOUR_H_WORLD_GOLD",
    name: "24h world gold",
    type: "world_gold",
    baseUrl: "https://www.24h.com.vn"
  },
  {
    code: "KITCO_WORLD_GOLD",
    name: "Kitco world gold",
    type: "world_gold",
    baseUrl: "https://www.kitco.com"
  },
  { code: "GOLDAPI_IO", name: "GoldAPI.io", type: "world_gold", baseUrl: "https://www.goldapi.io" },
  { code: "METALS_DEV", name: "Metals.dev", type: "world_gold", baseUrl: "https://api.metals.dev" },
  {
    code: "FRED",
    name: "Federal Reserve Economic Data",
    type: "macro",
    baseUrl: "https://fred.stlouisfed.org"
  },
  {
    code: "YAHOO_FINANCE",
    name: "Yahoo Finance",
    type: "market_data",
    baseUrl: "https://finance.yahoo.com"
  }
];

async function main() {
  for (const source of sources) {
    await prisma.source.upsert({
      where: { code: source.code },
      update: source,
      create: source
    });
  }

  for (const product of GOLD_PRODUCTS) {
    await prisma.goldProduct.upsert({
      where: { code: product.code },
      update: {
        name: product.name,
        brand: product.brand,
        category: product.category,
        purity: product.purity,
        unit: product.unit
      },
      create: {
        code: product.code,
        name: product.name,
        brand: product.brand,
        category: product.category,
        purity: product.purity,
        unit: product.unit
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
