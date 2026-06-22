import type { SignalInput, SignalOutput } from "../types/index.js";
import { explainDecisionSignal } from "./explain.js";

export function generateDecisionSignal(input: SignalInput): SignalOutput {
  return explainDecisionSignal(input).output;
}