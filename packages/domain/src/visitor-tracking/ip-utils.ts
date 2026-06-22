export type Ipv4Octets = [number, number, number, number];

export function parseIpv4Octets(value: string): Ipv4Octets | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value.trim());
  if (!match) return null;

  const octets = match.slice(1).map((part) => Number(part)) as Ipv4Octets;
  if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return null;

  return octets;
}