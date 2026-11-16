import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { testTimeout: 30_000, server: { deps: { external: [/@contentauth/] } } } });
