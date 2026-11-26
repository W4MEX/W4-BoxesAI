// Errors continue to be logged locally by error-reporting.ts.
export const sentry = {
  initialize: (_options: unknown): void => { /* Disabled in W4. */ },
  capture: (_error: unknown, _context?: unknown): void => { /* Disabled in W4. */ },
  isInitialized: () => false,
};
