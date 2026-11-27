import { describe, expect, test } from 'vitest'

import { config } from '../../../src/config/index.js'

describe('server config', () => {
  describe('version 1 API base URL', () => {
    test('should default to /api/v1', () => {
      expect(config.get('baseUrl.v1')).toBe('/api/v1')
    })
  })
})
