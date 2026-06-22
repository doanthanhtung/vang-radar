import { parseIpv4Octets } from "./ip-utils.js";

type DatacenterRule = {
  provider: string;
  match: (octets: [number, number, number, number]) => boolean;
};

// Heuristic ranges for common cloud hosts — not exhaustive, but catches most scanners.
const DATACENTER_RULES: DatacenterRule[] = [
  { provider: "aws", match: ([a, b]) => a === 3 || a === 13 || a === 18 || a === 54 || (a === 52 && b <= 95) },
  { provider: "google-cloud", match: ([a]) => a === 34 || a === 35 },
  { provider: "azure", match: ([a]) => a === 20 || a === 40 || a === 104 },
  { provider: "tencent", match: ([a]) => a === 43 || a === 49 || a === 124 || a === 162 },
  { provider: "hetzner", match: ([a]) => a === 5 || a === 78 || a === 88 || a === 95 || a === 148 },
  { provider: "ovh", match: ([a]) => a === 51 || a === 54 || a === 141 },
  { provider: "digitalocean", match: ([a]) => a === 45 || a === 67 || a === 134 || a === 164 },
  { provider: "oracle", match: ([a]) => a === 129 || a === 130 || a === 140 },
  { provider: "alibaba", match: ([a]) => a === 47 || a === 39 || a === 8 }
];

export function isLikelyDatacenterIp(ipAddress: string): boolean {
  const octets = parseIpv4Octets(ipAddress);
  if (!octets) return false;
  return DATACENTER_RULES.some((rule) => rule.match(octets));
}

export function datacenterProvider(ipAddress: string): string | null {
  const octets = parseIpv4Octets(ipAddress);
  if (!octets) return null;
  return DATACENTER_RULES.find((rule) => rule.match(octets))?.provider ?? null;
}