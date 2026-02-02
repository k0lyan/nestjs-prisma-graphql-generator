import { Project, SourceFile } from 'ts-morph';

import type { DMMFDocument } from '../dmmf/document';
import type { GeneratorConfig } from '../../cli/options-parser';
import type { Model } from '../dmmf/types';
import { camelCase } from '../dmmf/transformer';
import pluralize from 'pluralize';

/**
 * Available operations for a model based on input types
 */
interface ModelOperations {
  hasWhereInput: boolean;
  hasWhereUniqueInput: boolean;
  hasCreateInput: boolean;
  hasCreateManyInput: boolean;
  hasUpdateInput: boolean;
}

/**
 * Generate resolver files for all models
 */
export function generateResolvers(
  project: Project,
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();

  if (!config.generateResolvers) {
    return files;
  }

  for (const model of dmmf.models) {
    // Determine available operations based on input types
    const ops = getModelOperations(dmmf, model.name);

    // Skip models with no available operations (e.g., views with nothing)
    if (!ops.hasWhereInput && !ops.hasWhereUniqueInput) {
      continue;
    }

    const fileName = `${model.name}Resolver.ts`;
    const filePath = `${config.outputDirs?.resolvers ?? 'resolvers'}/${fileName}`;

    const sourceFile = project.createSourceFile(filePath, '', { overwrite: true });
    generateResolverFile(sourceFile, model, dmmf, config, ops);
    files.set(filePath, sourceFile);
  }

  // Generate index file only for generated resolvers
  const generatedModels = dmmf.models.filter(m => {
    const ops = getModelOperations(dmmf, m.name);
    return ops.hasWhereInput || ops.hasWhereUniqueInput;
  });

  if (generatedModels.length > 0) {
    const indexPath = `${config.outputDirs?.resolvers ?? 'resolvers'}/index.ts`;
    const indexFile = project.createSourceFile(indexPath, '', { overwrite: true });
    generateResolverIndexFile(indexFile, generatedModels);
    files.set(indexPath, indexFile);
  }

  return files;
}

/**
 * Get available operations for a model based on input types
 */
function getModelOperations(dmmf: DMMFDocument, modelName: string): ModelOperations {
  return {
    hasWhereInput: dmmf.inputTypes.has(`${modelName}WhereInput`),
    hasWhereUniqueInput: dmmf.inputTypes.has(`${modelName}WhereUniqueInput`),
    hasCreateInput: dmmf.inputTypes.has(`${modelName}CreateInput`),
    hasCreateManyInput: dmmf.inputTypes.has(`${modelName}CreateManyInput`),
    hasUpdateInput: dmmf.inputTypes.has(`${modelName}UpdateInput`),
  };
}

/**
 * Generate a single resolver file with CRUD operations based on available inputs
 */
