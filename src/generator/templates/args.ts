import { Project, SourceFile } from 'ts-morph';

import type { DMMFDocument } from '../dmmf/document';
import type { GeneratorConfig } from '../../cli/options-parser';
import type { Model } from '../dmmf/types';

/**
 * Generate Args type files for CRUD operations
 */
export function generateArgs(
  project: Project,
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();

  for (const model of dmmf.models) {
    // Generate args for each CRUD operation
    const argsFiles = generateModelArgs(project, model, dmmf, config);
    for (const [path, sourceFile] of argsFiles) {
      files.set(path, sourceFile);
    }
  }

  // Generate index file
  if (dmmf.models.length > 0) {
    const indexPath = `${config.outputDirs?.args ?? 'args'}/index.ts`;
    const indexFile = project.createSourceFile(indexPath, '', { overwrite: true });
    generateArgsIndexFile(indexFile, dmmf.models, config);
    files.set(indexPath, indexFile);
  }

  return files;
}

/**
 * Generate args files for a single model
 */
function generateModelArgs(
  project: Project,
  model: Model,
  _dmmf: DMMFDocument,
  config: GeneratorConfig,
): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();
  const basePath = config.outputDirs?.args ?? 'args';

  // FindMany Args
  const findManyPath = `${basePath}/FindMany${model.name}Args.ts`;
  const findManyFile = project.createSourceFile(findManyPath, '', { overwrite: true });
  generateFindManyArgs(findManyFile, model, config);
  files.set(findManyPath, findManyFile);

  // FindUnique Args
  const findUniquePath = `${basePath}/FindUnique${model.name}Args.ts`;
  const findUniqueFile = project.createSourceFile(findUniquePath, '', { overwrite: true });
  generateFindUniqueArgs(findUniqueFile, model, config);
  files.set(findUniquePath, findUniqueFile);

  // FindFirst Args
  const findFirstPath = `${basePath}/FindFirst${model.name}Args.ts`;
  const findFirstFile = project.createSourceFile(findFirstPath, '', { overwrite: true });
  generateFindFirstArgs(findFirstFile, model, config);
  files.set(findFirstPath, findFirstFile);

  // Create Args
  const createPath = `${basePath}/Create${model.name}Args.ts`;
  const createFile = project.createSourceFile(createPath, '', { overwrite: true });
  generateCreateArgs(createFile, model, config);
  files.set(createPath, createFile);

  // CreateMany Args
  const createManyPath = `${basePath}/CreateMany${model.name}Args.ts`;
  const createManyFile = project.createSourceFile(createManyPath, '', { overwrite: true });
  generateCreateManyArgs(createManyFile, model, config);
  files.set(createManyPath, createManyFile);

  // Update Args
  const updatePath = `${basePath}/Update${model.name}Args.ts`;
  const updateFile = project.createSourceFile(updatePath, '', { overwrite: true });
  generateUpdateArgs(updateFile, model, config);
  files.set(updatePath, updateFile);

  // UpdateMany Args
  const updateManyPath = `${basePath}/UpdateMany${model.name}Args.ts`;
  const updateManyFile = project.createSourceFile(updateManyPath, '', { overwrite: true });
  generateUpdateManyArgs(updateManyFile, model, config);
  files.set(updateManyPath, updateManyFile);

  // Upsert Args
  const upsertPath = `${basePath}/Upsert${model.name}Args.ts`;
  const upsertFile = project.createSourceFile(upsertPath, '', { overwrite: true });
  generateUpsertArgs(upsertFile, model, config);
  files.set(upsertPath, upsertFile);

  // Delete Args
  const deletePath = `${basePath}/Delete${model.name}Args.ts`;
  const deleteFile = project.createSourceFile(deletePath, '', { overwrite: true });
  generateDeleteArgs(deleteFile, model, config);
  files.set(deletePath, deleteFile);

  // DeleteMany Args
  const deleteManyPath = `${basePath}/DeleteMany${model.name}Args.ts`;
  const deleteManyFile = project.createSourceFile(deleteManyPath, '', { overwrite: true });
  generateDeleteManyArgs(deleteManyFile, model, config);
  files.set(deleteManyPath, deleteManyFile);

  // Aggregate Args
  const aggregatePath = `${basePath}/Aggregate${model.name}Args.ts`;
  const aggregateFile = project.createSourceFile(aggregatePath, '', { overwrite: true });
  generateAggregateArgs(aggregateFile, model, config);
  files.set(aggregatePath, aggregateFile);

  // GroupBy Args
  const groupByPath = `${basePath}/GroupBy${model.name}Args.ts`;
  const groupByFile = project.createSourceFile(groupByPath, '', { overwrite: true });
  generateGroupByArgs(groupByFile, model, config);
  files.set(groupByPath, groupByFile);

  return files;
}

