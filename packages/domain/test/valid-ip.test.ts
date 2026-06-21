import { describe, expect, it } from "vitest";
import { isValidVisitorIp } from "../src/valid-ip.js";

describe("isValidVisitorIp", () => {
  it("accepts public IPv4 addresses", () => {
    expect(isValidVisitorIp("42.114.15.225")).toBe(true);
    expect(isValidVisitorIp("8.8.8.8")).toBe(true);
  });

  it("rejects loopback, private, and link-local IPv4 addresses", () => {
    expect(isValidVisitorIp("127.0.0.1")).toBe(false);
    expect(isValidVisitorIp("10.0.0.5")).toBe(false);
    expect(isValidVisitorIp("192.168.1.10")).toBe(false);
    expect(isValidVisitorIp("172.16.0.2")).toBe(false);
    expect(isValidVisitorIp("169.254.12.34")).toBe(false);
    expect(isValidVisitorIp("0.0.0.0")).toBe(false);
  });

  it("rejects malformed and placeholder values", () => {
    expect(isValidVisitorIp("")).toBe(false);
    expect(isValidVisitorIp("unknown")).toBe(false);
    expect(isValidVisitorIp("999.999.999.999")).toBe(false);
    expect(isValidVisitorIp("not-an-ip")).toBe(false);
  });

  it("rejects IPv4-mapped loopback addresses", () => {
    expect(isValidVisitorIp("::ffff:127.0.0.1")).toBe(false);
  });

  it("rejects local IPv6 addresses", () => {
    expect(isValidVisitorIp("::1")).toBe(false);
    expect(isValidVisitorIp("fe80::1")).toBe(false);
    expect(isValidVisitorIp("fd12:3456:789a:1::1")).toBe(false);
  });
});