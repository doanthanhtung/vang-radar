import { createDecipheriv } from "node:crypto";
import type { DataProvider, DomesticGoldQuote, ProviderResult } from "@vang-radar/domain";

type JsonRecord = Record<string, unknown>;

const DOJI_PRICE_URL = "https://banggia.doji.vn/api/TablePrice/GetTablePrice";
const DOJI_AES_KEY = Buffer.from(
  "7a4b8c3d1e9f2a5b6c0d4e8f3a7b1c5d9e2f6a0b4c8d3e7f1a5b9c2d6e0f4a8b",
  "hex"
);
const VND_PER_LUONG_MULTIPLIER = 10_000;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findMaterialRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    const direct = value.filter(isRecord);
    if (direct.some((record) => "materialCode" in record)) return direct;
    return value.flatMap(findMaterialRecords);
  }
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(findMaterialRecords);
}

export function decryptDojiPayload(encryptedBase64: string): unknown {
  const encrypted = Buffer.from(encryptedBase64, "base64");
  if (encrypted.length <= 16) throw new Error("DOJI encrypted payload is too short");
  const decipher = createDecipheriv("aes-256-cbc", DOJI_AES_KEY, encrypted.subarray(0, 16));
  const plaintext = Buffer.concat([
    decipher.update(encrypted.subarray(16)),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(plaintext) as unknown;
}

export function parseDojiOfficialQuote(payload: unknown): DomesticGoldQuote | null {
  const target = findMaterialRecords(payload).find(
    (record) =>
      String(record.materialCode ?? "") === "03" &&
      record.isActive === true &&
      record.type === "G"
  );
  if (!target) return null;

  const buy = Number(target.priceDojiBuyIn);
  const sell = Number(target.priceDojiSellOut);
  const quotedAt = new Date(String(target.updateDate ?? ""));
  if (!Number.isFinite(buy) || buy <= 0 || !Number.isFinite(sell) || sell <= 0) return null;
  if (Number.isNaN(quotedAt.getTime())) return null;

  return {
    productCode: "DOJI_RING_9999",
    brand: "DOJI",
    name:
      typeof target.materialName === "string" && target.materialName.trim()
        ? target.materialName.trim()
        : "Nhẫn tròn 9999 Hưng Thịnh Vượng",
    buyPriceVnd: Math.round(buy * VND_PER_LUONG_MULTIPLIER),
    sellPriceVnd: Math.round(sell * VND_PER_LUONG_MULTIPLIER),
    unit: "luong",
    quotedAt,
    sourceCode: "DOJI_OFFICIAL"
  };
}

export class DojiOfficialGoldProvider implements DataProvider<DomesticGoldQuote | null> {
  readonly sourceCode = "DOJI_OFFICIAL";

  async fetch(): Promise<ProviderResult<DomesticGoldQuote | null>> {
    const fetchedAt = new Date();
    try {
      const response = await fetch(DOJI_PRICE_URL, {
        headers: { Accept: "application/json", "User-Agent": "vang-radar" }
      });
      const envelope = (await response.json().catch(() => null)) as unknown;
      const encryptedData = isRecord(envelope) ? envelope.data : null;
      const validEnvelope =
        response.ok &&
        isRecord(envelope) &&
        envelope.status === true &&
        typeof encryptedData === "string" &&
        encryptedData.length > 0;
      const decrypted = validEnvelope ? decryptDojiPayload(encryptedData) : null;
      const data = decrypted ? parseDojiOfficialQuote(decrypted) : null;
      return {
        sourceCode: this.sourceCode,
        fetchedAt,
        data,
        rawPayload: data ? { url: DOJI_PRICE_URL, quote: data } : envelope,
        health: data ? "healthy" : "degraded",
        ...(data ? {} : { error: "DOJI official response did not contain a valid material 03 quote" })
      };
    } catch (error) {
      return {
        sourceCode: this.sourceCode,
        fetchedAt,
        data: null,
        rawPayload: null,
        health: "degraded",
        error: error instanceof Error ? error.message : "DOJI official provider failed"
      };
    }
  }
}