/**
 * Generate FindMany args
 */
function generateFindManyArgs(sourceFile: SourceFile, model: Model, config: GeneratorConfig): void {
  addCommonImports(sourceFile, model, config);

  sourceFile.addClass({
    name: `FindMany${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'where',
        type: `${model.name}WhereInput`,
        hasQuestionToken: true,
        decorators: [
          { name: 'Field', arguments: [`() => ${model.name}WhereInput`, '{ nullable: true }'] },
        ],
      },
      {
        name: 'orderBy',
        type: `${model.name}OrderByWithRelationInput[]`,
        hasQuestionToken: true,
        decorators: [
          {
            name: 'Field',
            arguments: [`() => [${model.name}OrderByWithRelationInput]`, '{ nullable: true }'],
          },
        ],
      },
      {
        name: 'cursor',
        type: `${model.name}WhereUniqueInput`,
        hasQuestionToken: true,
        decorators: [
          {
            name: 'Field',
            arguments: [`() => ${model.name}WhereUniqueInput`, '{ nullable: true }'],
          },
        ],
      },
      {
        name: 'take',
        type: 'number',
        hasQuestionToken: true,
        decorators: [{ name: 'Field', arguments: ['() => Int', '{ nullable: true }'] }],
      },
      {
        name: 'skip',
        type: 'number',
        hasQuestionToken: true,
        decorators: [{ name: 'Field', arguments: ['() => Int', '{ nullable: true }'] }],
      },
      {
        name: 'distinct',
        type: `${model.name}ScalarFieldEnum[]`,
        hasQuestionToken: true,
        decorators: [
          {
            name: 'Field',
            arguments: [`() => [${model.name}ScalarFieldEnum]`, '{ nullable: true }'],
          },
        ],
      },
    ],
  });
}

/**
 * Generate FindUnique args
 */
function generateFindUniqueArgs(
  sourceFile: SourceFile,
  model: Model,
  config: GeneratorConfig,
): void {
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ArgsType', 'Field'],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}WhereUniqueInput`,
    namedImports: [`${model.name}WhereUniqueInput`],
  });

  sourceFile.addClass({
    name: `FindUnique${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'where',
        type: `${model.name}WhereUniqueInput`,
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: [`() => ${model.name}WhereUniqueInput`] }],
      },
    ],
  });
}

/**
 * Generate FindFirst args
 */
function generateFindFirstArgs(
  sourceFile: SourceFile,
  model: Model,
  config: GeneratorConfig,
): void {
  addCommonImports(sourceFile, model, config);

  sourceFile.addClass({
    name: `FindFirst${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'where',
        type: `${model.name}WhereInput`,
        hasQuestionToken: true,
        decorators: [
          { name: 'Field', arguments: [`() => ${model.name}WhereInput`, '{ nullable: true }'] },
        ],
      },
      {
        name: 'orderBy',
        type: `${model.name}OrderByWithRelationInput[]`,
        hasQuestionToken: true,
        decorators: [
          {
            name: 'Field',
            arguments: [`() => [${model.name}OrderByWithRelationInput]`, '{ nullable: true }'],
          },
        ],
      },
      {
        name: 'cursor',
        type: `${model.name}WhereUniqueInput`,
        hasQuestionToken: true,
        decorators: [
          {
            name: 'Field',
            arguments: [`() => ${model.name}WhereUniqueInput`, '{ nullable: true }'],
          },
        ],
      },
      {
        name: 'take',
        type: 'number',
        hasQuestionToken: true,
        decorators: [{ name: 'Field', arguments: ['() => Int', '{ nullable: true }'] }],
      },
      {
        name: 'skip',
        type: 'number',
        hasQuestionToken: true,
        decorators: [{ name: 'Field', arguments: ['() => Int', '{ nullable: true }'] }],
      },
      {
        name: 'distinct',
        type: `${model.name}ScalarFieldEnum[]`,
        hasQuestionToken: true,
        decorators: [
          {
            name: 'Field',
            arguments: [`() => [${model.name}ScalarFieldEnum]`, '{ nullable: true }'],
          },
        ],
      },
    ],
  });
}

/**
 * Generate Create args
 */
