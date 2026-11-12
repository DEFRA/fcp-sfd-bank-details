import { config } from '../../config.js'

import { createServer } from '../../server.js'

export const startServer = async () => {
  const server = await createServer()
  await server.start()

  server.logger.info('Server started successfully')
  server.logger.info(
    `Access your backend on http://localhost:${config.get('port')}`
  )

  return server
}
