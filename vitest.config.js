import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    clearMocks: true,
    // createServer registers real auth; tests start it with the local bypass
    env: {
      JWT_AUTH_BYPASS: 'true'
    },
    fileParallelism: false,
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup.js'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      reportOnFailure: true,
      // coverage/ is a bind mount in compose.test.yaml, so it can't be deleted and recreated
      clean: false,
      include: ['src/**/*.js'],
      exclude: [...configDefaults.exclude, 'coverage']
    }
  }
})
