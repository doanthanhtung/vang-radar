import { z } from "zod";
import { PRODUCT_CODES } from "../constants/gold.js";

export const productCodeSchema = z.enum(PRODUCT_CODES);
export const historyRangeSchema = z.enum(["7d", "30d", "180d", "1y"]);
export type HistoryRange = z.infer<typeof historyRangeSchema>;

export const signalSchema = z.enum(["BUY_DCA", "HOLD", "AVOID", "TAKE_PROFIT", "DATA_UNRELIABLE"]);
