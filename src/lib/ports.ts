import { DEFAULT_PORT_BASE, DEFAULT_PORT_BLOCK_SIZE } from "./constants.js";
import type { ExtractedPort } from "./types.js";

/**
 * Extract all port definitions from a Supabase config.toml content string.
 * Finds all lines matching `key = <number>` where key contains "port".
 *
 * Returns ports sorted by value, with offsets calculated from the minimum.
 */
export function extractPorts(tomlContent: string): ExtractedPort[] {
  const ports: ExtractedPort[] = [];
  let currentSection = "";

  for (const line of tomlContent.split("\n")) {
    const trimmed = line.trim();

    // Track section headers like [api] or [db.pooler]
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    // Match port assignments: port = 54321, smtp_port = 54325, etc.
    const portMatch = trimmed.match(/^(\w*port\w*)\s*=\s*(\d+)/i);
    if (portMatch) {
      ports.push({
        key: portMatch[1],
        section: currentSection,
        value: parseInt(portMatch[2], 10),
        offset: 0, // calculated below
      });
    }
  }

  if (ports.length === 0) {
    return [];
  }

  // Calculate offsets from the minimum port value
  const minPort = Math.min(...ports.map((p) => p.value));
  for (const port of ports) {
    port.offset = port.value - minPort;
  }

  return ports.sort((a, b) => a.value - b.value);
}

/**
 * Allocate a new port base that doesn't collide with any existing allocations.
 *
 * Strategy: start from defaultPortBase, increment by blockSize until we find
 * a range that doesn't overlap with any allocated range.
 */
export function allocatePortBase(
  allocatedBases: number[],
  defaultPortBase: number = DEFAULT_PORT_BASE,
  blockSize: number = DEFAULT_PORT_BLOCK_SIZE
): number {
  let candidate = defaultPortBase;
  const maxPort = 65535 - blockSize;

  while (candidate <= maxPort) {
    const conflicts = allocatedBases.some(
      (existing) =>
        candidate < existing + blockSize && existing < candidate + blockSize
    );

    if (!conflicts) {
      return candidate;
    }

    candidate += blockSize;
  }

  throw new Error(
    `Unable to allocate a port range. All ranges between ${defaultPortBase} and ${maxPort} are occupied.`
  );
}

/**
 * Build a mapping of original port → new port given a base and extracted ports.
 */
export function buildPortMap(
  extractedPorts: ExtractedPort[],
  newBase: number
): Record<string, string> {
  const map: Record<string, string> = {};

  for (const port of extractedPorts) {
    const newPort = newBase + port.offset;
    map[String(port.value)] = String(newPort);
  }

  return map;
}

/**
 * Validate that a port range is within valid bounds and not using
 * well-known ports.
 */
export function validatePortRange(
  base: number,
  blockSize: number = DEFAULT_PORT_BLOCK_SIZE
): { valid: boolean; reason?: string } {
  if (base < 1024) {
    return { valid: false, reason: "Port base must be >= 1024 (above well-known ports)" };
  }
  if (base + blockSize > 65535) {
    return { valid: false, reason: `Port range ${base}-${base + blockSize} exceeds maximum port 65535` };
  }
  return { valid: true };
}
