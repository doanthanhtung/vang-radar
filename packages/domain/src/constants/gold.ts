export const GRAMS_PER_LUONG = 37.5;
export const GRAMS_PER_TROY_OUNCE = 31.1034768;

export const PRODUCT_CODES = [
  "SJC_BAR",
  "DOJI_RING_9999",
  "PNJ_RING_9999",
  "BTMC_RING_9999"
] as const;

export const GOLD_PRODUCTS = [
  {
    code: "SJC_BAR",
    name: "Vàng miếng SJC",
    brand: "SJC",
    category: "gold_bar",
    purity: "9999",
    unit: "luong"
  },
  {
    code: "DOJI_RING_9999",
    name: "Nhẫn 9999 DOJI",
    brand: "DOJI",
    category: "gold_ring",
    purity: "9999",
    unit: "luong"
  },
  {
    code: "PNJ_RING_9999",
    name: "Nhẫn 9999 PNJ",
    brand: "PNJ",
    category: "gold_ring",
    purity: "9999",
    unit: "luong"
  },
  {
    code: "BTMC_RING_9999",
    name: "Nhẫn 9999 Bảo Tín Minh Châu",
    brand: "BTMC",
    category: "gold_ring",
    purity: "9999",
    unit: "luong"
  }
] as const;

export const DISCLAIMER =
  "Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư cá nhân. Người dùng tự chịu trách nhiệm với quyết định tài chính của mình.";
