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
  const generatedArgsNames: string[] = [];

  for (const model of dmmf.models) {
    // Generate args for each CRUD operation
    const { files: argsFiles, argsNames } = generateModelArgs(project, model, dmmf, config);
    for (const [path, sourceFile] of argsFiles) {
      files.set(path, sourceFile);
    }
    generatedArgsNames.push(...argsNames);
  }

  // Generate index file
  if (generatedArgsNames.length > 0) {
    const indexPath = `${config.outputDirs?.args ?? 'args'}/index.ts`;
    const indexFile = project.createSourceFile(indexPath, '', { overwrite: true });
    generateArgsIndexFile(indexFile, generatedArgsNames);
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
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): { files: Map<string, SourceFile>; argsNames: string[] } {
  const files = new Map<string, SourceFile>();
  const argsNames: string[] = [];
  const basePath = config.outputDirs?.args ?? 'args';

  // Check which input types exist for this model
  const hasCreateInput = dmmf.inputTypes.has(`${model.name}CreateInput`);
  const hasCreateManyInput = dmmf.inputTypes.has(`${model.name}CreateManyInput`);
  const hasUpdateInput = dmmf.inputTypes.has(`${model.name}UpdateInput`);
  const hasWhereUniqueInput = dmmf.inputTypes.has(`${model.name}WhereUniqueInput`);
  const hasWhereInput = dmmf.inputTypes.has(`${model.name}WhereInput`);

  // FindMany Args (always generated if WhereInput exists)
  if (hasWhereInput) {
    const argsName = `FindMany${model.name}Args`;
    const findManyPath = `${basePath}/${argsName}.ts`;
    const findManyFile = project.createSourceFile(findManyPath, '', { overwrite: true });
    generateFindManyArgs(findManyFile, model, config);
    files.set(findManyPath, findManyFile);
    argsNames.push(argsName);
  }

  // FindUnique Args (needs WhereUniqueInput)
  if (hasWhereUniqueInput) {
    const argsName = `FindUnique${model.name}Args`;
    const findUniquePath = `${basePath}/${argsName}.ts`;
    const findUniqueFile = project.createSourceFile(findUniquePath, '', { overwrite: true });
    generateFindUniqueArgs(findUniqueFile, model, config);
    files.set(findUniquePath, findUniqueFile);
    argsNames.push(argsName);
  }

  // FindFirst Args (needs WhereInput)
  if (hasWhereInput) {
    const argsName = `FindFirst${model.name}Args`;
    const findFirstPath = `${basePath}/${argsName}.ts`;
    const findFirstFile = project.createSourceFile(findFirstPath, '', { overwrite: true });
    generateFindFirstArgs(findFirstFile, model, config);
    files.set(findFirstPath, findFirstFile);
    argsNames.push(argsName);
  }

  // Create Args (needs CreateInput)
  if (hasCreateInput) {
    const argsName = `Create${model.name}Args`;
    const createPath = `${basePath}/${argsName}.ts`;
    const createFile = project.createSourceFile(createPath, '', { overwrite: true });
    generateCreateArgs(createFile, model, config);
    files.set(createPath, createFile);
    argsNames.push(argsName);
  }

  // CreateMany Args (needs CreateManyInput)
  if (hasCreateManyInput) {
    const argsName = `CreateMany${model.name}Args`;
    const createManyPath = `${basePath}/${argsName}.ts`;
    const createManyFile = project.createSourceFile(createManyPath, '', { overwrite: true });
    generateCreateManyArgs(createManyFile, model, config);
    files.set(createManyPath, createManyFile);
    argsNames.push(argsName);
  }

  // Update Args (needs UpdateInput and WhereUniqueInput)
  if (hasUpdateInput && hasWhereUniqueInput) {
    const argsName = `Update${model.name}Args`;
    const updatePath = `${basePath}/${argsName}.ts`;
    const updateFile = project.createSourceFile(updatePath, '', { overwrite: true });
    generateUpdateArgs(updateFile, model, config);
    files.set(updatePath, updateFile);
    argsNames.push(argsName);
  }

  // UpdateMany Args (needs UpdateInput and WhereInput)
  if (hasUpdateInput && hasWhereInput) {
    const argsName = `UpdateMany${model.name}Args`;
    const updateManyPath = `${basePath}/${argsName}.ts`;
    const updateManyFile = project.createSourceFile(updateManyPath, '', { overwrite: true });
    generateUpdateManyArgs(updateManyFile, model, config);
    files.set(updateManyPath, updateManyFile);
    argsNames.push(argsName);
  }

  // Upsert Args (needs CreateInput, UpdateInput, and WhereUniqueInput)
  if (hasCreateInput && hasUpdateInput && hasWhereUniqueInput) {
    const argsName = `Upsert${model.name}Args`;
    const upsertPath = `${basePath}/${argsName}.ts`;
    const upsertFile = project.createSourceFile(upsertPath, '', { overwrite: true });
    generateUpsertArgs(upsertFile, model, config);
    files.set(upsertPath, upsertFile);
    argsNames.push(argsName);
  }

  // Delete Args (needs WhereUniqueInput)
  if (hasWhereUniqueInput) {
    const argsName = `Delete${model.name}Args`;
    const deletePath = `${basePath}/${argsName}.ts`;
    const deleteFile = project.createSourceFile(deletePath, '', { overwrite: true });
    generateDeleteArgs(deleteFile, model, config);
    files.set(deletePath, deleteFile);
    argsNames.push(argsName);
  }

  // DeleteMany Args (needs WhereInput)
  if (hasWhereInput) {
    const argsName = `DeleteMany${model.name}Args`;
    const deleteManyPath = `${basePath}/${argsName}.ts`;
    const deleteManyFile = project.createSourceFile(deleteManyPath, '', { overwrite: true });
    generateDeleteManyArgs(deleteManyFile, model, config);
    files.set(deleteManyPath, deleteManyFile);
    argsNames.push(argsName);
  }

  // Aggregate Args (needs WhereInput)
  if (hasWhereInput) {
    const argsName = `Aggregate${model.name}Args`;
    const aggregatePath = `${basePath}/${argsName}.ts`;
    const aggregateFile = project.createSourceFile(aggregatePath, '', { overwrite: true });
    generateAggregateArgs(aggregateFile, model, config);
    files.set(aggregatePath, aggregateFile);
    argsNames.push(argsName);
  }

  // GroupBy Args (needs WhereInput)
  if (hasWhereInput) {
    const argsName = `GroupBy${model.name}Args`;
    const groupByPath = `${basePath}/${argsName}.ts`;
    const groupByFile = project.createSourceFile(groupByPath, '', { overwrite: true });
    generateGroupByArgs(groupByFile, model, dmmf, config);
    files.set(groupByPath, groupByFile);
    argsNames.push(argsName);
  }

  return { files, argsNames };
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
function generateGroupByArgs(sourceFile: SourceFile, model: Model, dmmf: DMMFDocument, config: GeneratorConfig): void {
  const hasScalarWhereWithAggregates = dmmf.inputTypes.has(`${model.name}ScalarWhereWithAggregatesInput`);
  
  // Add imports
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ArgsType', 'Field', 'Int'],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}WhereInput`,
    namedImports: [`${model.name}WhereInput`],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}OrderByWithRelationInput`,
    namedImports: [`${model.name}OrderByWithRelationInput`],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: `../${config.outputDirs?.enums ?? 'enums'}/${model.name}ScalarFieldEnum`,
    namedImports: [`${model.name}ScalarFieldEnum`],
  });
  
  // Only import ScalarWhereWithAggregatesInput if it exists
  if (hasScalarWhereWithAggregates) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: `../${config.outputDirs?.inputs ?? 'inputs'}/${model.name}ScalarWhereWithAggregatesInput`,
      namedImports: [`${model.name}ScalarWhereWithAggregatesInput`],
    });
  }

  const properties: any[] = [
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
  ];
  
  // Only add having field if ScalarWhereWithAggregatesInput exists
  if (hasScalarWhereWithAggregates) {
    properties.push({
      name: 'having',
      type: `${model.name}ScalarWhereWithAggregatesInput`,
      hasQuestionToken: true,
      decorators: [
        {
          name: 'Field',
          arguments: [`() => ${model.name}ScalarWhereWithAggregatesInput`, '{ nullable: true }'],
        },
      ],
    });
  }
  
  properties.push(
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
  );

  sourceFile.addClass({
    name: `GroupBy${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties,
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
function generateArgsIndexFile(sourceFile: SourceFile, argsNames: string[]): void {
  for (const argsName of argsNames.sort()) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: `./${argsName}`,
    });
  }
}
