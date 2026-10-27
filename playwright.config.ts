import { defineConfig } from '@playwright/test'

// UI regression tests: the built renderer is served statically and `window.flax` is mocked (e2e/mock-bridge.ts),
// so no Plex account, Electron or network is needed. `e2e/smoke.spec.ts` (real Electron) is run manually on a Mac.
export default defineConfig({
  testDir: 'e2e',
  testMatch: /ui\.spec\.ts/,
  timeout: 30_000,
  workers: 2,
  retries: process.env['CI'] ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4180',
    viewport: { width: 1360, height: 860 },
    launchOptions: { executablePath: process.env['CHROMIUM_PATH'] || undefined },
  },
  webServer: {
    command: 'pnpm exec vite preview --outDir out/renderer --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: true,
  },
})
