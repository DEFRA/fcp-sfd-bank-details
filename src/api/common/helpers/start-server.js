import { config } from '../../../config/index.js'

import { createServer } from '../../index.js'

export const startServer = async () => {
  const server = await createServer()
  await server.start()

  server.logger.info('Server started successfully')
  server.logger.info(
    `Access your backend on http://localhost:${config.get('port')}`
  )

  return server
}
