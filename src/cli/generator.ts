#!/usr/bin/env node
import { generatorHandler } from '@prisma/generator-helper';
import { generate } from './prisma-generator';
import { parseGeneratorConfig } from './options-parser';

generatorHandler({
  onManifest: () => ({
    defaultOutput: 'node_modules/@generated/nestjs-graphql',
    prettyName: 'NestJS GraphQL Generator',
    requiresGenerators: ['prisma-client-js'],
  }),
  onGenerate: async options => {
    const rawConfig: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.generator.config)) {
      if (typeof value === 'string') {
        rawConfig[key] = value;
      }
    }
    const config = parseGeneratorConfig(rawConfig);
    await generate(options, config);
  },
});
