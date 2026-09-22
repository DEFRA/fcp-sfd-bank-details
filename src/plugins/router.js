import { routes } from '#/routes/routes.js'

export const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route(routes)
    }
  }
}
