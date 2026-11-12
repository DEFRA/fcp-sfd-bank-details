// Test framework dependencies
import { vi, describe, test, expect } from 'vitest'

// Thing under test
import { bankDetails } from '../../../src/routes/bank-details.js'

describe('Bank details endpoint', () => {
  test('should have the correct method and path', () => {
    expect(bankDetails.method).toBe('GET')
    expect(bankDetails.path).toBe('/bank-details/{sbi}')
  })

  test('should use the default auth strategy rather than disabling auth', () => {
    expect(bankDetails.options?.auth).not.toBe(false)
  })

  test('should return a fake bank details data set for the given SBI', () => {
    // Synthetic SBI, in the 800000000 to 899999999 range reserved for test data.
    const mockRequest = { params: { sbi: '800000001' } }
    const mockH = {
      response: vi.fn().mockReturnValue({ statusCode: 200 })
    }

    const result = bankDetails.handler(mockRequest, mockH)

    expect(mockH.response).toHaveBeenCalledWith({
      sbi: '800000001',
      accountName: 'J R Farmer & Son',
      accountNumber: '12345678',
      sortCode: '12-34-56',
      bankName: 'Barclays'
    })
    expect(result).toEqual({ statusCode: 200 })
  })
})
