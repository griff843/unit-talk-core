// scripts/toggles/crypto.ts
// Cryptographic utilities for secure toggle system with HMAC-SHA256 signatures

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SignaturePayload } from './types.js';

export class ToggleCrypto {
  private readonly hmacKey: Buffer;

  constructor(hmacKey?: string) {
    const keyString = hmacKey || process.env.TOGGLE_HMAC_KEY;
    if (!keyString) {
      throw new Error(
        'TOGGLE_HMAC_KEY environment variable is required for cryptographic operations'
      );
    }
    
    // Validate key length (minimum 32 bytes for security)
    if (keyString.length < 32) {
      throw new Error('TOGGLE_HMAC_KEY must be at least 32 characters long');
    }
    
    this.hmacKey = Buffer.from(keyString, 'utf8');
  }

  /**
   * Create HMAC-SHA256 signature for a payload
   * Implements timing-safe signature generation with deterministic serialization
   */
  sign(payload: SignaturePayload): string {
    const serialized = this.serializePayload(payload);
    const hmac = createHmac('sha256', this.hmacKey);
    hmac.update(serialized);
    return hmac.digest('hex');
  }

  /**
   * Verify HMAC-SHA256 signature against payload
   * Uses timing-safe comparison to prevent timing attacks
   */
  verify(payload: SignaturePayload, signature: string): boolean {
    try {
      const expectedSignature = this.sign(payload);
      const providedBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      
      // Ensure both buffers are same length to prevent timing attacks
      if (providedBuffer.length !== expectedBuffer.length) {
        return false;
      }
      
      return timingSafeEqual(providedBuffer, expectedBuffer);
    } catch (error) {
      // Any error during verification means invalid signature
      return false;
    }
  }

  /**
   * Create signature for toggle proposal
   * Includes all relevant fields for non-repudiation
   */
  signProposal(
    toggleKey: string,
    currentValue: any,
    proposedValue: any,
    proposedBy: string,
    timestamp: string,
    version: number,
    reason?: string
  ): string {
    const payload: SignaturePayload = {
      action: 'propose',
      toggleKey,
      value: { currentValue, proposedValue, reason },
      timestamp,
      actor: proposedBy,
      version,
      nonce: this.generateNonce(),
    };
    
    return this.sign(payload);
  }

  /**
   * Create signature for toggle approval
   * Includes proposal ID and decision for audit trail
   */
  signApproval(
    proposalId: string,
    toggleKey: string,
    decision: 'approve' | 'reject',
    approvedBy: string,
    timestamp: string,
    version: number,
    comments?: string
  ): string {
    const payload: SignaturePayload = {
      action: decision,
      toggleKey,
      value: { proposalId, comments },
      timestamp,
      actor: approvedBy,
      version,
      nonce: this.generateNonce(),
    };
    
    return this.sign(payload);
  }

  /**
   * Create signature for toggle application
   * Records final state change with applied value
   */
  signApplication(
    toggleKey: string,
    appliedValue: any,
    appliedBy: string,
    timestamp: string,
    version: number
  ): string {
    const payload: SignaturePayload = {
      action: 'apply',
      toggleKey,
      value: appliedValue,
      timestamp,
      actor: appliedBy,
      version,
      nonce: this.generateNonce(),
    };
    
    return this.sign(payload);
  }

  /**
   * Verify proposal signature
   */
  verifyProposal(
    toggleKey: string,
    currentValue: any,
    proposedValue: any,
    proposedBy: string,
    timestamp: string,
    version: number,
    signature: string,
    reason?: string
  ): boolean {
    const payload: SignaturePayload = {
      action: 'propose',
      toggleKey,
      value: { currentValue, proposedValue, reason },
      timestamp,
      actor: proposedBy,
      version,
      // Note: Nonce is embedded in signature verification
    };
    
    // Extract nonce from original signature and verify
    return this.verifyWithNonceRecovery(payload, signature);
  }

  /**
   * Verify approval signature
   */
  verifyApproval(
    proposalId: string,
    toggleKey: string,
    decision: 'approve' | 'reject',
    approvedBy: string,
    timestamp: string,
    version: number,
    signature: string,
    comments?: string
  ): boolean {
    const payload: SignaturePayload = {
      action: decision,
      toggleKey,
      value: { proposalId, comments },
      timestamp,
      actor: approvedBy,
      version,
    };
    
    return this.verifyWithNonceRecovery(payload, signature);
  }

  /**
   * Generate cryptographically secure nonce for signature uniqueness
   */
  private generateNonce(): string {
    const { randomBytes } = require('node:crypto');
    return randomBytes(16).toString('hex');
  }

  /**
   * Serialize payload to deterministic string for signing
   * Uses JSON with sorted keys to ensure consistency
   */
  private serializePayload(payload: SignaturePayload): string {
    // Create a deep copy and sort all object keys recursively
    const sortedPayload = this.sortObjectKeys(payload);
    return JSON.stringify(sortedPayload);
  }

  /**
   * Recursively sort object keys for deterministic serialization
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }
    
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj: any = {};
    
    for (const key of sortedKeys) {
      sortedObj[key] = this.sortObjectKeys(obj[key]);
    }
    
    return sortedObj;
  }

  /**
   * Verify signature with nonce recovery for backwards compatibility
   * Uses deterministic nonce extraction from signature metadata
   */
  private verifyWithNonceRecovery(payload: SignaturePayload, signature: string): boolean {
    // Try without nonce first (backwards compatibility)
    const payloadWithoutNonce = { ...payload };
    delete payloadWithoutNonce.nonce;
    
    if (this.verify(payloadWithoutNonce, signature)) {
      return true;
    }
    
    // For production use: extract nonce from signature metadata
    // This implementation uses signature as a composite: signature + nonce
    if (signature.includes('_')) {
      const [actualSig, nonceHex] = signature.split('_');
      if (nonceHex && nonceHex.length === 32) { // 16 bytes = 32 hex chars
        const payloadWithNonce = { ...payload, nonce: nonceHex };
        return this.verify(payloadWithNonce, actualSig);
      }
    }
    
    return false;
  }

  /**
   * Enhanced signature creation with embedded nonce for verification
   */
  private signWithEmbeddedNonce(payload: SignaturePayload): string {
    const nonce = this.generateNonce();
    const payloadWithNonce = { ...payload, nonce };
    const signature = this.sign(payloadWithNonce);
    
    // Embed nonce in signature for later verification
    return `${signature}_${nonce}`;
  }
}

/**
 * Create a ToggleCrypto instance with environment key
 */
export function createToggleCrypto(): ToggleCrypto {
  return new ToggleCrypto();
}

/**
 * Generate a secure HMAC key for initial setup
 * Use this only for generating new keys, not for production usage
 */
export function generateSecureKey(): string {
  const { randomBytes } = require('node:crypto');
  return randomBytes(32).toString('hex');
}

/**
 * Validate HMAC key strength
 */
export function validateKeyStrength(key: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!key || typeof key !== 'string') {
    errors.push('Key must be a non-empty string');
  } else {
    if (key.length < 32) {
      errors.push('Key must be at least 32 characters long');
    }
    
    if (key.length < 64) {
      errors.push('Warning: Key should be at least 64 characters for optimal security');
    }
    
    // Check for common weak patterns
    if (/^(.)\1+$/.test(key)) {
      errors.push('Key should not consist of repeated characters');
    }
    
    if (/^(012345|abcdef|qwerty)/i.test(key)) {
      errors.push('Key should not use predictable patterns');
    }
  }
  
  return {
    valid: errors.filter(e => !e.startsWith('Warning:')).length === 0,
    errors,
  };
}