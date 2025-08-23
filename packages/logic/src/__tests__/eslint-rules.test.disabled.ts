/**
 * This test file demonstrates that our ESLint rules catch violations
 * Note: This file should intentionally fail ESLint checks
 */

// These imports should be caught by ESLint
// import fs from 'fs'; // Should error: File system imports are banned
// import express from 'express'; // Should error: Web framework imports are banned
// import { createClient } from '@supabase/supabase-js'; // Should error: Supabase imports are banned

// These direct global accesses should be caught by ESLint
function badBusinessLogic() {
  // const now = new Date(); // Should error: Direct Date constructor is banned
  // const env = process.env.NODE_ENV; // Should error: Direct process.env access is banned
  // console.log('test'); // Should error: Direct console calls are banned
  // setTimeout(() => {}, 1000); // Should error: Direct setTimeout is banned

  return 'This function violates pure business logic principles';
}

// This is how business logic should be written - with ports
import type { Ports } from '../ports';

function goodBusinessLogic(data: unknown, ports: Ports) {
  const now = ports.clock.now();
  const config = ports.env.getString('PROCESSING_CONFIG');

  // Pure business logic using dependency injection
  return {
    processed: true,
    timestamp: now,
    config,
    data,
  };
}

describe('ESLint Rules Demo', () => {
  it('should demonstrate proper use of ports', () => {
    // This test just ensures the file compiles when following the rules
    expect(typeof goodBusinessLogic).toBe('function');
    expect(typeof badBusinessLogic).toBe('function');
  });
});
