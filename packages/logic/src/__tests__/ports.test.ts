/**
 * Tests for the ports system
 */

import {
  validatePorts,
  createTestPorts,
  Clock,
  Ports,
  HttpRequest,
  Duration,
} from '../ports';

describe('Ports System', () => {
  describe('validatePorts', () => {
    it('should pass validation for complete ports object', () => {
      const ports = createTestPorts();
      expect(() => validatePorts(ports)).not.toThrow();
    });

    it('should throw error for missing port', () => {
      const incompletePorts = { 
        clock: createTestPorts().clock,
        env: createTestPorts().env,
        // missing db, http, files, external
      } as Partial<Ports>;
      
      expect(() => validatePorts(incompletePorts)).toThrow('Missing required port: db');
    });
  });

  describe('createTestPorts', () => {
    it('should create complete mock ports', () => {
      const ports = createTestPorts();
      
      expect(ports.clock).toBeDefined();
      expect(ports.env).toBeDefined();
      expect(ports.db).toBeDefined();
      expect(ports.http).toBeDefined();
      expect(ports.files).toBeDefined();
      expect(ports.external).toBeDefined();
    });

    it('should allow overriding individual ports', () => {
      const customClock: Clock = {
        now: () => '2025-01-01T00:00:00.000Z',
        nowAsDate: () => new Date('2025-01-01T00:00:00.000Z'),
        nowAsUnix: () => Date.parse('2025-01-01T00:00:00.000Z'),
        parseISOString: (iso) => new Date(iso),
        formatToISO: (date) => date.toISOString(),
        addDuration: (date, duration) => {
          const result = new Date(date);
          if (duration.days) result.setDate(result.getDate() + duration.days);
          return result;
        },
        getDuration: (start, end) => ({ milliseconds: end.getTime() - start.getTime() }),
        isPast: (date) => date < new Date('2025-01-01T00:00:00.000Z'),
        isFuture: (date) => date > new Date('2025-01-01T00:00:00.000Z'),
      };

      const ports = createTestPorts({ clock: customClock });
      expect(ports.clock.now()).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('Mock Clock', () => {
    it('should provide consistent time operations', () => {
      const ports = createTestPorts();
      const { clock } = ports;

      const now = clock.now();
      const nowAsDate = clock.nowAsDate();
      const nowAsUnix = clock.nowAsUnix();

      expect(now).toBe('2024-01-01T00:00:00.000Z');
      expect(nowAsDate.toISOString()).toBe('2024-01-01T00:00:00.000Z');
      expect(nowAsUnix).toBe(Date.parse('2024-01-01T00:00:00.000Z'));
    });

    it('should handle duration calculations', () => {
      const ports = createTestPorts();
      const { clock } = ports;

      const baseDate = new Date('2024-01-01T00:00:00.000Z');
      const duration: Duration = { days: 1, hours: 2 };
      
      const result = clock.addDuration(baseDate, duration);
      expect(result.getUTCDate()).toBe(2); // Next day
      expect(result.getUTCHours()).toBe(2); // Plus 2 hours
    });
  });

  describe('Mock Env', () => {
    it('should provide environment variables', () => {
      const ports = createTestPorts();
      const { env } = ports;

      expect(env.getString('TEST_VAR')).toBe('mock-TEST_VAR');
      expect(env.getNumber('PORT')).toBe(0);
      expect(env.getBoolean('ENABLED')).toBe(false);
    });

    it('should handle optional values with defaults', () => {
      const ports = createTestPorts();
      const { env } = ports;

      expect(env.getStringOptional('MISSING', 'default')).toBe('default');
      expect(env.getNumberOptional('MISSING', 3000)).toBe(3000);
      expect(env.getBooleanOptional('MISSING', true)).toBe(true);
    });
  });

  describe('Mock Db', () => {
    it('should execute queries', async () => {
      const ports = createTestPorts();
      const { db } = ports;

      const mockQuery = {
        name: 'test-query',
        sql: 'SELECT * FROM test',
        params: {},
        execute: async () => ({ result: 'success' })
      };

      const result = await db.query(mockQuery);
      expect(result).toBeDefined();
    });

    it('should provide connection status', async () => {
      const ports = createTestPorts();
      const { db } = ports;

      const status = await db.getStatus();
      expect(status.connected).toBe(true);
      expect(status.latency).toBe(10);
    });
  });

  describe('Mock Http', () => {
    it('should make HTTP requests', async () => {
      const ports = createTestPorts();
      const { http } = ports;

      const request: HttpRequest = {
        method: 'GET',
        url: 'https://api.example.com/data',
      };

      const response = await http.request(request);
      expect(response.status).toBe(200);
      expect(response.statusText).toBe('OK');
      expect(response.url).toBe('http://mock-url.com');
    });

    it('should provide convenience methods', async () => {
      const ports = createTestPorts();
      const { http } = ports;

      const getResponse = await http.get('https://api.example.com/data');
      expect(getResponse.status).toBe(200);

      const postResponse = await http.post('https://api.example.com/data', { test: 'data' });
      expect(postResponse.status).toBe(200);
    });
  });

  describe('Mock Files', () => {
    it('should handle file operations', async () => {
      const ports = createTestPorts();
      const { files } = ports;

      const content = await files.readText('/test/file.txt');
      expect(content).toBe('mock content');

      const exists = await files.exists('/test/file.txt');
      expect(exists).toBe(true);

      const metadata = await files.getMetadata('/test/file.txt');
      expect(metadata.isFile).toBe(true);
      expect(metadata.path).toBe('/test/file.txt');
    });

    it('should list directory contents', async () => {
      const ports = createTestPorts();
      const { files } = ports;

      const contents = await files.listDirectory('/test');
      expect(contents).toEqual(['file1.txt', 'file2.txt']);
    });
  });

  describe('Mock External', () => {
    it('should handle event publishing and subscribing', async () => {
      const ports = createTestPorts();
      const { external } = ports;

      const eventId = await external.publish({
        type: 'test-event',
        source: 'test-source',
        data: { message: 'test' }
      });
      expect(eventId).toBe('mock-event-id');

      const subscription = await external.subscribe(
        ['test-event'],
        async () => {},
        ['test-source']
      );
      expect(subscription.id).toBe('mock-subscription-id');
      expect(subscription.eventTypes).toEqual(['test']);
    });

    it('should provide connectivity status', async () => {
      const ports = createTestPorts();
      const { external } = ports;

      const isConnected = await external.ping();
      expect(isConnected).toBe(true);
    });
  });

  describe('Integration', () => {
    it('should work together in business logic functions', async () => {
      const ports = createTestPorts();
      
      // Simulate a business logic function that uses multiple ports
      async function processDataWithTimeStamp(data: unknown, ports: Ports) {
        const timestamp = ports.clock.now();
        const config = ports.env.getString('PROCESSING_CONFIG');
        
        await ports.external.publish({
          type: 'data-processing-started',
          source: 'business-logic',
          data: { timestamp, config, input: data }
        });
        
        return { processed: true, timestamp };
      }

      const result = await processDataWithTimeStamp({ test: 'data' }, ports);
      expect(result.processed).toBe(true);
      expect(result.timestamp).toBe('2024-01-01T00:00:00.000Z');
    });
  });
});