import { describe, it, expect } from "vitest";
import { formatPortTable } from "../../src/lib/utils.js";
import { extractPorts, buildPortMap } from "../../src/lib/ports.js";
import { SAMPLE_CONFIG_TOML } from "../helpers.js";

describe("formatPortTable", () => {
  it("formats a port mapping as label: old → new", () => {
    const ports = extractPorts(SAMPLE_CONFIG_TOML);
    const map = buildPortMap(ports, 60000);
    const table = formatPortTable(map, ports);

    expect(table).toContain("api.port: 54321");
    expect(table).toContain("60000");
    expect(table).toContain("db.port: 54322");
    expect(table).toContain("60001");
  });

  it("includes section.key labels for sectioned ports", () => {
    const ports = extractPorts(SAMPLE_CONFIG_TOML);
    const map = buildPortMap(ports, 60000);
    const table = formatPortTable(map, ports);

    expect(table).toContain("db.pooler.port");
    expect(table).toContain("inbucket.smtp_port");
    expect(table).toContain("inbucket.pop3_port");
  });

  it("returns one line per port", () => {
    const ports = extractPorts(SAMPLE_CONFIG_TOML);
    const map = buildPortMap(ports, 60000);
    const lines = formatPortTable(map, ports).split("\n");

    expect(lines.length).toBe(ports.length);
  });

  it("shows identity when no port change", () => {
    const ports = extractPorts(SAMPLE_CONFIG_TOML);
    const map = buildPortMap(ports, 54321);
    const table = formatPortTable(map, ports);

    // api.port: 54321 → 54321
    expect(table).toContain("54321 → 54321");
  });
});
