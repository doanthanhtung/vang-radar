import type { DataProvider, MacroIndicatorQuote, ProviderResult } from "@vang-radar/domain";

const FRED_GRAPH_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const FRED_TIMEOUT_MS = 15_000;

const series = [
  {
    code: "US10Y_YIELD",
    seriesId: "DGS10",
    unit: "percent"
  },
  {
    code: "FED_RATE",
    seriesId: "FEDFUNDS",
    unit: "percent"
  }
] as const;

type CsvObservation = {
  date: string;
  value: number;
};

function parseLatestObservation(csv: string): CsvObservation | null {
  const rows = csv.trim().split(/\r?\n/).slice(1);

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const [date, rawValue] = rows[index]?.split(",") ?? [];
    if (!date || !rawValue || rawValue === ".") continue;

    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;

    return { date, value };
  }

  return null;
}

async function fetchSeries(
  seriesId: string
): Promise<{ csv: string; observation: CsvObservation | null }> {
  const url = new URL(FRED_GRAPH_CSV_URL);
  url.searchParams.set("id", seriesId);

  const response = await fetch(url, {
    headers: { Accept: "text/csv", "User-Agent": "vang-radar" },
    signal: AbortSignal.timeout(FRED_TIMEOUT_MS)
  });
  const csv = await response.text();

  return {
    csv,
    observation: response.ok ? parseLatestObservation(csv) : null
  };
}

export class FredMacroProvider implements DataProvider<MacroIndicatorQuote[]> {
  readonly sourceCode = "FRED";

  async fetch(): Promise<ProviderResult<MacroIndicatorQuote[]>> {
    const fetchedAt = new Date();
    const quotes: MacroIndicatorQuote[] = [];
    const rawPayload: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const item of series) {
      try {
        const result = await fetchSeries(item.seriesId);
        rawPayload[item.seriesId] = result.observation ?? result.csv.slice(0, 300);

        if (!result.observation) {
          errors.push(`No latest observation parsed for ${item.seriesId}`);
          continue;
        }

        quotes.push({
          code: item.code,
          value: result.observation.value,
          unit: item.unit,
          quotedAt: new Date(`${result.observation.date}T00:00:00.000Z`),
          sourceSeriesId: item.seriesId
        });
      } catch (error) {
        errors.push(`${item.seriesId}: ${String(error)}`);
      }
    }

    return {
      sourceCode: this.sourceCode,
      fetchedAt,
      data: quotes,
      rawPayload,
      health: quotes.length === series.length ? "healthy" : quotes.length > 0 ? "degraded" : "down",
      ...(errors.length > 0 ? { error: errors.join("; ") } : {})
    };
  }
}
