// Tests de bout en bout : un vrai navigateur sur le site servi avec ses en-têtes de production.
// Supabase est simulé (tests/e2e/fixtures.js) : aucun test ne touche la vraie base.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    // Le service worker est désactivé par défaut : il servirait config.js depuis son cache
    // et contournerait les simulations. Un test dédié le réactive (offline.spec.js).
    serviceWorkers: "block",
    trace: "retain-on-failure",
    // Chromium déjà installé ailleurs (ex. conteneur) : PW_CHROMIUM=/chemin/vers/chrome
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tests/server.js",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
