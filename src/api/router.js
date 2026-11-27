import { health } from './health/index.js'

export const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health])
    }
  }
}
