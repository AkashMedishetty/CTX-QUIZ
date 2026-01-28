import request from 'supertest';
import { createApp } from '../app';

// Mock the services for app tests
jest.mock('../services/mongodb.service');
jest.mock('../services/redis.service');

describe('Express App', () => {
  const app = createApp();

  describe('Health Check', () => {
    it('should return health status at /api/health', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.body).toMatchObject({
        status: expect.any(String),
        uptime: expect.any(Number),
        timestamp: expect.any(String),
      });
    });

    it('should not have health check at old /health endpoint', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(404);
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/api/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Route not found',
        path: '/api/nonexistent',
      });
    });
  });

  describe('Middleware Configuration', () => {
    it('should parse JSON request bodies', async () => {
      // This will hit the 404 handler, but should successfully parse JSON
      const response = await request(app)
        .post('/api/test')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(404); // Route doesn't exist
      // If JSON parsing failed, we'd get a 400 error instead
    });

    it('should set CORS headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should handle OPTIONS requests for CORS preflight', async () => {
      const response = await request(app)
        .options('/api/test')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(204);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors with proper format', async () => {
      // Test with a route that doesn't exist
      const response = await request(app).get('/api/error-test');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });
});
