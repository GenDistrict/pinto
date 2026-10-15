import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'./tests/e2e', workers:1, fullyParallel:false, timeout:60_000, expect:{timeout:10_000}, reporter:'list', outputDir:'test-results/e2e' });
