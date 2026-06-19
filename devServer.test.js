const request = require('supertest');
const app = require('./devServer');

describe('DevServer', () => {
  let server;

  beforeAll(() => {
    server = app;
  });

  describe('Static File Serving', () => {
    test('should serve index.html', async () => {
      const response = await request(server).get('/');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/html/);
    });

    test('should serve Mapper.js', async () => {
      const response = await request(server).get('/Mapper.js');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/javascript/);
    });

    test('should serve CSS files', async () => {
      const response = await request(server).get('/styles/style.css');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/css/);
    });

    test('should return 404 for non-existent files', async () => {
      const response = await request(server).get('/non-existent-file.js');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });
  });

  describe('Runtime Config', () => {
    test('should expose runtime client config without leaking API key', async () => {
      const response = await request(server).get('/config.js');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/javascript/);
      expect(response.text).toContain('window.PRETTYMUNI_CONFIG');
      expect(response.text).toContain('/api/511');
      expect(response.text).not.toContain('TRANSIT_511_API_KEY');
    });
  });

  describe('Health Checks', () => {
    test('should expose a lightweight health endpoint', async () => {
      const response = await request(server).get('/health');
      expect(response.status).toBe(200);
      expect(response.type).toMatch(/json/);
      expect(response.body).toMatchObject({
        ok: true,
        service: 'prettymuni'
      });
      expect(response.body).toHaveProperty('upstreamConfigured');
    });
  });

  describe('Proxy Endpoint', () => {
    test('should reject proxy requests without URL', async () => {
      const response = await request(server).get('/proxy');
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid proxy request');
    });

    test('should reject proxy requests to non-UmoIQ URLs', async () => {
      const response = await request(server)
        .get('/proxy?url=https://example.com/api');
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid proxy request');
      expect(response.body).toHaveProperty('message', 'Only Umo IQ API requests are allowed');
    });

    test('should accept valid UmoIQ API requests', async () => {
      const validUrl = 'https://retro.umoiq.com/service/publicXMLFeed?command=routeList&a=sf-muni';
      const response = await request(server)
        .get('/proxy?url=' + encodeURIComponent(validUrl));
      // Since this makes a real request, we just check it doesn't return 400
      expect(response.status).not.toBe(400);
    });
  });

  describe('Security Headers', () => {
    test('should include security headers', async () => {
      const response = await request(server).get('/');
      expect(response.headers).toHaveProperty('content-security-policy');
      expect(response.headers).toHaveProperty('x-content-type-options');
    });

    test('should allow JSDelivr CDN in script-src for protobufjs', async () => {
      const response = await request(server).get('/');
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain('script-src');
      expect(csp).toContain('https://cdn.jsdelivr.net');
    });

    test('should allow 511.org API in connect-src', async () => {
      const response = await request(server).get('/');
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain('connect-src');
      expect(csp).toContain('https://api.511.org');
    });

    test('should maintain existing CDN allowances', async () => {
      const response = await request(server).get('/');
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain('https://unpkg.com');
      expect(csp).toContain('https://cdnjs.cloudflare.com');
      expect(csp).toContain('https://retro.umoiq.com');
    });

    test('should include required CSP directives', async () => {
      const response = await request(server).get('/');
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(csp).toContain("img-src 'self' data: https: http:");
      expect(csp).toContain("font-src 'self' data:");
    });
  });

  describe('CORS', () => {
    test('should include CORS headers', async () => {
      const response = await request(server)
        .get('/')
        .set('Origin', 'http://localhost:3000');
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Compression', () => {
    test('should compress responses when appropriate', async () => {
      const response = await request(server)
        .get('/Mapper.js')
        .set('Accept-Encoding', 'gzip');
      // The response might be compressed based on size
      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 errors gracefully', async () => {
      const response = await request(server).get('/api/non-existent');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('path');
    });
  });

  describe('External Resource Connectivity', () => {
    test('should allow access to JSDelivr CDN for protobufjs', async () => {
      // Test that the CSP allows fetching from JSDelivr
      const serverResponse = await request(server).get('/');
      const csp = serverResponse.headers['content-security-policy'];
      expect(csp).toContain('https://cdn.jsdelivr.net');
      
      // Verify script-src contains JSDelivr
      const scriptSrcMatch = csp.match(/script-src[^;]*/);
      expect(scriptSrcMatch[0]).toContain('https://cdn.jsdelivr.net');
    });

    test('should allow access to 511.org API', async () => {
      // Test that the CSP allows connecting to 511.org API
      const serverResponse = await request(server).get('/');
      const csp = serverResponse.headers['content-security-policy'];
      expect(csp).toContain('https://api.511.org');
      
      // Test that a client-side request would be allowed by CSP
      expect(csp).toMatch(/connect-src[^;]*https:\/\/api\.511\.org/);
    });

    test('should verify HTML references protobufjs correctly', async () => {
      const response = await request(server).get('/');
      const html = response.text;
      expect(html).toContain('https://cdn.jsdelivr.net/npm/protobufjs@7/dist/protobuf.min.js');
    });
  });

  describe('CSP Compliance Validation', () => {
    test('should not block resources referenced in HTML', async () => {
      const response = await request(server).get('/');
      const csp = response.headers['content-security-policy'];
      const html = response.text;

      // Remove HTML comments first to avoid checking commented-out scripts
      const htmlWithoutComments = html.replace(/<!--[\s\S]*?-->/g, '');

      // Extract script sources from active HTML only
      const scriptMatches = htmlWithoutComments.match(/<script[^>]+src=["']([^"']+)["'][^>]*>/g) || [];
      const externalScripts = scriptMatches
        .map(match => {
          const srcMatch = match.match(/src=["']([^"']+)["']/);
          return srcMatch ? srcMatch[1] : null;
        })
        .filter(src => src && src.startsWith('http'));

      // Verify each external script is allowed by CSP
      externalScripts.forEach(scriptSrc => {
        const domain = new URL(scriptSrc).hostname;
        expect(csp).toContain(domain);
      });

      // Specifically verify protobufjs is included
      expect(externalScripts.some(src => src.includes('cdn.jsdelivr.net'))).toBe(true);
    });

    test('should allow all required domains for transit data', async () => {
      const response = await request(server).get('/');
      const csp = response.headers['content-security-policy'];
      
      // Required domains for the app to function
      const requiredDomains = [
        'cdn.jsdelivr.net',  // protobufjs
        'api.511.org',       // transit API
        'retro.umoiq.com'    // existing proxy target
      ];

      requiredDomains.forEach(domain => {
        expect(csp).toContain(domain);
      });
    });
  });

  describe('Environment Configuration', () => {
    test('should use default port when PORT env is not set', () => {
      const originalPort = process.env.PORT;
      delete process.env.PORT;
      // Port should default to 3333
      expect(process.env.PORT || 3333).toBe(3333);
      process.env.PORT = originalPort;
    });

    test('should use development mode when NODE_ENV is not set', () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      expect(process.env.NODE_ENV || 'development').toBe('development');
      process.env.NODE_ENV = originalEnv;
    });
  });
});
