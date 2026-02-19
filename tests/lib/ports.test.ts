import { describe, it, expect } from "vitest";
import { extractPorts, allocatePortBase, buildPortMap, validatePortRange } from "../../src/lib/ports.js";
import { SAMPLE_CONFIG_TOML } from "../helpers.js";

// ---------------------------------------------------------------------------
// extractPorts
// ---------------------------------------------------------------------------
describe("extractPorts", () => {
  it("extracts all port definitions from a realistic config.toml", () => {
    const ports = extractPorts(SAMPLE_CONFIG_TOML);

    // Should find: api.port, db.port, studio.port, inbucket.port,
    // inbucket.smtp_port, inbucket.pop3_port, analytics.port, db.pooler.port
    expect(ports.length).toBe(8);

    const keys = ports.map((p) => `${p.section}.${p.key}`);
    expect(keys).toContain("api.port");
    expect(keys).toContain("db.port");
    expect(keys).toContain("db.pooler.port");
    expect(keys).toContain("studio.port");
    expect(keys).toContain("inbucket.port");
    expect(keys).toContain("inbucket.smtp_port");
    expect(keys).toContain("inbucket.pop3_port");
    expect(keys).toContain("analytics.port");
  });

  it("returns ports sorted by value", () => {
    const ports = extractPorts(SAMPLE_CONFIG_TOML);
    for (let i = 1; i < ports.length; i++) {
      expect(ports[i].value).toBeGreaterThanOrEqual(ports[i - 1].value);
    }
  });

  it("calculates offsets from the minimum port", () => {
    const ports = extractPorts(SAMPLE_CONFIG_TOML);
    const minPort = Math.min(...ports.map((p) => p.value));

    expect(minPort).toBe(54321); // api.port is the lowest
    for (const port of ports) {
      expect(port.offset).toBe(port.value - minPort);
    }
  });

  it("handles different key naming patterns", () => {
    const toml = `
[section_a]
port = 1000
smtp_port = 1001
pop3_port = 1002
inbound_port = 1003
`;
    const ports = extractPorts(toml);
    expect(ports.length).toBe(4);
    expect(ports.map((p) => p.key)).toEqual(
      expect.arrayContaining(["port", "smtp_port", "pop3_port", "inbound_port"])
    );
  });

  it("tracks section headers including nested sections", () => {
    const toml = `
[api]
port = 5000

[db.pooler]
port = 5001
`;
    const ports = extractPorts(toml);
    expect(ports.find((p) => p.value === 5000)?.section).toBe("api");
    expect(ports.find((p) => p.value === 5001)?.section).toBe("db.pooler");
  });

  it("returns an empty array for content with no ports", () => {
    const toml = `
[api]
enabled = true
schemas = ["public"]
`;
    expect(extractPorts(toml)).toEqual([]);
  });

  it("returns an empty array for empty string", () => {
    expect(extractPorts("")).toEqual([]);
  });

  it("ignores commented-out port lines", () => {
    const toml = `
[api]
port = 5000
# port = 9999
`;
    const ports = extractPorts(toml);
    expect(ports.length).toBe(1);
    expect(ports[0].value).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// allocatePortBase
// ---------------------------------------------------------------------------
describe("allocatePortBase", () => {
  it("returns the default base when no existing allocations", () => {
    expect(allocatePortBase([], 54321, 100)).toBe(54321);
  });

  it("skips past a conflicting range", () => {
    // 54321 is taken, so it should return 54421
    expect(allocatePortBase([54321], 54321, 100)).toBe(54421);
  });

  it("skips past multiple conflicting ranges", () => {
    const allocated = [54321, 54421, 54521];
    expect(allocatePortBase(allocated, 54321, 100)).toBe(54621);
  });

  it("finds gaps between allocated ranges", () => {
    // Ranges: 54321-54420 and 54521-54620
    // Gap at 54421-54520 should be found
    const allocated = [54321, 54521];
    expect(allocatePortBase(allocated, 54321, 100)).toBe(54421);
  });

  it("detects overlap when candidate partially overlaps an existing range", () => {
    // Existing range: 54350-54449 (base=54350, blockSize=100)
    // Candidate 54321: 54321-54420. Overlaps? 54321 < 54450 && 54350 < 54421 → YES
    // Candidate 54421: 54421-54520. Overlaps? 54421 < 54450 && 54350 < 54521 → YES
    // Candidate 54521: 54521-54620. Overlaps? 54521 < 54450 → NO → allocated
    const allocated = [54350];
    const result = allocatePortBase(allocated, 54321, 100);
    expect(result).toBe(54521);
  });

  it("throws when all port ranges are exhausted", () => {
    // Fill the entire range with allocations
    const blockSize = 100;
    const bases: number[] = [];
    for (let port = 54321; port <= 65535 - blockSize; port += blockSize) {
      bases.push(port);
    }
    expect(() => allocatePortBase(bases, 54321, blockSize)).toThrow(
      /Unable to allocate/
    );
  });

  it("uses default values when not specified", () => {
    expect(allocatePortBase([])).toBe(54321);
  });
});

// ---------------------------------------------------------------------------
// buildPortMap
// ---------------------------------------------------------------------------
describe("buildPortMap", () => {
  it("maps original ports to new ports using offsets", () => {
    const ports = extractPorts(SAMPLE_CONFIG_TOML);
    const newBase = 60000;
    const map = buildPortMap(ports, newBase);

    // api.port has offset 0 → 60000
    expect(map["54321"]).toBe("60000");
    // db.port has offset 1 → 60001
    expect(map["54322"]).toBe("60001");
    // studio.port has offset 2 → 60002
    expect(map["54323"]).toBe("60002");
  });

  it("preserves all ports in the map", () => {
    const ports = extractPorts(SAMPLE_CONFIG_TOML);
    const map = buildPortMap(ports, 54321);
    expect(Object.keys(map).length).toBe(ports.length);
  });

  it("returns string-to-string mappings", () => {
    const ports = extractPorts(SAMPLE_CONFIG_TOML);
    const map = buildPortMap(ports, 60000);
    for (const [key, value] of Object.entries(map)) {
      expect(typeof key).toBe("string");
      expect(typeof value).toBe("string");
    }
  });

  it("creates identity mapping when newBase equals original min port", () => {
    const ports = extractPorts(SAMPLE_CONFIG_TOML);
    const map = buildPortMap(ports, 54321); // same as original base
    for (const port of ports) {
      expect(map[String(port.value)]).toBe(String(54321 + port.offset));
    }
  });
});

// ---------------------------------------------------------------------------
// validatePortRange
// ---------------------------------------------------------------------------
describe("validatePortRange", () => {
  it("accepts valid port ranges", () => {
    expect(validatePortRange(54321, 100)).toEqual({ valid: true });
    expect(validatePortRange(1024, 100)).toEqual({ valid: true });
    expect(validatePortRange(60000, 100)).toEqual({ valid: true });
  });

  it("rejects ports below 1024", () => {
    const result = validatePortRange(80, 100);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/well-known/);
  });

  it("rejects port 0", () => {
    expect(validatePortRange(0, 100).valid).toBe(false);
  });

  it("rejects ranges that exceed 65535", () => {
    const result = validatePortRange(65500, 100);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/exceeds/);
  });

  it("accepts range ending exactly at 65535", () => {
    expect(validatePortRange(65435, 100).valid).toBe(true);
  });

  it("uses default blockSize when not specified", () => {
    expect(validatePortRange(54321).valid).toBe(true);
  });
});
