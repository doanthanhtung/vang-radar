const UNKNOWN_IP_PATTERN = /^unknown$/i;

export function isValidVisitorIp(value: string | null | undefined): value is string {
  const ip = value?.trim();
  if (!ip || UNKNOWN_IP_PATTERN.test(ip)) return false;

  const ipv4 = parseIpv4(ip);
  if (ipv4) return isPublicIpv4(ipv4);

  const ipv4Mapped = parseIpv4MappedAddress(ip);
  if (ipv4Mapped) return isPublicIpv4(ipv4Mapped);

  return isPublicIpv6(ip);
}

type Ipv4Octets = [number, number, number, number];

function parseIpv4(value: string): Ipv4Octets | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!match) return null;

  const octets = match.slice(1).map((part) => Number(part)) as Ipv4Octets;
  if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return null;

  return octets;
}

function parseIpv4MappedAddress(value: string): Ipv4Octets | null {
  const lower = value.toLowerCase();
  if (!lower.startsWith("::ffff:")) return null;

  const suffix = lower.slice("::ffff:".length);
  if (suffix.includes(".")) return parseIpv4(suffix);

  const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(suffix);
  const highPart = hexMatch?.[1];
  const lowPart = hexMatch?.[2];
  if (!highPart || !lowPart) return null;

  const high = Number.parseInt(highPart, 16);
  const low = Number.parseInt(lowPart, 16);
  if (Number.isNaN(high) || Number.isNaN(low)) return null;

  return [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255];
}

function isPublicIpv4([a, b]: Ipv4Octets): boolean {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;

  return true;
}

function isPublicIpv6(value: string): boolean {
  const lower = value.toLowerCase();
  if (!/^[0-9a-f:]+$/i.test(lower) || !lower.includes(":")) return false;
  if (lower === "::" || lower === "::1") return false;
  if (lower.startsWith("fe80:")) return false;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false;

  return true;
}