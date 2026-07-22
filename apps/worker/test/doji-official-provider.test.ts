import { createCipheriv } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptDojiPayload,
  parseDojiOfficialQuote
} from "../src/providers/domestic-gold/doji-official.js";

const KEY = Buffer.from(
  "7a4b8c3d1e9f2a5b6c0d4e8f3a7b1c5d9e2f6a0b4c8d3e7f1a5b9c2d6e0f4a8b",
  "hex"
);

function encryptFixture(value: unknown): string {
  const iv = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const cipher = createCipheriv("aes-256-cbc", KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);
  return Buffer.concat([iv, ciphertext]).toString("base64");
}

describe("DOJI official gold provider", () => {
  it("decrypts the public AES-256-CBC response payload", () => {
    const fixture = { data: [{ materialCode: "03", priceDojiBuyIn: 14200 }] };

    expect(decryptDojiPayload(encryptFixture(fixture))).toEqual(fixture);
  });

  it("selects material 03, converts prices to VND per luong, and preserves updateDate", () => {
    const payload = {
      data: [
        {
          materialCode: "01",
          materialName: "VÀNG KHÁC",
          priceDojiBuyIn: 99999,
          priceDojiSellOut: 99999,
          updateDate: "2026-07-22T14:00:00.000Z",
          type: "G",
          isActive: true
        },
        {
          materialCode: "03",
          materialName: "NHẪN TRÒN 9999 HƯNG THỊNH VƯỢNG",
          priceDojiBuyIn: 14200,
          priceDojiSellOut: 14600,
          updateDate: "2026-07-22T14:05:58.3438409Z",
          type: "G",
          isActive: true
        }
      ]
    };

    expect(parseDojiOfficialQuote(payload)).toEqual({
      productCode: "DOJI_RING_9999",
      brand: "DOJI",
      name: "NHẪN TRÒN 9999 HƯNG THỊNH VƯỢNG",
      buyPriceVnd: 142_000_000,
      sellPriceVnd: 146_000_000,
      unit: "luong",
      quotedAt: new Date("2026-07-22T14:05:58.3438409Z"),
      sourceCode: "DOJI_OFFICIAL"
    });
  });

  it.each([
    null,
    { data: [] },
    { data: [{ materialCode: "03", isActive: false }] },
    {
      data: [{
        materialCode: "03",
        isActive: true,
        type: "G",
        priceDojiBuyIn: 14200,
        priceDojiSellOut: 14600,
        updateDate: "invalid"
      }]
    }
  ])("rejects malformed or missing target data", (payload) => {
    expect(parseDojiOfficialQuote(payload)).toBeNull();
  });
});
