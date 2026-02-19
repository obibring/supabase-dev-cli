/**
 * Format a port mapping as a human-readable table.
 */
export function formatPortTable(portMap, extractedPorts) {
    const lines = [];
    for (const port of extractedPorts) {
        const oldPort = String(port.value);
        const newPort = portMap[oldPort] ?? oldPort;
        const label = port.section ? `${port.section}.${port.key}` : port.key;
        lines.push(`${label}: ${oldPort} → ${newPort}`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=utils.js.map