import type { ExtractedPort } from "./types.js";
/**
 * Extract all port definitions from a Supabase config.toml content string.
 * Finds all lines matching `key = <number>` where key contains "port".
 *
 * Returns ports sorted by value, with offsets calculated from the minimum.
 */
export declare function extractPorts(tomlContent: string): ExtractedPort[];
/**
 * Get the base port (minimum port value) from extracted ports.
 */
export declare function getPortBase(extractedPorts: ExtractedPort[]): number;
/**
 * Allocate a new port base that doesn't collide with any existing allocations.
 *
 * Strategy: start from portBase, increment by blockSize until we find
 * a range that doesn't overlap with any allocated range.
 */
export declare function allocatePortBase(allocatedBases: number[], portBase: number, blockSize?: number): number;
/**
 * Build a mapping of original port → new port given a base and extracted ports.
 */
export declare function buildPortMap(extractedPorts: ExtractedPort[], newBase: number): Record<string, string>;
/**
 * Validate that a port range is within valid bounds and not using
 * well-known ports.
 */
export declare function validatePortRange(base: number, blockSize?: number): {
    valid: boolean;
    reason?: string;
};
//# sourceMappingURL=ports.d.ts.map