/**
 * A user-facing error with a helpful message and optional hint.
 * Commands throw this to signal expected failures (missing files,
 * bad config, etc.) that should be displayed cleanly instead of
 * producing a raw stack trace.
 */
export declare class CommandError extends Error {
    readonly hint?: string;
    constructor(message: string, hint?: string);
}
//# sourceMappingURL=errors.d.ts.map