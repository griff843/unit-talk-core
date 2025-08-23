#!/usr/bin/env node

/**
 * Elite Dashboard Server
 * 
 * Cross-platform HTTP server for elite dashboard with:
 * - Real-time dashboard serving
 * - API endpoints for monitoring data
 * - WebSocket support for real-time updates
 * - Cross-platform compatibility (Windows/Unix)
 * - Auto-refresh and live updates
 * - Professional war-room display
 */

import { createServer } from 'http';
import { parse } from 'url';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { WebSocketServer } from 'ws';
import { platform, release } from 'os';

import { EliteDashboardAggregator, type EliteDashboardData } from './elite-dashboard-aggregator.js';
import { generateEliteDashboardHTML } from './elite-dashboard-components.js';

interface ServerConfig {
  port: number;
  host: string;
  outputDir: string;
  refreshInterval: number;
  enableWebSocket: boolean;
  enableCORS: boolean;
  warRoomMode: boolean;
}

class EliteDashboardServer {
  private config: ServerConfig;
  private aggregator: EliteDashboardAggregator;
  private server: any;
  private wsServer?: WebSocketServer;
  private clients: Set<any> = new Set();
  private lastData?: EliteDashboardData;
  private refreshTimer?: NodeJS.Timeout;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = {
      port: config.port || parseInt(process.env.DASHBOARD_PORT || '3001'),
      host: config.host || process.env.DASHBOARD_HOST || '0.0.0.0',
      outputDir: config.outputDir || join(process.cwd(), 'out', 'ops'),
      refreshInterval: config.refreshInterval || 30,
      enableWebSocket: config.enableWebSocket !== false,
      enableCORS: config.enableCORS !== false,
      warRoomMode: config.warRoomMode || process.env.WAR_ROOM_MODE === 'true'
    };

