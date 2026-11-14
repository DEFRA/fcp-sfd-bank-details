export const bankDetails = {
  method: 'GET',
  path: '/bank-details/{sbi}',
  handler: (request, h) => {
    const { sbi } = request.params

    return h.response({
      sbi,
      accountName: 'J R Farmer & Son',
      accountNumber: '12345678',
      sortCode: '12-34-56',
      bankName: 'Barclays'
    })
  }
}
