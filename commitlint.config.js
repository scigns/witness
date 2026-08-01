/**
 * Conventional Commits are enforced because they drive semantic versioning and the
 * generated changelog. Scopes correspond to the domain integration branches defined
 * in docs/engineering/BRANCH_STRATEGY.md.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [1, 'always', 100],
    'scope-enum': [
      2,
      'always',
      [
        'architecture',
        'product',
        'research',
        'ux',
        'frontend',
        'backend',
        'workers',
        'auth',
        'knowledge-graph',
        'ai-platform',
        'capture',
        'search',
        'documents',
        'integrations',
        'security',
        'governance',
        'database',
        'storage',
        'infra',
        'deploy',
        'observability',
        'testing',
        'performance',
        'docs',
        'release',
        'sdk',
        'deps',
        'repo',
      ],
    ],
  },
};
