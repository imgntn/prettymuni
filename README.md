# Pretty Muni

Pretty Muni is a D3.js and vanilla JavaScript map for current San Francisco Muni vehicle positions.

Production: https://prettymuni.playablefuture.com

The public `imgntn/prettymuni` repo is now the canonical repo. The newer 511.org implementation from `imgntn/prettytransit` has been merged here so this repo can be deployed directly on Coolify.

## Transit API

Pretty Muni now uses 511.org instead of the retired NextBus feed:

- Route list: 511.org `lines`
- Route patterns: 511.org `patterns`
- Stop coordinates: 511.org `stops`
- Vehicle positions: 511.org GTFS-realtime protobuf feed

The API key stays server-side. The browser loads `/config.js` and then calls the local `/api/511/*` proxy endpoints.

## Local Setup

1. Get a free API key from https://511.org/open-data/transit.
2. Copy `.env.example` to `.env`.
3. Set `TRANSIT_511_API_KEY`.
4. Run the app.

```bash
npm install
npm start
```

The app listens on `http://localhost:3333` by default.

Useful settings:

```bash
PORT=3333
TRANSIT_511_API_KEY=your-key
TRANSIT_OPERATOR_ID=SF
TRANSIT_AGENCY_ID=SF
TRANSIT_PROXY_TIMEOUT_MS=30000
CORS_ORIGIN=*
```

## Deployment

Coolify deploys this repo from the `master` branch and serves the app through `devServer.js`.

Production health checks:

- `GET /health`
- `GET /healthz`

Both return JSON and include whether the upstream 511.org key is configured.

## Tests

Run the unit and browser-oriented Jest tests:

```bash
npm test
```

Run Playwright e2e tests:

```bash
npx playwright install chromium
npm run test:e2e
```

The e2e suite mocks transit payloads in-browser so it does not depend on live 511.org data.

## Background

Read about the original project at https://medium.com/@jamesbpollack/pretty-muni-71773427e83d.

![Pretty Muni screenshot](https://github.com/imgntn/prettymuni/raw/master/screenshot.PNG?raw=true)

## Notes

This project keeps the UI intentionally small: no frontend framework, mostly static assets in `/docs`, and a lightweight Express server for config, health checks, and transit API proxying.
