/**
 * MCP Authentication and Security Patterns
 * Secure credential management and authentication for MCP servers
 */

const crypto = require('crypto');

class MCPAuthManager {
  constructor() {
    this.credentials = new Map();
    this.tokenCache = new Map();
    this.securityConfig = {
      tokenExpiry: 3600000, // 1 hour
      maxRetries: 3,
      encryptionAlgorithm: 'aes-256-gcm'
    };
  }

  /**
   * Register server credentials securely
   * @param {string} serverId - Server identifier
   * @param {Object} credentials - Authentication credentials
   */
  registerCredentials(serverId, credentials) {
    // Validate credentials format
    this.validateCredentials(credentials);
    
    // Encrypt sensitive data
    const encryptedCreds = this.encryptCredentials(credentials);
    
    this.credentials.set(serverId, {
      ...encryptedCreds,
      createdAt: Date.now(),
      lastUsed: null
    });
    
    console.log(`✅ Credentials registered for server: ${serverId}`);
  }

  /**
   * Get authentication token for server
   * @param {string} serverId - Server identifier
   */
  async getAuthToken(serverId) {
    const cached = this.tokenCache.get(serverId);
    
    // Return cached token if valid
    if (cached && !this.isTokenExpired(cached)) {
      return cached.token;
    }
    
    // Generate new token
    const credentials = this.getDecryptedCredentials(serverId);
    if (!credentials) {
      throw new Error(`No credentials found for server: ${serverId}`);
    }
    
    const token = await this.generateAuthToken(credentials);
    
    // Cache the token
    this.tokenCache.set(serverId, {
      token,
      expiresAt: Date.now() + this.securityConfig.tokenExpiry,
      createdAt: Date.now()
    });
    
    return token;
  }

  /**
   * Validate credentials format and security
   */
  validateCredentials(credentials) {
    const requiredFields = ['type', 'data'];
    
    for (const field of requiredFields) {
      if (!credentials[field]) {
        throw new Error(`Missing required credential field: ${field}`);
      }
    }
    
    // Validate based on auth type
    switch (credentials.type) {
      case 'api_key':
        this.validateApiKey(credentials.data);
        break;
      case 'oauth':
        this.validateOAuth(credentials.data);
        break;
      case 'jwt':
        this.validateJWT(credentials.data);
        break;
      default:
        throw new Error(`Unsupported auth type: ${credentials.type}`);
    }
  }

  /**
   * Encrypt credentials for secure storage
   */
  encryptCredentials(credentials) {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(this.securityConfig.encryptionAlgorithm, key);
    cipher.setAAD(Buffer.from('mcp-credentials'));
    
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  }

  /**
   * Decrypt credentials for use
   */
  getDecryptedCredentials(serverId) {
    const stored = this.credentials.get(serverId);
    if (!stored) return null;
    
    try {
      const key = this.getEncryptionKey();
      const decipher = crypto.createDecipher(
        this.securityConfig.encryptionAlgorithm, 
        key
      );
      
      decipher.setAAD(Buffer.from('mcp-credentials'));
      decipher.setAuthTag(Buffer.from(stored.authTag, 'base64'));
      
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(stored.encrypted, 'base64')),
        decipher.final()
      ]);
      
      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return null;
    }
  }

  /**
   * Generate authentication token based on credential type
   */
  async generateAuthToken(credentials) {
    switch (credentials.type) {
      case 'api_key':
        return this.generateApiKeyToken(credentials.data);
      case 'oauth':
        return await this.generateOAuthToken(credentials.data);
      case 'jwt':
        return this.generateJWTToken(credentials.data);
      default:
        throw new Error(`Unsupported auth type: ${credentials.type}`);
    }
  }

  /**
   * Generate API key authentication token
   */
  generateApiKeyToken(data) {
    const { apiKey, apiSecret } = data;
    
    if (!apiKey) {
      throw new Error('API key required');
    }
    
    if (apiSecret) {
      // HMAC signature for enhanced security
      const timestamp = Date.now().toString();
      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(`${apiKey}:${timestamp}`)
        .digest('hex');
      
      return `${apiKey}:${timestamp}:${signature}`;
    }
    
    return apiKey;
  }

  /**
   * Generate OAuth token
   */
  async generateOAuthToken(data) {
    const { clientId, clientSecret, refreshToken } = data;
    
    // Implement OAuth token exchange
    // This is a simplified version - implement full OAuth flow
    const tokenPayload = {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    };
    
    // In real implementation, make HTTP request to OAuth server
    return this.mockOAuthExchange(tokenPayload);
  }

  /**
   * Validate API key format and security
   */
  validateApiKey(data) {
    if (!data.apiKey || data.apiKey.length < 16) {
      throw new Error('Invalid API key format');
    }
    
    // Check for obvious security issues
    if (data.apiKey.includes(' ') || data.apiKey.includes('\n')) {
      throw new Error('API key contains invalid characters');
    }
  }

  /**
   * Validate OAuth credentials
   */
  validateOAuth(data) {
    const required = ['clientId', 'clientSecret'];
    for (const field of required) {
      if (!data[field]) {
        throw new Error(`Missing OAuth field: ${field}`);
      }
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(cached) {
    return Date.now() >= cached.expiresAt;
  }

  /**
   * Get encryption key (in production, use secure key management)
   */
  getEncryptionKey() {
    // In production, use proper key management system
    return process.env.MCP_ENCRYPTION_KEY || 'default-key-change-in-production';
  }

  /**
   * Mock OAuth exchange (implement real OAuth flow in production)
   */
  mockOAuthExchange(payload) {
    // This is a mock - implement real OAuth exchange
    return `oauth_token_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Clear expired tokens from cache
   */
  cleanupExpiredTokens() {
    for (const [serverId, cached] of this.tokenCache) {
      if (this.isTokenExpired(cached)) {
        this.tokenCache.delete(serverId);
      }
    }
  }

  /**
   * Revoke credentials for a server
   */
  revokeCredentials(serverId) {
    this.credentials.delete(serverId);
    this.tokenCache.delete(serverId);
    console.log(`🗑️ Credentials revoked for server: ${serverId}`);
  }
}

module.exports = {
  MCPAuthManager
};