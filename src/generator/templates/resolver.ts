import type { Model, ModelField } from '../dmmf/types';
import { Project, SourceFile } from 'ts-morph';
import { camelCase, isRelationField } from '../dmmf/transformer';

import type { DMMFDocument } from '../dmmf/document';
import type { GeneratorConfig } from '../../cli/options-parser';
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
  dmmf: DMMFDocument,
  config: GeneratorConfig,
  ops: ModelOperations,
): void {
  const modelName = model.name;
  const lowerModelName = camelCase(modelName);
  const pluralName = pluralize(lowerModelName);
  const prismaClientPath = config.prismaClientPath || '@prisma/client';
  const contextType = 'GraphQLContext<PrismaClient>';

  // Handle models that are already plural - use different method names to avoid duplicates
  const isAlreadyPlural = pluralName === lowerModelName;
  const findManyMethodName = isAlreadyPlural ? `findMany${modelName}` : pluralName;
  const findUniqueMethodName = isAlreadyPlural ? `findUnique${modelName}` : lowerModelName;

  // Get relation fields for this model
  const relationFields = model.fields.filter(isRelationField);
  // Only list relations need @ResolveField() for filtering arguments
  const listRelationFields = relationFields.filter(f => f.isList);

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

  // Check if we have list relation fields that need ResolveField
  const hasListRelations = listRelationFields.length > 0;

  // Add imports
  const nestjsImports = ['Resolver', 'Query', 'Args', 'Info', 'Int', 'Context'];
  if (hasMutations) {
    nestjsImports.push('Mutation');
  }
  if (hasListRelations) {
    nestjsImports.push('ResolveField', 'Parent');
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
    moduleSpecifier: prismaClientPath,
    namedImports: ['PrismaClient'],
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
    namedImports: [
      'transformInfoIntoPrismaArgs',
      'transformInfoIntoPrismaAggregateArgs',
      'PrismaSelect',
      'GraphQLContext',
    ],
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

  // Import related models and their input types for @ResolveField() methods (only list relations)
  const relatedModelTypes = new Set<string>();
  const relatedInputTypes = new Set<string>();

  for (const field of listRelationFields) {
    const relatedModelName = field.type;

    // Import related model type (skip self-references)
    if (relatedModelName !== modelName) {
      relatedModelTypes.add(relatedModelName);
    }

    // Import input types for relation arguments
    if (dmmf.inputTypes.has(`${relatedModelName}WhereInput`)) {
      relatedInputTypes.add(`${relatedModelName}WhereInput`);
    }
    if (dmmf.inputTypes.has(`${relatedModelName}OrderByWithRelationInput`)) {
      relatedInputTypes.add(`${relatedModelName}OrderByWithRelationInput`);
    }
  }

  // Add imports for related models
  for (const relatedModel of relatedModelTypes) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: `../${config.outputDirs?.models ?? 'models'}/${relatedModel}`,
      namedImports: [relatedModel],
    });
  }

  // Add imports for relation input types
  for (const inputType of relatedInputTypes) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${inputType}`,
      namedImports: [inputType],
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,

        `return ctx.prisma.${lowerModelName}.findMany({`,
        `  ...args,`,
        `  ...select,`,
        `} as any);`,
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,

        `return ctx.prisma.${lowerModelName}.findUnique({`,
        `  ...args,`,
        `  ...select,`,
        `} as any);`,
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,

        `return ctx.prisma.${lowerModelName}.findFirst({`,
        `  ...args,`,
        `  ...select,`,
        `} as any);`,
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,

        `return ctx.prisma.${lowerModelName}.create({`,
        `  ...args,`,
        `  ...select,`,
        `} as any);`,
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [`return ctx.prisma.${lowerModelName}.createMany(args);`],
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,

        `return ctx.prisma.${lowerModelName}.update({`,
        `  ...args,`,
        `  ...select,`,
        `} as any);`,
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [`return ctx.prisma.${lowerModelName}.updateMany(args);`],
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,

        `return ctx.prisma.${lowerModelName}.upsert({`,
        `  ...args,`,
        `  ...select,`,
        `} as any);`,
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [
        `const select = transformInfoIntoPrismaArgs(info);`,

        `return ctx.prisma.${lowerModelName}.delete({`,
        `  ...args,`,
        `  ...select,`,
        `} as any);`,
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [`return ctx.prisma.${lowerModelName}.deleteMany(args);`],
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [
        `const aggregateArgs = transformInfoIntoPrismaAggregateArgs(info);`,

        `return ctx.prisma.${lowerModelName}.aggregate({`,
        `  ...args,`,
        `  ...aggregateArgs,`,
        `} as any);`,
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [
        `const aggregateArgs = transformInfoIntoPrismaAggregateArgs(info);`,

        `return ctx.prisma.${lowerModelName}.groupBy({`,
        `  ...args,`,
        `  ...aggregateArgs,`,
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
        { name: 'ctx', type: contextType, decorators: [{ name: 'Context', arguments: [] }] },
        { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
      ],
      statements: [
        `return ctx.prisma.${lowerModelName}.count({`,
        `  where: args.where,`,
        `} as any);`,
      ],
    });
  }

  // Add @ResolveField() methods for list relation fields only
  // These define the GraphQL arguments (where, orderBy, take, skip) on relation fields
  // The actual data is loaded by the parent query using transformInfoIntoPrismaArgs
  // Singular relations are handled by the model's @Field() decorator
  for (const field of listRelationFields) {
    addRelationResolveField(resolverClass, model, field, dmmf, config);
  }
}

/**
 * Add a @ResolveField() method for a relation field
 */
function addRelationResolveField(
  resolverClass: ReturnType<SourceFile['addClass']>,
  parentModel: Model,
  field: ModelField,
  dmmf: DMMFDocument,
  _config: GeneratorConfig,
): void {
  const relatedModelName = field.type;
  const fieldName = field.name;

  // Determine return type
  const returnType = field.isList ? `[${relatedModelName}]` : relatedModelName;
  const nullable = !field.isRequired;

  // Build parameters for the method
  const parameters: Array<{
    name: string;
    type: string;
    decorators: Array<{ name: string; arguments: string[] }>;
  }> = [];

  // Add @Parent() parameter
  parameters.push({
    name: 'parent',
    type: parentModel.name,
    decorators: [{ name: 'Parent', arguments: [] }],
  });

  // Only add filtering arguments for list relations (where they're useful)
  if (field.isList) {
    // Check if input types exist and add corresponding args
    const hasWhereInput = dmmf.inputTypes.has(`${relatedModelName}WhereInput`);
    const hasOrderByInput = dmmf.inputTypes.has(`${relatedModelName}OrderByWithRelationInput`);

    if (hasWhereInput) {
      parameters.push({
        name: 'where',
        type: `${relatedModelName}WhereInput`,
        decorators: [
          {
            name: 'Args',
            arguments: [`'where'`, `{ type: () => ${relatedModelName}WhereInput, nullable: true }`],
          },
        ],
      });
    }

    if (hasOrderByInput) {
      parameters.push({
        name: 'orderBy',
        type: `${relatedModelName}OrderByWithRelationInput | ${relatedModelName}OrderByWithRelationInput[]`,
        decorators: [
          {
            name: 'Args',
            arguments: [
              `'orderBy'`,
              `{ type: () => ${relatedModelName}OrderByWithRelationInput, nullable: true }`,
            ],
          },
        ],
      });
    }

    // Add take and skip for list relations
    parameters.push({
      name: 'take',
      type: 'number',
      decorators: [{ name: 'Args', arguments: [`'take'`, `{ type: () => Int, nullable: true }`] }],
    });
    parameters.push({
      name: 'skip',
      type: 'number',
      decorators: [{ name: 'Args', arguments: [`'skip'`, `{ type: () => Int, nullable: true }`] }],
    });
  }

  // Build the method body
  // The relation is already loaded by the parent query via transformInfoIntoPrismaArgs
  // We just return the data from the parent object
  const statements: string[] = [
    `// Data is already loaded by parent query via transformInfoIntoPrismaArgs`,
    `// which extracts relation args (where, orderBy, take, skip) from the GraphQL query`,
    `return parent.${fieldName} as any;`,
  ];

  resolverClass.addMethod({
    name: fieldName,
    decorators: [
      {
        name: 'ResolveField',
        arguments: [`() => ${returnType}`, `{ nullable: ${nullable} }`],
      },
    ],
    parameters,
    statements,
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
