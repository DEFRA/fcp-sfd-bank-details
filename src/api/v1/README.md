Versioned API routes belong in this directory. Build each route path from
`config.get('baseUrl.v1')`, which defaults to `/api/v1`.

Mirror route tests under `test/unit/api/v1/` and
`test/integration/narrow/api/v1/`. Keep `/health` unversioned at the API root
because the CDP platform health check calls that path.