function generateResolverFile(
  sourceFile: SourceFile,
  model: Model,
  _dmmf: DMMFDocument,
  config: GeneratorConfig,
  ops: ModelOperations,
): void {
  const modelName = model.name;
  const lowerModelName = camelCase(modelName);
  const pluralName = pluralize(lowerModelName);

  // Handle models that are already plural - use different method names to avoid duplicates
  const isAlreadyPlural = pluralName === lowerModelName;
  const findManyMethodName = isAlreadyPlural ? `findMany${modelName}` : pluralName;
  const findUniqueMethodName = isAlreadyPlural ? `findUnique${modelName}` : lowerModelName;

  // Determine which args to import based on available operations
  const argsImports: string[] = [];

  if (ops.hasWhereInput) {
    argsImports.push(`FindMany${modelName}Args`);
    argsImports.push(`FindFirst${modelName}Args`);
    argsImports.push(`DeleteMany${modelName}Args`);
    argsImports.push(`Aggregate${modelName}Args`);
    argsImports.push(`GroupBy${modelName}Args`);
  }

  if (ops.hasWhereUniqueInput) {
    argsImports.push(`FindUnique${modelName}Args`);
    argsImports.push(`Delete${modelName}Args`);
  }

  if (ops.hasCreateInput) {
    argsImports.push(`Create${modelName}Args`);
  }

  if (ops.hasCreateManyInput) {
    argsImports.push(`CreateMany${modelName}Args`);
  }

  if (ops.hasUpdateInput && ops.hasWhereUniqueInput) {
    argsImports.push(`Update${modelName}Args`);
  }

  if (ops.hasUpdateInput && ops.hasWhereInput) {
    argsImports.push(`UpdateMany${modelName}Args`);
  }

  if (ops.hasCreateInput && ops.hasUpdateInput && ops.hasWhereUniqueInput) {
    argsImports.push(`Upsert${modelName}Args`);
  }

  // Check if we have any mutations
  const hasMutations =
    ops.hasCreateInput ||
    ops.hasCreateManyInput ||
    (ops.hasUpdateInput && ops.hasWhereUniqueInput) ||
    (ops.hasUpdateInput && ops.hasWhereInput) ||
    ops.hasWhereUniqueInput; // delete needs unique

  // Add imports
  const nestjsImports = ['Resolver', 'Query', 'Args', 'Info', 'Int', 'Context'];
  if (hasMutations) {
    nestjsImports.push('Mutation');
  }

  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: nestjsImports,
  });

  sourceFile.addImportDeclaration({
    moduleSpecifier: 'graphql',
    namedImports: ['GraphQLResolveInfo'],
  });

  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.models ?? 'models'}/${modelName}`,
    namedImports: [modelName],
  });

  // Import only the args that exist
  for (const argsImport of argsImports) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: `../${config.outputDirs?.args ?? 'args'}/${argsImport}`,
      namedImports: [argsImport],
    });
  }

  // Import runtime helpers
  sourceFile.addImportDeclaration({
    moduleSpecifier: '../helpers',
    namedImports: ['transformInfoIntoPrismaArgs', 'PrismaSelect', 'GraphQLContext'],
  });

  // Import AffectedRows type only if needed
  if (
    ops.hasCreateManyInput ||
    (ops.hasUpdateInput && ops.hasWhereInput) ||
    ops.hasWhereInput // deleteMany
  ) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: '../common/AffectedRows',
      namedImports: ['AffectedRows'],
    });
  }

  // Create the resolver class
  const resolverClass = sourceFile.addClass({
    name: `${modelName}Resolver`,
    isExported: true,
    decorators: [
      {
        name: 'Resolver',
        arguments: [`() => ${modelName}`],
      },
    ],
  });

  // Add findMany query (if WhereInput exists)
  if (ops.hasWhereInput) {
    resolverClass.addMethod({
      name: findManyMethodName,
      isAsync: true,
      decorators: [
        {
          name: 'Query',
          arguments: [`() => [${modelName}]`, `{ name: '${findManyMethodName}' }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `FindMany${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<${modelName}[]>`,
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,
        
        `return ctx.prisma.${lowerModelName}.findMany({`,
        `  ...args,`,
        `  ...select,`,
        `});`,
      ],
    });
  }

  // Add findUnique query (if WhereUniqueInput exists)
  if (ops.hasWhereUniqueInput) {
    resolverClass.addMethod({
      name: findUniqueMethodName,
      isAsync: true,
      decorators: [
        {
          name: 'Query',
          arguments: [`() => ${modelName}`, `{ name: '${findUniqueMethodName}', nullable: true }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `FindUnique${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<${modelName} | null>`,
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,
        
        `return ctx.prisma.${lowerModelName}.findUnique({`,
        `  ...args,`,
        `  ...select,`,
        `});`,
      ],
    });
  }

  // Add findFirst query (if WhereInput exists)
  if (ops.hasWhereInput) {
    resolverClass.addMethod({
      name: `findFirst${modelName}`,
      isAsync: true,
      decorators: [
        {
          name: 'Query',
          arguments: [`() => ${modelName}`, `{ name: 'findFirst${modelName}', nullable: true }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `FindFirst${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<${modelName} | null>`,
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,
        
        `return ctx.prisma.${lowerModelName}.findFirst({`,
        `  ...args,`,
        `  ...select,`,
        `});`,
      ],
    });
  }

  // Add create mutation (if CreateInput exists)
  if (ops.hasCreateInput) {
    resolverClass.addMethod({
      name: `createOne${modelName}`,
      isAsync: true,
      decorators: [
        {
          name: 'Mutation',
          arguments: [`() => ${modelName}`, `{ name: 'createOne${modelName}' }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `Create${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<${modelName}>`,
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,
        
        `return ctx.prisma.${lowerModelName}.create({`,
        `  ...args,`,
        `  ...select,`,
        `});`,
      ],
    });
  }

  // Add createMany mutation (if CreateManyInput exists)
  if (ops.hasCreateManyInput) {
    resolverClass.addMethod({
      name: `createMany${modelName}`,
      isAsync: true,
      decorators: [
        {
          name: 'Mutation',
          arguments: [`() => AffectedRows`, `{ name: 'createMany${modelName}' }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `CreateMany${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<AffectedRows>`,
      statements: [
        
        `return ctx.prisma.${lowerModelName}.createMany(args);`,
      ],
    });
  }

  // Add update mutation (if UpdateInput and WhereUniqueInput exist)
  if (ops.hasUpdateInput && ops.hasWhereUniqueInput) {
    resolverClass.addMethod({
      name: `updateOne${modelName}`,
      isAsync: true,
      decorators: [
        {
          name: 'Mutation',
          arguments: [`() => ${modelName}`, `{ name: 'updateOne${modelName}', nullable: true }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `Update${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<${modelName} | null>`,
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,
        
        `return ctx.prisma.${lowerModelName}.update({`,
        `  ...args,`,
        `  ...select,`,
        `});`,
      ],
    });
  }

  // Add updateMany mutation (if UpdateInput and WhereInput exist)
  if (ops.hasUpdateInput && ops.hasWhereInput) {
    resolverClass.addMethod({
      name: `updateMany${modelName}`,
      isAsync: true,
      decorators: [
        {
          name: 'Mutation',
          arguments: [`() => AffectedRows`, `{ name: 'updateMany${modelName}' }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `UpdateMany${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<AffectedRows>`,
      statements: [
        
        `return ctx.prisma.${lowerModelName}.updateMany(args);`,
      ],
    });
  }

  // Add upsert mutation (if CreateInput, UpdateInput, and WhereUniqueInput exist)
  if (ops.hasCreateInput && ops.hasUpdateInput && ops.hasWhereUniqueInput) {
    resolverClass.addMethod({
      name: `upsertOne${modelName}`,
      isAsync: true,
      decorators: [
        {
          name: 'Mutation',
          arguments: [`() => ${modelName}`, `{ name: 'upsertOne${modelName}' }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `Upsert${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<${modelName}>`,
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,
        
        `return ctx.prisma.${lowerModelName}.upsert({`,
        `  ...args,`,
        `  ...select,`,
        `});`,
      ],
    });
  }

  // Add delete mutation (if WhereUniqueInput exists)
  if (ops.hasWhereUniqueInput) {
    resolverClass.addMethod({
      name: `deleteOne${modelName}`,
      isAsync: true,
      decorators: [
        {
          name: 'Mutation',
          arguments: [`() => ${modelName}`, `{ name: 'deleteOne${modelName}', nullable: true }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `Delete${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<${modelName} | null>`,
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,
        
        `return ctx.prisma.${lowerModelName}.delete({`,
        `  ...args,`,
        `  ...select,`,
        `});`,
      ],
    });
  }

  // Add deleteMany mutation (if WhereInput exists)
  if (ops.hasWhereInput) {
    resolverClass.addMethod({
      name: `deleteMany${modelName}`,
      isAsync: true,
      decorators: [
        {
          name: 'Mutation',
          arguments: [`() => AffectedRows`, `{ name: 'deleteMany${modelName}' }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `DeleteMany${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<AffectedRows>`,
      statements: [
        
        `return ctx.prisma.${lowerModelName}.deleteMany(args);`,
      ],
    });
  }

  // Add aggregate query (if WhereInput exists)
  if (ops.hasWhereInput) {
    resolverClass.addMethod({
      name: `aggregate${modelName}`,
      isAsync: true,
      decorators: [
        {
          name: 'Query',
          arguments: [`() => ${modelName}`, `{ name: 'aggregate${modelName}' }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `Aggregate${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<any>`,
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,
        
        `return ctx.prisma.${lowerModelName}.aggregate({`,
        `  ...args,`,
        `  ...select,`,
        `});`,
      ],
    });
  }

  // Add groupBy query (if WhereInput exists)
  if (ops.hasWhereInput) {
    resolverClass.addMethod({
      name: `groupBy${modelName}`,
      isAsync: true,
      decorators: [
        {
          name: 'Query',
          arguments: [`() => [${modelName}]`, `{ name: 'groupBy${modelName}' }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `GroupBy${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<any[]>`,
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,
        
        `return ctx.prisma.${lowerModelName}.groupBy({`,
        `  ...args,`,
        `  ...select,`,
        `} as any);`,
      ],
    });
  }

  // Add count query (if WhereInput exists)
  if (ops.hasWhereInput) {
    resolverClass.addMethod({
      name: `${lowerModelName}Count`,
      isAsync: true,
      decorators: [
        {
          name: 'Query',
          arguments: [`() => Int`, `{ name: '${lowerModelName}Count' }`],
        },
      ],
      parameters: [
        {
          name: 'args',
          type: `FindMany${modelName}Args`,
          decorators: [{ name: 'Args', arguments: [] }],
        },
        { name: 'ctx', type: 'GraphQLContext', decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      returnType: `Promise<number>`,
      statements: [
        
        `return ctx.prisma.${lowerModelName}.count({`,
        `  where: args.where,`,
        `});`,
      ],
    });
  }
}

/**
 * Generate resolver index file
 */
function generateResolverIndexFile(sourceFile: SourceFile, models: Model[]): void {
  for (const model of models) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: `./${model.name}Resolver`,
    });
  }
}
