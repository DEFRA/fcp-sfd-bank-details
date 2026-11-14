export const health = {
  method: 'GET',
  path: '/health',
  options: {
    auth: false
  },
  handler: (_request, h) => {
    return h.response({ message: 'success' })
  }
}
