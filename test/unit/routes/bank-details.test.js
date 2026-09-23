import { bankDetails } from '../../../src/routes/bank-details.js'

describe('Bank details endpoint', () => {
  test('should have the correct method and path', () => {
    expect(bankDetails.method).toBe('GET')
    expect(bankDetails.path).toBe('/bank-details/{sbi}')
  })

  test('should return a fake bank details data set for the given SBI', () => {
    const mockRequest = { params: { sbi: '107183280' } }
    const mockH = {
      response: vi.fn().mockReturnValue({ statusCode: 200 })
    }

    const result = bankDetails.handler(mockRequest, mockH)

    expect(mockH.response).toHaveBeenCalledWith({
      sbi: '107183280',
      accountName: 'J R Farmer & Son',
      accountNumber: '12345678',
      sortCode: '12-34-56',
      bankName: 'Barclays'
    })
    expect(result).toEqual({ statusCode: 200 })
  })
})
