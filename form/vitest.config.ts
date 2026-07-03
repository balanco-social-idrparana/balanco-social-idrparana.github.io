import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // testes de DOM usam // @vitest-environment jsdom por arquivo
    include: ['src/**/*.test.ts'],
    env: {
      VITE_API_URL: 'https://example.invalid/exec',
      VITE_RECAPTCHA_SITE_KEY: 'test-site-key',
    },
  },
});
