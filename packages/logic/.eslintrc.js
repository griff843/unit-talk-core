module.exports = {
  extends: [
    'plugin:@typescript-eslint/recommended',
    '../../.eslintrc.cjs'
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
            message: 'Supabase imports are banned in pure logic - use Db port instead'
          },
          {
            group: ['express*', 'fastify*', 'koa*'],
            message: 'Web framework imports are banned in pure logic - logic must be I/O-free'
          },
          {
            group: ['discord.js*', '@discordjs/*'],
            message: 'Discord imports are banned in pure logic - use External port instead'
          },
          {
            group: ['fs*', 'node:fs*', 'path*', 'node:path*'],
            message: 'File system imports are banned in pure logic - use Files port instead'
          },
          {
            group: ['http*', 'https*', 'node:http*', 'node:https*'],
            message: 'HTTP client imports are banned in pure logic - use Http port instead'
          },
          {
            group: ['axios*', 'fetch*', 'node-fetch*', 'got*', 'request*', 'superagent*'],
            message: 'HTTP client imports are banned in pure logic - use Http port instead'
          },
          {
            group: ['child_process*', 'node:child_process*'],
            message: 'Child process imports are banned in pure logic - logic must be I/O-free'
          },
          {
            group: ['pg*', 'mysql*', 'sqlite*', 'mongodb*', 'mongoose*'],
            message: 'Database client imports are banned in pure logic - use Db port instead'
          },
          {
            group: ['redis*', 'ioredis*'],
            message: 'Cache client imports are banned in pure logic - use appropriate port'
          },
          {
            group: ['nodemailer*', 'sendgrid*'],
            message: 'Email client imports are banned in pure logic - use External port instead'
          },
          {
            group: ['temporal*', '@temporalio/*'],
            message: 'Temporal imports are banned in pure logic - use External port instead'
          },
          {
            group: ['openai*', '@anthropic/*'],
            message: 'AI client imports are banned in pure logic - use Http port instead'
          },
          {
            group: ['winston*', 'pino*', 'bunyan*'],
            message: 'Logger imports are banned in pure logic - logging should be external concern'
          }
        ],
        paths: [
          {
            name: 'process',
            message: 'Direct process access is banned in pure logic - use Env port instead'
          },
          {
            name: 'console',
            message: 'Direct console access is banned in pure logic - logging should be external concern'
          },
          {
            name: 'Date',
            message: 'Direct Date constructor is banned in pure logic - use Clock port instead'
          }
        ]
      }
    ],
    'no-restricted-globals': [
      'error',
      {
        name: 'process',
        message: 'Direct process access is banned in pure logic - use Env port instead'
      },
      {
        name: 'console',
        message: 'Direct console access is banned in pure logic - logging should be external concern'
      },
      {
        name: 'Date',
        message: 'Direct Date constructor is banned in pure logic - use Clock port instead'
      },
      {
        name: 'setTimeout',
        message: 'Direct setTimeout is banned in pure logic - use Clock port for time operations'
      },
      {
        name: 'setInterval',
        message: 'Direct setInterval is banned in pure logic - use Clock port for time operations'
      },
      {
        name: 'clearTimeout',
        message: 'Direct clearTimeout is banned in pure logic - use Clock port for time operations'
      },
      {
        name: 'clearInterval',
        message: 'Direct clearInterval is banned in pure logic - use Clock port for time operations'
      },
      {
        name: 'fetch',
        message: 'Direct fetch is banned in pure logic - use Http port instead'
      }
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: 'NewExpression[callee.name="Date"]',
        message: 'Direct Date constructor is banned in pure logic - use Clock port instead'
      },
      {
        selector: 'CallExpression[callee.name="fetch"]',
        message: 'Direct fetch calls are banned in pure logic - use Http port instead'
      },
      {
        selector: 'MemberExpression[object.name="process"][property.name="env"]',
        message: 'Direct process.env access is banned in pure logic - use Env port instead'
      },
      {
        selector: 'CallExpression[callee.object.name="console"]',
        message: 'Direct console calls are banned in pure logic - logging should be external concern'
      },
      {
        selector: 'CallExpression[callee.name="setTimeout"]',
        message: 'Direct setTimeout calls are banned in pure logic - use Clock port instead'
      },
      {
        selector: 'CallExpression[callee.name="setInterval"]',
        message: 'Direct setInterval calls are banned in pure logic - use Clock port instead'
      }
    ]
  }
};