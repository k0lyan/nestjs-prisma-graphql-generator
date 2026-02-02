import { Project, SourceFile } from 'ts-morph';
import type { DMMFDocument } from '../dmmf/document';
import type { Model } from '../dmmf/types';
import type { GeneratorConfig } from '../../cli/options-parser';
import pluralize from 'pluralize';
import { camelCase } from '../dmmf/transformer';

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
    const fileName = `${model.name}Resolver.ts`;
    const filePath = `${config.outputDirs?.resolvers ?? 'resolvers'}/${fileName}`;
    
    const sourceFile = project.createSourceFile(filePath, '', { overwrite: true });
    generateResolverFile(sourceFile, model, dmmf, config);
    files.set(filePath, sourceFile);
  }

  // Generate index file
  if (dmmf.models.length > 0) {
    const indexPath = `${config.outputDirs?.resolvers ?? 'resolvers'}/index.ts`;
    const indexFile = project.createSourceFile(indexPath, '', { overwrite: true });
    generateResolverIndexFile(indexFile, dmmf.models);
    files.set(indexPath, indexFile);
  }

  return files;
}

/**
 * Generate a single resolver file with all CRUD operations
 */
function generateResolverFile(
  sourceFile: SourceFile,
  model: Model,
  _dmmf: DMMFDocument,
  config: GeneratorConfig,
): void {
  const modelName = model.name;
  const lowerModelName = camelCase(modelName);
  const pluralName = pluralize(lowerModelName);

  // Add imports
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['Resolver', 'Query', 'Mutation', 'Args', 'Info', 'Int'],
  });

  sourceFile.addImportDeclaration({
    moduleSpecifier: 'graphql',
    namedImports: ['GraphQLResolveInfo'],
  });

  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.models ?? 'models'}/${modelName}`,
    namedImports: [modelName],
  });

  // Import all args types
  const argsImports = [
    `FindMany${modelName}Args`,
    `FindUnique${modelName}Args`,
    `FindFirst${modelName}Args`,
    `Create${modelName}Args`,
    `CreateMany${modelName}Args`,
    `Update${modelName}Args`,
    `UpdateMany${modelName}Args`,
    `Upsert${modelName}Args`,
    `Delete${modelName}Args`,
    `DeleteMany${modelName}Args`,
    `Aggregate${modelName}Args`,
    `GroupBy${modelName}Args`,
  ];

  for (const argsImport of argsImports) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: `../${config.outputDirs?.args ?? 'args'}/${argsImport}`,
      namedImports: [argsImport],
    });
  }

  // Import runtime helpers
  sourceFile.addImportDeclaration({
    moduleSpecifier: '../helpers',
    namedImports: ['transformInfoIntoPrismaArgs', 'PrismaSelect', 'getPrismaFromContext'],
  });

  // Import AffectedRows type
  sourceFile.addImportDeclaration({
    moduleSpecifier: '../common/AffectedRows',
    namedImports: ['AffectedRows'],
  });

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

  // Add findMany query
  resolverClass.addMethod({
    name: pluralName,
    isAsync: true,
    decorators: [
      {
        name: 'Query',
        arguments: [`() => [${modelName}]`, `{ name: '${pluralName}' }`],
      },
    ],
    parameters: [
      { name: 'args', type: `FindMany${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<${modelName}[]>`,
    statements: [
      `const select = transformInfoIntoPrismaArgs(info);`,
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.findMany({`,
      `  ...args,`,
      `  ...select,`,
      `});`,
    ],
  });

  // Add findUnique query
  resolverClass.addMethod({
    name: lowerModelName,
    isAsync: true,
    decorators: [
      {
        name: 'Query',
        arguments: [`() => ${modelName}`, `{ name: '${lowerModelName}', nullable: true }`],
      },
    ],
    parameters: [
      { name: 'args', type: `FindUnique${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<${modelName} | null>`,
    statements: [
      `const select = transformInfoIntoPrismaArgs(info);`,
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.findUnique({`,
      `  ...args,`,
      `  ...select,`,
      `});`,
    ],
  });

  // Add findFirst query
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
      { name: 'args', type: `FindFirst${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<${modelName} | null>`,
    statements: [
      `const select = transformInfoIntoPrismaArgs(info);`,
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.findFirst({`,
      `  ...args,`,
      `  ...select,`,
      `});`,
    ],
  });

  // Add create mutation
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
      { name: 'args', type: `Create${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<${modelName}>`,
    statements: [
      `const select = transformInfoIntoPrismaArgs(info);`,
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.create({`,
      `  ...args,`,
      `  ...select,`,
      `});`,
    ],
  });

  // Add createMany mutation
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
      { name: 'args', type: `CreateMany${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<AffectedRows>`,
    statements: [
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.createMany(args);`,
    ],
  });

  // Add update mutation
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
      { name: 'args', type: `Update${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<${modelName} | null>`,
    statements: [
      `const select = transformInfoIntoPrismaArgs(info);`,
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.update({`,
      `  ...args,`,
      `  ...select,`,
      `});`,
    ],
  });

  // Add updateMany mutation
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
      { name: 'args', type: `UpdateMany${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<AffectedRows>`,
    statements: [
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.updateMany(args);`,
    ],
  });

  // Add upsert mutation
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
      { name: 'args', type: `Upsert${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<${modelName}>`,
    statements: [
      `const select = transformInfoIntoPrismaArgs(info);`,
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.upsert({`,
      `  ...args,`,
      `  ...select,`,
      `});`,
    ],
  });

  // Add delete mutation
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
      { name: 'args', type: `Delete${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<${modelName} | null>`,
    statements: [
      `const select = transformInfoIntoPrismaArgs(info);`,
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.delete({`,
      `  ...args,`,
      `  ...select,`,
      `});`,
    ],
  });

  // Add deleteMany mutation
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
      { name: 'args', type: `DeleteMany${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<AffectedRows>`,
    statements: [
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.deleteMany(args);`,
    ],
  });

  // Add aggregate query
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
      { name: 'args', type: `Aggregate${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<any>`,
    statements: [
      `const select = transformInfoIntoPrismaArgs(info);`,
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.aggregate({`,
      `  ...args,`,
      `  ...select,`,
      `});`,
    ],
  });

  // Add groupBy query
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
      { name: 'args', type: `GroupBy${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<any[]>`,
    statements: [
      `const select = transformInfoIntoPrismaArgs(info);`,
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.groupBy({`,
      `  ...args,`,
      `  ...select,`,
      `} as any);`,
    ],
  });

  // Add count query
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
      { name: 'args', type: `FindMany${modelName}Args`, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType: `Promise<number>`,
    statements: [
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${lowerModelName}.count({`,
      `  where: args.where,`,
      `});`,
    ],
  });
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
