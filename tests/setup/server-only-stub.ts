// server-only's real implementation throws when Vite/Vitest resolves its
// "browser" export condition, which happens under Vitest even with a Node
// test environment. We intentionally run server-only code under Vitest in a
// controlled Node context, so this stub replaces it with a no-op for tests.
export {};
