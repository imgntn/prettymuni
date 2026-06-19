const express = require('express');
const compression = require('compression');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3333;
const NODE_ENV = process.env.NODE_ENV || 'development';
const TRANSIT_API_BASE_URL = 'https://api.511.org/transit';
const TRANSIT_API_KEY = process.env.TRANSIT_511_API_KEY || '';
const TRANSIT_OPERATOR_ID = process.env.TRANSIT_OPERATOR_ID || 'SF';
const TRANSIT_AGENCY_ID = process.env.TRANSIT_AGENCY_ID || TRANSIT_OPERATOR_ID;
const UPSTREAM_TIMEOUT_MS = Number(process.env.TRANSIT_PROXY_TIMEOUT_MS || 30000);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://unpkg.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://plausible.racerverse.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'http:'],
      connectSrc: ["'self'", 'https://retro.umoiq.com', 'http://localhost:*', 'https://api.511.org', 'https://cdn.jsdelivr.net', 'https://plausible.racerverse.com'],
      fontSrc: ["'self'", 'data:', 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
    },
  },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(compression());
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function buildTransitURL(endpoint, queryParams) {
  const url = new URL(`${TRANSIT_API_BASE_URL}/${endpoint}`);
  url.searchParams.set('api_key', TRANSIT_API_KEY);

  Object.entries(queryParams || {}).forEach(([key, value]) => {
    if (typeof value !== 'undefined' && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

function makeUpstreamRequest(url, acceptHeader) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  return fetch(url, {
    signal: controller.signal,
    headers: {
      'Accept': acceptHeader || '*/*',
      'User-Agent': 'prettymuni-server'
    }
  }).finally(() => {
    clearTimeout(timeout);
  });
}

function copyUpstreamHeaders(upstreamResponse, response) {
  const contentType = upstreamResponse.headers.get('content-type');
  const cacheControl = upstreamResponse.headers.get('cache-control');
  const retryAfter = upstreamResponse.headers.get('retry-after');

  if (contentType) {
    response.set('Content-Type', contentType);
  }
  if (cacheControl) {
    response.set('Cache-Control', cacheControl);
  }
  if (retryAfter) {
    response.set('Retry-After', retryAfter);
  }
}

function requireTransitApiKey(req, res, next) {
  if (!TRANSIT_API_KEY) {
    return res.status(500).json({
      error: 'Server misconfiguration',
      message: 'TRANSIT_511_API_KEY is not configured'
    });
  }
  next();
}

function normalizeTransitProxyError(error, res) {
  if (error && error.name === 'AbortError') {
    return res.status(504).json({
      error: 'Upstream timeout',
      message: 'Timed out while fetching data from 511.org'
    });
  }
  return res.status(502).json({
    error: 'Proxy error',
    message: 'Failed to fetch data from upstream API'
  });
}

app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.PRETTYMUNI_CONFIG = ${JSON.stringify({
    apiBaseURL: '/api/511',
    operatorId: TRANSIT_OPERATOR_ID
  })};`);
});

app.get(['/health', '/healthz'], (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'prettymuni',
    upstreamConfigured: Boolean(TRANSIT_API_KEY)
  });
});

app.get('/api/511/lines', requireTransitApiKey, async (req, res) => {
  try {
    const operatorId = req.query.operator_id || TRANSIT_OPERATOR_ID;
    const upstreamURL = buildTransitURL('lines', {
      operator_id: operatorId,
      format: 'json'
    });
    const upstreamResponse = await makeUpstreamRequest(upstreamURL, 'application/json');
    const upstreamBody = await upstreamResponse.text();
    copyUpstreamHeaders(upstreamResponse, res);
    res.status(upstreamResponse.status).send(upstreamBody);
  } catch (error) {
    normalizeTransitProxyError(error, res);
  }
});

app.get('/api/511/patterns', requireTransitApiKey, async (req, res) => {
  if (!req.query.line_id) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'line_id is required'
    });
  }

  try {
    const operatorId = req.query.operator_id || TRANSIT_OPERATOR_ID;
    const upstreamURL = buildTransitURL('patterns', {
      operator_id: operatorId,
      line_id: req.query.line_id,
      format: 'json'
    });
    const upstreamResponse = await makeUpstreamRequest(upstreamURL, 'application/json');
    const upstreamBody = await upstreamResponse.text();
    copyUpstreamHeaders(upstreamResponse, res);
    res.status(upstreamResponse.status).send(upstreamBody);
  } catch (error) {
    normalizeTransitProxyError(error, res);
  }
});

app.get('/api/511/stops', requireTransitApiKey, async (req, res) => {
  if (!req.query.line_id) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'line_id is required'
    });
  }

  try {
    const operatorId = req.query.operator_id || TRANSIT_OPERATOR_ID;
    const upstreamURL = buildTransitURL('stops', {
      operator_id: operatorId,
      line_id: req.query.line_id,
      format: 'json'
    });
    const upstreamResponse = await makeUpstreamRequest(upstreamURL, 'application/json');
    const upstreamBody = await upstreamResponse.text();
    copyUpstreamHeaders(upstreamResponse, res);
    res.status(upstreamResponse.status).send(upstreamBody);
  } catch (error) {
    normalizeTransitProxyError(error, res);
  }
});

app.get('/api/511/vehiclepositions', requireTransitApiKey, async (req, res) => {
  try {
    const agency = req.query.agency || TRANSIT_AGENCY_ID;
    const upstreamURL = buildTransitURL('vehiclepositions', { agency });
    const upstreamResponse = await makeUpstreamRequest(upstreamURL, 'application/octet-stream, application/x-protobuf');
    const upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer());
    copyUpstreamHeaders(upstreamResponse, res);
    if (!res.get('Content-Type')) {
      res.set('Content-Type', 'application/octet-stream');
    }
    res.status(upstreamResponse.status).send(upstreamBody);
  } catch (error) {
    normalizeTransitProxyError(error, res);
  }
});

app.use(express.static(path.join(__dirname, 'docs'), {
  maxAge: NODE_ENV === 'production' ? '1d' : 0,
  etag: true
}));

app.use('/proxy', async (req, res) => {
  const targetUrl = req.query.url || req.url.replace('/?url=', '');

  if (!targetUrl || !targetUrl.includes('retro.umoiq.com/service/publicXMLFeed')) {
    return res.status(400).json({
      error: 'Invalid proxy request',
      message: 'Only Umo IQ API requests are allowed'
    });
  }

  try {
    const upstreamResponse = await makeUpstreamRequest(targetUrl, req.headers.accept || '*/*');
    const upstreamBody = await upstreamResponse.text();
    copyUpstreamHeaders(upstreamResponse, res);
    res.status(upstreamResponse.status).send(upstreamBody);
  } catch (error) {
    normalizeTransitProxyError(error, res);
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err.stack);

  const status = err.status || 500;
  const message = NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message;

  res.status(status).json({
    error: true,
    message: message,
    ...(NODE_ENV !== 'production' && { stack: err.stack })
  });
});

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`);
    console.log(`Serving static files from: ${path.join(__dirname, 'docs')}`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

module.exports = app;