    this.aggregator = new EliteDashboardAggregator(this.config.outputDir, this.config.refreshInterval);
    this.setupServer();
  }

  /**
   * Setup HTTP server with cross-platform compatibility
   */
  private setupServer() {
    this.server = createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        console.error('Request handling error:', error);
        this.sendErrorResponse(res, 500, 'Internal Server Error');
      }
    });

    // Handle server errors
    this.server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${this.config.port} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error);
      }
    });

    // Setup WebSocket server for real-time updates
    if (this.config.enableWebSocket) {
      this.wsServer = new WebSocketServer({ server: this.server });
      this.setupWebSocket();
    }
  }

  /**
   * Setup WebSocket for real-time updates
   */
  private setupWebSocket() {
    if (!this.wsServer) return;

    this.wsServer.on('connection', (ws) => {
      console.log('📡 WebSocket client connected');
      this.clients.add(ws);

      // Send initial data if available
      if (this.lastData) {
        ws.send(JSON.stringify({
          type: 'dashboard_update',
          data: this.lastData
        }));
      }

      ws.on('close', () => {
        console.log('📡 WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.warn('⚠️  WebSocket client error:', error);
        this.clients.delete(ws);
      });

      // Handle ping/pong for connection health
      ws.on('pong', () => {
        (ws as any).isAlive = true;
      });
    });

    // Periodic ping to keep connections alive
    const pingInterval = setInterval(() => {
      this.wsServer?.clients.forEach((ws) => {
        if ((ws as any).isAlive === false) {
          ws.terminate();
          this.clients.delete(ws);
          return;
        }
        (ws as any).isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wsServer.on('close', () => {
      clearInterval(pingInterval);
    });
  }

  /**
   * Handle HTTP requests with routing
   */
  private async handleRequest(req: any, res: any) {
    const parsedUrl = parse(req.url!, true);
    const pathname = parsedUrl.pathname || '/';

    // Enable CORS if configured
    if (this.config.enableCORS) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
    }

    // Route handling
    switch (pathname) {
      case '/':
      case '/dashboard':
        await this.serveDashboard(req, res);
        break;

      case '/api/dashboard/data':
        await this.serveDashboardData(req, res);
        break;

      case '/api/dashboard/refresh':
        await this.forceRefresh(req, res);
        break;

      case '/api/health':
        await this.serveHealthCheck(req, res);
        break;

      case '/api/system/info':
        await this.serveSystemInfo(req, res);
        break;

      case '/api/monitoring/exposure':
        await this.serveMonitoringData(req, res, 'exposure');
        break;

      case '/api/monitoring/freeze':
        await this.serveMonitoringData(req, res, 'freeze');
        break;

      case '/api/monitoring/drift':
        await this.serveMonitoringData(req, res, 'drift');
        break;

      case '/api/monitoring/slo':
        await this.serveMonitoringData(req, res, 'slo');
        break;

      case '/api/monitoring/toggles':
        await this.serveMonitoringData(req, res, 'toggles');
        break;

      case '/static/dashboard.css':
        await this.serveStaticFile(req, res, 'css');
        break;

      case '/static/dashboard.js':
        await this.serveStaticFile(req, res, 'js');
        break;

      case '/favicon.ico':
        this.serveFavicon(req, res);
        break;

      default:
        this.sendErrorResponse(res, 404, 'Not Found');
    }
  }

  /**
   * Serve main dashboard HTML
   */
  private async serveDashboard(req: any, res: any) {
    try {
      // Get fresh dashboard data
      const data = await this.getDashboardData();
      
      // Generate HTML with components
      const html = generateEliteDashboardHTML(data);

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(html);

    } catch (error) {
      console.error('❌ Dashboard serving error:', error);
      this.sendErrorResponse(res, 500, 'Dashboard Error');
    }
  }

  /**
   * Serve dashboard data as JSON
   */
  private async serveDashboardData(req: any, res: any) {
    try {
      const data = await this.getDashboardData();
      
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(JSON.stringify(data, null, 2));

    } catch (error) {
      console.error('❌ Dashboard data serving error:', error);
      this.sendErrorResponse(res, 500, 'Data Error');
    }
  }

  /**
   * Force refresh dashboard data
   */
  private async forceRefresh(req: any, res: any) {
    try {
      console.log('🔄 Force refresh requested');
      const data = await this.aggregator.aggregate();
      await this.aggregator.save(data);
      
      this.lastData = data;
      
      // Broadcast to WebSocket clients
      this.broadcastUpdate(data);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        timestamp: data.timestamp,
        health_score: data.overall_status.health_score 
      }));

    } catch (error) {
      console.error('❌ Refresh error:', error);
      this.sendErrorResponse(res, 500, 'Refresh Error');
    }
  }

  /**
   * Serve health check endpoint
   */
  private async serveHealthCheck(req: any, res: any) {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime_seconds: uptime,
      memory_usage_mb: Math.round(memoryUsage.rss / 1024 / 1024),
      platform: platform(),
      node_version: process.version,
      dashboard_config: {
        port: this.config.port,
        host: this.config.host,
        war_room_mode: this.config.warRoomMode,
        websocket_enabled: this.config.enableWebSocket,
        connected_clients: this.clients.size
      },
      last_data_update: this.lastData?.timestamp || null
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  }

  /**
   * Serve system information
   */
  private async serveSystemInfo(req: any, res: any) {
    const systemInfo = {
      platform: platform(),
      architecture: process.arch,
      os_release: release(),
      node_version: process.version,
      uptime_seconds: Math.floor(process.uptime()),
      memory_usage: process.memoryUsage(),
      server_config: this.config,
      environment: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        SHADOW_MODE: process.env.SHADOW_MODE === 'true',
        WAR_ROOM_MODE: process.env.WAR_ROOM_MODE === 'true',
        PUBLISH_TO_DISCORD: process.env.PUBLISH_TO_DISCORD === 'true'
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(systemInfo, null, 2));
  }

  /**
   * Serve specific monitoring system data
   */
  private async serveMonitoringData(req: any, res: any, system: string) {
    try {
      const filePath = join(this.config.outputDir, `${system}.json`);
      
      if (!existsSync(filePath)) {
        this.sendErrorResponse(res, 404, `${system} data not found`);
        return;
      }

      const data = readFileSync(filePath, 'utf-8');
      const jsonData = JSON.parse(data);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(jsonData, null, 2));

    } catch (error) {
      console.error(`❌ ${system} data serving error:`, error);
      this.sendErrorResponse(res, 500, `${system} Error`);
    }
  }

  /**
   * Serve static files (CSS, JS)
   */
  private async serveStaticFile(req: any, res: any, type: 'css' | 'js') {
    let content = '';
    let contentType = '';

    if (type === 'css') {
      contentType = 'text/css';
      content = `
        /* Additional dashboard styles */
        .pulse-critical {
          animation: pulse-critical 2s infinite;
        }
        @keyframes pulse-critical {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .war-room-mode {
          font-size: 1.1em;
          line-height: 1.4;
        }
        @media (min-width: 1920px) {
          .war-room-mode {
            font-size: 1.2em;
          }
        }
      `;
    } else if (type === 'js') {
      contentType = 'application/javascript';
      content = `
        // Additional dashboard JavaScript
        console.log('Elite Dashboard client-side scripts loaded');
        
        // WebSocket connection for real-time updates
        if (typeof WebSocket !== 'undefined') {
          const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = \`\${wsProtocol}//\${window.location.host}\`;
          
          try {
            const ws = new WebSocket(wsUrl);
            
            ws.onmessage = (event) => {
              try {
                const message = JSON.parse(event.data);
                if (message.type === 'dashboard_update') {
                  console.log('Received real-time dashboard update');
                  // Optionally reload the page or update specific elements
                  if (confirm('Dashboard data updated. Reload to see changes?')) {
                    window.location.reload();
                  }
                }
              } catch (e) {
                console.warn('Invalid WebSocket message:', e);
              }
            };
            
            ws.onopen = () => {
              console.log('WebSocket connected for real-time updates');
            };
            
            ws.onclose = () => {
              console.log('WebSocket disconnected');
            };
            
            ws.onerror = (error) => {
              console.warn('WebSocket error:', error);
            };
          } catch (error) {
            console.warn('WebSocket not available:', error);
          }
        }
      `;
    }

    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300' // 5 minute cache
    });
    res.end(content);
  }

  /**
   * Serve favicon
   */
  private serveFavicon(req: any, res: any) {
    // Simple 1x1 transparent PNG
    const favicon = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    
    res.writeHead(200, { 
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400' // 24 hour cache
    });
    res.end(favicon);
  }

  /**
   * Send error response
   */
  private sendErrorResponse(res: any, statusCode: number, message: string) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: true,
      status: statusCode,
      message,
      timestamp: new Date().toISOString()
    }));
  }

  /**
   * Get dashboard data (cached or fresh)
   */
  private async getDashboardData(): Promise<EliteDashboardData> {
    // Try to load from cache first
    const cacheFile = join(this.config.outputDir, 'elite-dashboard.json');
    
    if (existsSync(cacheFile)) {
      try {
        const cachedData = JSON.parse(readFileSync(cacheFile, 'utf-8'));
        const age = Date.now() - new Date(cachedData.timestamp).getTime();
        
        // Use cached data if less than refresh interval old
        if (age < this.config.refreshInterval * 1000) {
          this.lastData = cachedData;
          return cachedData;
        }
      } catch (error) {
        console.warn('⚠️  Failed to load cached dashboard data:', error);
      }
    }

    // Generate fresh data
    const data = await this.aggregator.aggregate();
    await this.aggregator.save(data);
    this.lastData = data;
    
    return data;
  }

  /**
   * Broadcast update to WebSocket clients
   */
  private broadcastUpdate(data: EliteDashboardData) {
    if (!this.config.enableWebSocket || this.clients.size === 0) return;

    const message = JSON.stringify({
      type: 'dashboard_update',
      data: {
        timestamp: data.timestamp,
        overall_status: data.overall_status,
        critical_alerts: data.alerts.filter(a => a.level === 'CRITICAL').length,
        health_score: data.overall_status.health_score
      }
    });

    this.clients.forEach((ws) => {
      try {
        ws.send(message);
      } catch (error) {
        console.warn('⚠️  Failed to send WebSocket message:', error);
        this.clients.delete(ws);
      }
    });

    console.log(`📡 Broadcasted update to ${this.clients.size} WebSocket clients`);
  }

  /**
   * Start automatic data refresh
   */
  private startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      try {
        console.log('🔄 Auto-refreshing dashboard data...');
        const data = await this.aggregator.aggregate();
        await this.aggregator.save(data);
        
        this.lastData = data;
        this.broadcastUpdate(data);
        
        console.log(`✅ Dashboard auto-refresh completed - Health: ${data.overall_status.health_score}/100`);
      } catch (error) {
        console.error('❌ Auto-refresh failed:', error);
      }
    }, this.config.refreshInterval * 1000);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        console.log(`🚀 Elite Dashboard Server started`);
        console.log(`📊 Dashboard: http://${this.config.host}:${this.config.port}`);
        console.log(`🔌 API: http://${this.config.host}:${this.config.port}/api`);
        console.log(`📡 WebSocket: ${this.config.enableWebSocket ? 'Enabled' : 'Disabled'}`);
        console.log(`🔄 Auto-refresh: ${this.config.refreshInterval}s`);
        console.log(`🏛️  War Room Mode: ${this.config.warRoomMode ? 'Enabled' : 'Disabled'}`);
        console.log(`📂 Output Directory: ${this.config.outputDir}`);
        console.log(`💻 Platform: ${platform()} ${process.arch}`);
        console.log(`\nPress Ctrl+C to stop\n`);

        // Start auto-refresh
        this.startAutoRefresh();

        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
      }

      if (this.wsServer) {
        this.wsServer.close();
      }

      this.server.close(() => {
        console.log('🛑 Elite Dashboard Server stopped');
        resolve();
      });
    });
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);

  const config: Partial<ServerConfig> = {
    port: args.includes('--port') ? parseInt(args[args.indexOf('--port') + 1]) : undefined,
    host: args.includes('--host') ? args[args.indexOf('--host') + 1] : undefined,
    outputDir: args.includes('--output') ? args[args.indexOf('--output') + 1] : undefined,
    refreshInterval: args.includes('--refresh') ? parseInt(args[args.indexOf('--refresh') + 1]) : undefined,
    enableWebSocket: !args.includes('--no-websocket'),
    enableCORS: !args.includes('--no-cors'),
    warRoomMode: args.includes('--war-room') || process.env.WAR_ROOM_MODE === 'true'
  };

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Elite Dashboard Server

