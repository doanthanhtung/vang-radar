import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { VietnamGoldApiProvider } from "../providers/domestic-gold/real-placeholders.js";
import { FxProvider } from "../providers/fx/real-placeholders.js";
import { FredMacroProvider } from "../providers/macro/fred.js";
import { YahooDxyProvider } from "../providers/macro/yahoo-dxy.js";
import {
  GoldApiIoProvider,
  KitcoWorldGoldProvider,
  MetalsDevProvider,
  TwentyFourHWorldGoldProvider
} from "../providers/world-gold/real-placeholders.js";
import {
  validateDomesticGoldQuote,
  validateFxQuote,
  validateWorldGoldQuote
} from "../validators/data-quality.js";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function sourceId(prisma: PrismaClient, code: string): Promise<string> {
  const source = await prisma.source.upsert({
    where: { code },
    update: {},
    create: { code, name: code, type: "external" }
  });
  return source.id;
}

export async function fetchDomesticGold(prisma: PrismaClient) {
  const provider = new VietnamGoldApiProvider();
  const result = await provider.fetch();
  if (result.data.length === 0) return [];

  const stored = [];

  for (const quote of result.data) {
    const sid = await sourceId(prisma, quote.sourceCode ?? result.sourceCode);
    const product = await prisma.goldProduct.findUnique({ where: { code: quote.productCode } });
    if (!product) continue;
    const previous = await prisma.domesticGoldPrice.findFirst({
      where: {
        productId: product.id,
        isValid: true,
        source: { code: { not: { startsWith: "MOCK_" } } }
      },
      orderBy: { time: "desc" }
    });
    const validation = validateDomesticGoldQuote(
      quote,
      previous ? Number(previous.sellPriceVnd) : null
    );
    stored.push(
      await prisma.domesticGoldPrice.upsert({
        where: {
          productId_sourceId_time: {
            productId: product.id,
            sourceId: sid,
            time: quote.quotedAt ?? result.fetchedAt
          }
        },
        update: {},
        create: {
          time: quote.quotedAt ?? result.fetchedAt,
          productId: product.id,
          sourceId: sid,
          buyPriceVnd: quote.buyPriceVnd,
          sellPriceVnd: quote.sellPriceVnd,
          unit: quote.unit,
          rawPayload: toJson(quote),
          qualityScore: validation.qualityScore,
          isValid: validation.isValid,
          invalidReason: validation.invalidReason
        }
      })
    );
  }

  return stored;
}

export async function fetchWorldGold(prisma: PrismaClient) {
  const providers = [
    new GoldApiIoProvider(),
    new MetalsDevProvider(),
    new KitcoWorldGoldProvider(),
    new TwentyFourHWorldGoldProvider()
  ];
  const results = [];
  for (const provider of providers) {
    const result = await provider.fetch();
    results.push(result);
    if (result.data) break;
  }

  const result = results.find((item) => item.data);
  if (!result?.data) return null;

  const previous = await prisma.worldGoldPrice.findFirst({
    where: {
      isValid: true,
      symbol: "XAUUSD",
      source: { code: { not: { startsWith: "MOCK_" } } }
    },
    orderBy: { time: "desc" }
  });
  const validation = validateWorldGoldQuote(
    result.data,
    previous ? Number(previous.priceUsdPerOz) : null
  );
  const sid = await sourceId(prisma, result.sourceCode);
  return prisma.worldGoldPrice.upsert({
    where: {
      sourceId_symbol_time: {
        sourceId: sid,
        symbol: "XAUUSD",
        time: result.data.quotedAt ?? result.fetchedAt
      }
    },
    update: {},
    create: {
      time: result.data.quotedAt ?? result.fetchedAt,
      sourceId: sid,
      symbol: result.data.symbol,
      priceUsdPerOz: result.data.priceUsdPerOz,
      bid: result.data.bid ?? null,
      ask: result.data.ask ?? null,
      rawPayload: toJson(result.rawPayload),
      qualityScore: validation.qualityScore,
      isValid: validation.isValid,
      invalidReason: validation.invalidReason
    }
  });
}

export async function fetchFx(prisma: PrismaClient) {
  const provider = new FxProvider();
  const result = await provider.fetch();
  if (!result.data) return null;

  const previous = await prisma.fxRate.findFirst({
    where: {
      isValid: true,
      pair: "USDVND",
      rate: { gte: 20_000, lte: 40_000 },
      source: { code: { not: { startsWith: "MOCK_" } } }
    },
    orderBy: { time: "desc" }
  });
  const validation = validateFxQuote(result.data, previous ? Number(previous.rate) : null);
  const sid = await sourceId(prisma, result.sourceCode);
  return prisma.fxRate.upsert({
    where: {
      sourceId_pair_time: {
        sourceId: sid,
        pair: "USDVND",
        time: result.data.quotedAt ?? result.fetchedAt
      }
    },
    update: {},
    create: {
      time: result.data.quotedAt ?? result.fetchedAt,
      sourceId: sid,
      pair: result.data.pair,
      rate: result.data.rate,
      rawPayload: toJson(result.rawPayload),
      qualityScore: validation.qualityScore,
      isValid: validation.isValid,
      invalidReason: validation.invalidReason
    }
  });
}

export async function fetchMacroIndicators(prisma: PrismaClient) {
  const providers = [new YahooDxyProvider(), new FredMacroProvider()];
  const stored = [];

  for (const provider of providers) {
    const result = await provider.fetch();
    if (result.data.length === 0) continue;

    const sid = await sourceId(prisma, result.sourceCode);
    for (const quote of result.data) {
      stored.push(
        await prisma.macroIndicator.upsert({
          where: {
            sourceId_code_time: {
              sourceId: sid,
              code: quote.code,
              time: quote.quotedAt ?? result.fetchedAt
            }
          },
          update: {},
          create: {
            time: quote.quotedAt ?? result.fetchedAt,
            sourceId: sid,
            code: quote.code,
            value: quote.value,
            unit: quote.unit,
            rawPayload: toJson({
              sourceSeriesId: quote.sourceSeriesId,
              providerHealth: result.health
            }),
            qualityScore: result.health === "healthy" ? 100 : 80,
            isValid: true
          }
        })
      );
    }
  }

  return stored;
}
