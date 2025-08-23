module.exports = {
  extends: [
    '@typescript-eslint/recommended',
    '../../.eslintrc.js'
  ],
  parserOptions: {
    project: './tsconfig.json'
  },
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@supabase/*'],
            message: 'Supabase imports are banned in pure logic - logic must be I/O-free'
          },
          {
            group: ['express*'],
            message: 'Express imports are banned in pure logic - logic must be I/O-free'
          },
          {
            group: ['discord.js*'],
            message: 'Discord imports are banned in pure logic - logic must be I/O-free'
          },
          {
            group: ['fs*', 'node:fs*'],
            message: 'File system imports are banned in pure logic - logic must be I/O-free'
          },
          {
            group: ['axios*', 'fetch*', 'node-fetch*'],
            message: 'HTTP client imports are banned in pure logic - logic must be I/O-free'
          },
          {
            group: ['node:child_process*'],
            message: 'Child process imports are banned in pure logic - logic must be I/O-free'
          },
          {
            group: ['process'],
            message: 'Direct process access is banned in pure logic - use dependency injection'
          }
        ]
      }
    ]
  }
};