USAGE:
  elite-dashboard-server.ts [OPTIONS]

OPTIONS:
  --port PORT          Server port (default: 3001)
  --host HOST          Server host (default: 0.0.0.0)
  --output DIR         Dashboard output directory (default: out/ops)
  --refresh SECS       Auto-refresh interval (default: 30)
  --war-room           Enable war-room display mode
  --no-websocket       Disable WebSocket real-time updates
  --no-cors            Disable CORS headers
  --help, -h           Show this help

ENDPOINTS:
  GET  /                       Main dashboard HTML
  GET  /api/dashboard/data     Dashboard data JSON
  POST /api/dashboard/refresh  Force refresh data
  GET  /api/health             Server health check
  GET  /api/system/info        System information
  GET  /api/monitoring/*       Individual monitoring data

EXAMPLES:
  npm run ops:dashboard-server
  npm run ops:dashboard-server -- --port 8080 --war-room
  npm run ops:dashboard-server -- --host 127.0.0.1 --no-websocket
    `);
    process.exit(0);
  }

  try {
    const server = new EliteDashboardServer(config);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down Elite Dashboard Server...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await server.stop();
      process.exit(0);
    });

    // Start the server
    await server.start();

  } catch (error) {
    console.error('❌ Failed to start Elite Dashboard Server:', error);
    process.exit(1);
  }
}

// Export for programmatic usage
export { EliteDashboardServer, type ServerConfig };

// Run CLI if called directly
if (require.main === module) {
  main();
}