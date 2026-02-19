import { DEFAULT_PORT_BLOCK_SIZE } from "./constants.js";
/**
 * Extract all port definitions from a Supabase config.toml content string.
 * Finds all lines matching `key = <number>` where key contains "port".
 *
 * Returns ports sorted by value, with offsets calculated from the minimum.
 */
export function extractPorts(tomlContent) {
    const ports = [];
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
 * Get the base port (minimum port value) from extracted ports.
 */
export function getPortBase(extractedPorts) {
    if (extractedPorts.length === 0) {
        throw new Error("Cannot determine port base from empty port list");
    }
    return Math.min(...extractedPorts.map((p) => p.value));
}
/**
 * Allocate a new port base that doesn't collide with any existing allocations.
 *
 * Strategy: start from portBase, increment by blockSize until we find
 * a range that doesn't overlap with any allocated range.
 */
export function allocatePortBase(allocatedBases, portBase, blockSize = DEFAULT_PORT_BLOCK_SIZE) {
    let candidate = portBase;
    const maxPort = 65535 - blockSize;
    while (candidate <= maxPort) {
        const conflicts = allocatedBases.some((existing) => candidate < existing + blockSize && existing < candidate + blockSize);
        if (!conflicts) {
            return candidate;
        }
        candidate += blockSize;
    }
    throw new Error(`Unable to allocate a port range. All ranges between ${portBase} and ${maxPort} are occupied.`);
}
/**
 * Build a mapping of original port → new port given a base and extracted ports.
 */
export function buildPortMap(extractedPorts, newBase) {
    const map = {};
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
export function validatePortRange(base, blockSize = DEFAULT_PORT_BLOCK_SIZE) {
    if (base < 1024) {
        return { valid: false, reason: "Port base must be >= 1024 (above well-known ports)" };
    }
    if (base + blockSize > 65535) {
        return { valid: false, reason: `Port range ${base}-${base + blockSize} exceeds maximum port 65535` };
    }
    return { valid: true };
}
//# sourceMappingURL=ports.js.map