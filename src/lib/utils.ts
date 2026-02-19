import type { ExtractedPort } from "./types.js";

/**
 * Format a port mapping as a human-readable table.
 */
export function formatPortTable(
  portMap: Record<string, string>,
  extractedPorts: ExtractedPort[]
): string {
  const lines: string[] = [];

  for (const port of extractedPorts) {
    const oldPort = String(port.value);
    const newPort = portMap[oldPort] ?? oldPort;
    const label = port.section ? `${port.section}.${port.key}` : port.key;
    lines.push(`${label}: ${oldPort} → ${newPort}`);
  }

  return lines.join("\n");
}
