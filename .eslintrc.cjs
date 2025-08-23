module.exports = {
  root: true,
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '.next/',
    '.turbo/',
    'out/',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'unused-imports'],
  env: { node: true, es2022: true },
  settings: {
    'import/resolver': {
      typescript: { project: ['./tsconfig.json'] },
      node: { extensions: ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'] },
    },
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  rules: {
    'unused-imports/no-unused-imports': 'error',
    'import/order': [
      'error',
      {
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    'no-console': 'off',
  },
  overrides: [
    { files: ['*.js'], rules: { '@typescript-eslint/no-var-requires': 'off' } },
  ],
};

