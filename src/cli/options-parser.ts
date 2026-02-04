export interface GeneratorConfig {
  /**
   * Whether to emit only specific blocks (models, resolvers, etc.)
   * Default: emit all
   */
  emitOnly?: EmitBlock[];

  /**
   * Custom output subdirectories (only used when groupByModel is false)
   */
  outputDirs?: {
    models?: string;
    inputs?: string;
    args?: string;
    enums?: string;
    resolvers?: string;
  };

  /**
   * Group generated files by model (model/inputs.ts, model/args.ts, etc.)
   * Default: false
   */
  groupByModel?: boolean;

  /**
   * Whether to generate CRUD resolvers
   * Default: true
   */
  generateResolvers?: boolean;

  /**
   * Whether to use input validation decorators (class-validator)
   * Default: false
   */
  useValidation?: boolean;

  /**
   * Custom Prisma client import path
   * Default: @prisma/client
   */
  prismaClientPath?: string;

  /**
   * Whether to emit compiled JS alongside .d.ts
   * Default: false (emit only .ts source)
   */
  emitCompiled?: boolean;

  /**
   * Prefix for generated type names
   */
  typePrefix?: string;

  /**
   * Suffix for generated type names
   */
  typeSuffix?: string;

  /**
   * Use require() instead of ES imports for relation types in models.
   * This helps avoid circular dependency issues in larger projects.
   * Default: true (use require for better circular dep handling)
   */
  useRequireForRelations?: boolean;
}

export type EmitBlock = 'models' | 'inputs' | 'args' | 'enums' | 'resolvers' | 'helpers';

const DEFAULT_CONFIG: GeneratorConfig = {
  emitOnly: undefined,
  outputDirs: {
    models: 'models',
    inputs: 'inputs',
    args: 'args',
    enums: 'enums',
    resolvers: 'resolvers',
  },
  groupByModel: false,
  generateResolvers: true,
  useValidation: false,
  prismaClientPath: '@prisma/client',
  emitCompiled: false,
  typePrefix: '',
  typeSuffix: '',
  useRequireForRelations: true,
};

export function parseGeneratorConfig(config: Record<string, string>): GeneratorConfig {
  const result: GeneratorConfig = { ...DEFAULT_CONFIG };

  if (config['emitOnly']) {
    result.emitOnly = config['emitOnly'].split(',').map(s => s.trim() as EmitBlock);
  }

  if (config['generateResolvers']) {
    result.generateResolvers = config['generateResolvers'] === 'true';
  }

  if (config['groupByModel']) {
    result.groupByModel = config['groupByModel'] === 'true';
  }

  if (config['useValidation']) {
    result.useValidation = config['useValidation'] === 'true';
  }

  if (config['prismaClientPath']) {
    result.prismaClientPath = config['prismaClientPath'];
  }

  if (config['emitCompiled']) {
    result.emitCompiled = config['emitCompiled'] === 'true';
  }

  if (config['typePrefix']) {
    result.typePrefix = config['typePrefix'];
  }

  if (config['typeSuffix']) {
    result.typeSuffix = config['typeSuffix'];
  }

  if (config['useRequireForRelations']) {
    result.useRequireForRelations = config['useRequireForRelations'] === 'true';
  }

  // Parse custom output dirs
  if (config['modelsOutput']) {
    result.outputDirs = { ...result.outputDirs, models: config['modelsOutput'] };
  }
  if (config['inputsOutput']) {
    result.outputDirs = { ...result.outputDirs, inputs: config['inputsOutput'] };
  }
  if (config['argsOutput']) {
    result.outputDirs = { ...result.outputDirs, args: config['argsOutput'] };
  }
  if (config['enumsOutput']) {
    result.outputDirs = { ...result.outputDirs, enums: config['enumsOutput'] };
  }
  if (config['resolversOutput']) {
    result.outputDirs = { ...result.outputDirs, resolvers: config['resolversOutput'] };
  }

  return result;
}