function generateCreateArgs(sourceFile: SourceFile, model: Model, config: GeneratorConfig): void {
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ArgsType', 'Field'],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}CreateInput`,
    namedImports: [`${model.name}CreateInput`],
  });

  sourceFile.addClass({
    name: `Create${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'data',
        type: `${model.name}CreateInput`,
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: [`() => ${model.name}CreateInput`] }],
      },
    ],
  });
}

/**
 * Generate CreateMany args
 */
function generateCreateManyArgs(
  sourceFile: SourceFile,
  model: Model,
  config: GeneratorConfig,
): void {
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ArgsType', 'Field'],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}CreateManyInput`,
    namedImports: [`${model.name}CreateManyInput`],
  });

  sourceFile.addClass({
    name: `CreateMany${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'data',
        type: `${model.name}CreateManyInput[]`,
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: [`() => [${model.name}CreateManyInput]`] }],
      },
      {
        name: 'skipDuplicates',
        type: 'boolean',
        hasQuestionToken: true,
        decorators: [{ name: 'Field', arguments: ['() => Boolean', '{ nullable: true }'] }],
      },
    ],
  });
}

/**
 * Generate Update args
 */
function generateUpdateArgs(sourceFile: SourceFile, model: Model, config: GeneratorConfig): void {
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ArgsType', 'Field'],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}UpdateInput`,
    namedImports: [`${model.name}UpdateInput`],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}WhereUniqueInput`,
    namedImports: [`${model.name}WhereUniqueInput`],
  });

  sourceFile.addClass({
    name: `Update${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'data',
        type: `${model.name}UpdateInput`,
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: [`() => ${model.name}UpdateInput`] }],
      },
      {
        name: 'where',
        type: `${model.name}WhereUniqueInput`,
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: [`() => ${model.name}WhereUniqueInput`] }],
      },
    ],
  });
}

/**
 * Generate UpdateMany args
 */
function generateUpdateManyArgs(
  sourceFile: SourceFile,
  model: Model,
  config: GeneratorConfig,
): void {
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ArgsType', 'Field'],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}UpdateManyMutationInput`,
    namedImports: [`${model.name}UpdateManyMutationInput`],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}WhereInput`,
    namedImports: [`${model.name}WhereInput`],
  });

  sourceFile.addClass({
    name: `UpdateMany${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'data',
        type: `${model.name}UpdateManyMutationInput`,
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: [`() => ${model.name}UpdateManyMutationInput`] }],
      },
      {
        name: 'where',
        type: `${model.name}WhereInput`,
        hasQuestionToken: true,
        decorators: [
          { name: 'Field', arguments: [`() => ${model.name}WhereInput`, '{ nullable: true }'] },
        ],
      },
    ],
  });
}

/**
 * Generate Upsert args
 */
function generateUpsertArgs(sourceFile: SourceFile, model: Model, config: GeneratorConfig): void {
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ArgsType', 'Field'],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}WhereUniqueInput`,
    namedImports: [`${model.name}WhereUniqueInput`],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}CreateInput`,
    namedImports: [`${model.name}CreateInput`],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}UpdateInput`,
    namedImports: [`${model.name}UpdateInput`],
  });

  sourceFile.addClass({
    name: `Upsert${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'where',
        type: `${model.name}WhereUniqueInput`,
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: [`() => ${model.name}WhereUniqueInput`] }],
      },
      {
        name: 'create',
        type: `${model.name}CreateInput`,
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: [`() => ${model.name}CreateInput`] }],
      },
      {
        name: 'update',
        type: `${model.name}UpdateInput`,
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: [`() => ${model.name}UpdateInput`] }],
      },
    ],
  });
}

/**
 * Generate Delete args
 */
function generateDeleteArgs(sourceFile: SourceFile, model: Model, config: GeneratorConfig): void {
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ArgsType', 'Field'],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}WhereUniqueInput`,
    namedImports: [`${model.name}WhereUniqueInput`],
  });

  sourceFile.addClass({
    name: `Delete${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'where',
        type: `${model.name}WhereUniqueInput`,
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: [`() => ${model.name}WhereUniqueInput`] }],
      },
    ],
  });
}

/**
 * Generate DeleteMany args
 */
function generateDeleteManyArgs(
  sourceFile: SourceFile,
  model: Model,
  config: GeneratorConfig,
): void {
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ArgsType', 'Field'],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}WhereInput`,
    namedImports: [`${model.name}WhereInput`],
  });

  sourceFile.addClass({
    name: `DeleteMany${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'where',
        type: `${model.name}WhereInput`,
        hasQuestionToken: true,
        decorators: [
          { name: 'Field', arguments: [`() => ${model.name}WhereInput`, '{ nullable: true }'] },
        ],
      },
    ],
  });
}

/**
 * Generate Aggregate args
 */
function generateAggregateArgs(
  sourceFile: SourceFile,
  model: Model,
  config: GeneratorConfig,
): void {
  addCommonImports(sourceFile, model, config);

  sourceFile.addClass({
    name: `Aggregate${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'where',
        type: `${model.name}WhereInput`,
        hasQuestionToken: true,
        decorators: [
          { name: 'Field', arguments: [`() => ${model.name}WhereInput`, '{ nullable: true }'] },
        ],
      },
      {
        name: 'orderBy',
        type: `${model.name}OrderByWithRelationInput[]`,
        hasQuestionToken: true,
        decorators: [
          {
            name: 'Field',
            arguments: [`() => [${model.name}OrderByWithRelationInput]`, '{ nullable: true }'],
          },
        ],
      },
      {
        name: 'cursor',
        type: `${model.name}WhereUniqueInput`,
        hasQuestionToken: true,
        decorators: [
          {
            name: 'Field',
            arguments: [`() => ${model.name}WhereUniqueInput`, '{ nullable: true }'],
          },
        ],
      },
      {
        name: 'take',
        type: 'number',
        hasQuestionToken: true,
        decorators: [{ name: 'Field', arguments: ['() => Int', '{ nullable: true }'] }],
      },
      {
        name: 'skip',
        type: 'number',
        hasQuestionToken: true,
        decorators: [{ name: 'Field', arguments: ['() => Int', '{ nullable: true }'] }],
      },
    ],
  });
}

