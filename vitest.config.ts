import { defineConfig } from 'vitest/config'

// Pure-logic unit tests only (no DOM, no live DB). Tests live next to the
// modules they cover as *.test.ts and import them via relative paths, so no
// path-alias resolution is needed here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
