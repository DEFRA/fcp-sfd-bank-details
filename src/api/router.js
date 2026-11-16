import { health } from './health/index.js'
import { bankDetails } from './bank-details/index.js'

export const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health, bankDetails])
    }
  }
}