/**
 * Generate GroupBy args
 */
function generateGroupByArgs(sourceFile: SourceFile, model: Model, config: GeneratorConfig): void {
  addCommonImports(sourceFile, model, config);

  sourceFile.addClass({
    name: `GroupBy${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties: [
      {
        name: 'where',
        type: `${model.name}WhereInput`,
        hasQuestionToken: true,
        decorators: [
          { name: 'Field', arguments: [`() => ${model.name}WhereInput`, '{ nullable: true }'] },
        ],
      },
      {
        name: 'orderBy',
        type: `${model.name}OrderByWithRelationInput[]`,
        hasQuestionToken: true,
        decorators: [
          {
            name: 'Field',
            arguments: [`() => [${model.name}OrderByWithRelationInput]`, '{ nullable: true }'],
          },
        ],
      },
      {
        name: 'by',
        type: `${model.name}ScalarFieldEnum[]`,
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: [`() => [${model.name}ScalarFieldEnum]`] }],
      },
      {
        name: 'having',
        type: `${model.name}ScalarWhereWithAggregatesInput`,
        hasQuestionToken: true,
        decorators: [
          {
            name: 'Field',
            arguments: [`() => ${model.name}ScalarWhereWithAggregatesInput`, '{ nullable: true }'],
          },
        ],
      },
      {
        name: 'take',
        type: 'number',
        hasQuestionToken: true,
        decorators: [{ name: 'Field', arguments: ['() => Int', '{ nullable: true }'] }],
      },
      {
        name: 'skip',
        type: 'number',
        hasQuestionToken: true,
        decorators: [{ name: 'Field', arguments: ['() => Int', '{ nullable: true }'] }],
      },
    ],
  });
}

/**
 * Add common imports for args files
 */
function addCommonImports(sourceFile: SourceFile, model: Model, config: GeneratorConfig): void {
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ArgsType', 'Field', 'Int'],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}WhereInput`,
    namedImports: [`${model.name}WhereInput`],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}WhereUniqueInput`,
    namedImports: [`${model.name}WhereUniqueInput`],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}OrderByWithRelationInput`,
    namedImports: [`${model.name}OrderByWithRelationInput`],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.enums ?? 'enums'}/${model.name}ScalarFieldEnum`,
    namedImports: [`${model.name}ScalarFieldEnum`],
  });
}

/**
 * Generate args index file
 */
function generateArgsIndexFile(
  sourceFile: SourceFile,
  models: Model[],
  _config: GeneratorConfig,
): void {
  const operations = [
    'FindMany',
    'FindUnique',
    'FindFirst',
    'Create',
    'CreateMany',
    'Update',
    'UpdateMany',
    'Upsert',
    'Delete',
    'DeleteMany',
    'Aggregate',
    'GroupBy',
  ];

  for (const model of models) {
    for (const op of operations) {
      sourceFile.addExportDeclaration({
        moduleSpecifier: `./${op}${model.name}Args`,
      });
    }
  }
}
