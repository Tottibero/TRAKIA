module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'contracts-independent',
      severity: 'error',
      from: { path: '^packages/contracts/src/' },
      to: { path: '^(apps/|.*node_modules/(?:@nestjs/|typeorm))' },
    },
    {
      name: 'domain-independent',
      severity: 'error',
      from: { path: '^apps/api/src/modules/[^/]+/domain/' },
      to: {
        path: '^apps/api/src/modules/[^/]+/(?:application|infrastructure|presentation)/|^apps/api/src/(?:config|database)/|node_modules/(?:@nestjs/|typeorm)',
      },
    },
    {
      name: 'domain-no-http',
      severity: 'error',
      from: { path: '^apps/api/src/modules/[^/]+/domain/' },
      to: {
        path: '^(?:node:)?(?:http|https|http2)(?:/|$)|(?:^|/)node_modules/(?:express|fastify|axios|undici|got|superagent)(?:/|$)',
      },
    },
    {
      name: 'presentation-no-persistence',
      severity: 'error',
      from: { path: '^apps/api/src/modules/[^/]+/presentation/' },
      to: { path: '^apps/api/src/modules/[^/]+/infrastructure/' },
    },
    {
      name: 'controller-no-infrastructure',
      severity: 'error',
      from: { path: '^apps/api/src/modules/[^/]+/.*\\.controller\\.ts$' },
      to: { path: '^apps/api/src/modules/[^/]+/infrastructure/' },
    },
    {
      name: 'web-no-api-internals',
      severity: 'error',
      from: { path: '^apps/web/src/' },
      to: { path: '^apps/api/' },
    },
    {
      name: 'api-not-web-source',
      severity: 'error',
      from: { path: '^apps/api/src/' },
      to: { path: '^apps/web/src/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'] },
  },
}
