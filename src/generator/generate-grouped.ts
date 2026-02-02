import type { GeneratedFile, InputType, Model, ModelField } from './dmmf/types';
import { PRISMA_TO_GRAPHQL_SCALAR, PRISMA_TO_TS_TYPE } from './dmmf/types';
import { Project, SourceFile, Writers } from 'ts-morph';
import { camelCase, isEnumField, isRelationField, isScalarField } from './dmmf/transformer';

import type { DMMFDocument } from './dmmf/document';
import type { GeneratorConfig } from '../cli/options-parser';
import pluralize from 'pluralize';

/**
 * Available input types for a model
 */
interface AvailableInputs {
  hasWhereInput: boolean;
  hasWhereUniqueInput: boolean;
  hasOrderByInput: boolean;
  hasCreateInput: boolean;
  hasCreateManyInput: boolean;
  hasUpdateInput: boolean;
  hasUpdateManyInput: boolean;
  hasScalarWhereWithAggregates: boolean;
}

/**
 * Generate code with files grouped by model
 *
 * Output structure:
 * - enums/           (shared enums)
 * - common/          (AffectedRows, etc.)
 * - {ModelName}/     (per-model folder)
 *   - model.ts       (ObjectType)
 *   - inputs.ts      (all inputs for this model)
 *   - args.ts        (all args for this model)
 *   - resolver.ts    (resolver)
 *   - index.ts       (re-exports)
 * - helpers.ts
 * - index.ts
 */
export async function generateCodeGrouped(
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): Promise<GeneratedFile[]> {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      declaration: true,
      strict: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  });

  const allFiles = new Map<string, SourceFile>();

  // Generate shared enums
  const enumFiles = generateEnumsGrouped(project, dmmf);
  for (const [path, file] of enumFiles) {
    allFiles.set(path, file);
  }

  // Generate common types
  const commonFiles = generateCommonTypesGrouped(project);
  for (const [path, file] of commonFiles) {
    allFiles.set(path, file);
  }

  // Generate helpers
  const helpersFile = generateHelpersGrouped(project, config);
  allFiles.set('helpers.ts', helpersFile);

  // Generate per-model files
  for (const model of dmmf.models) {
    const modelFiles = generateModelGrouped(project, model, dmmf, config);
    for (const [path, file] of modelFiles) {
      allFiles.set(path, file);
    }
  }

  // Generate root index
  const indexFile = project.createSourceFile('index.ts', '', { overwrite: true });
  generateRootIndexGrouped(indexFile, dmmf, config);
  allFiles.set('index.ts', indexFile);

  // Convert to GeneratedFile array
  const result: GeneratedFile[] = [];
  for (const [path, sourceFile] of allFiles) {
    result.push({
      path,
      content: sourceFile.getFullText(),
    });
  }

  return result;
}

/**
 * Generate all files for a single model
 */
function generateModelGrouped(
  project: Project,
  model: Model,
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();
  const modelDir = model.name;

  // Get available input types for this model
  const inputTypeNames = new Set(dmmf.inputTypes.keys());
  const available: AvailableInputs = {
    hasWhereInput: inputTypeNames.has(`${model.name}WhereInput`),
    hasWhereUniqueInput: inputTypeNames.has(`${model.name}WhereUniqueInput`),
    hasOrderByInput: inputTypeNames.has(`${model.name}OrderByWithRelationInput`),
    hasCreateInput: inputTypeNames.has(`${model.name}CreateInput`),
    hasCreateManyInput: inputTypeNames.has(`${model.name}CreateManyInput`),
    hasUpdateInput: inputTypeNames.has(`${model.name}UpdateInput`),
    hasUpdateManyInput: inputTypeNames.has(`${model.name}UpdateManyMutationInput`),
    hasScalarWhereWithAggregates: inputTypeNames.has(`${model.name}ScalarWhereWithAggregatesInput`),
  };

  // Skip models with no query capability
  if (!available.hasWhereInput && !available.hasWhereUniqueInput) {
    return files;
  }

  // Generate model.ts (ObjectType)
  const modelFile = project.createSourceFile(`${modelDir}/model.ts`, '', { overwrite: true });
  generateModelObjectType(modelFile, model, dmmf, config);
  files.set(`${modelDir}/model.ts`, modelFile);

  // Generate inputs.ts (all inputs for this model)
  const modelInputTypes = getInputTypesForModel(model.name, dmmf);
  if (modelInputTypes.length > 0) {
    const inputsFile = project.createSourceFile(`${modelDir}/inputs.ts`, '', { overwrite: true });
    generateModelInputs(inputsFile, model, modelInputTypes, dmmf, config);
    files.set(`${modelDir}/inputs.ts`, inputsFile);
  }

  // Generate args.ts (all args for this model)
  const argsFile = project.createSourceFile(`${modelDir}/args.ts`, '', { overwrite: true });
  generateModelArgs(argsFile, model, dmmf, config, available);
  files.set(`${modelDir}/args.ts`, argsFile);

  // Generate resolver.ts
  if (config.generateResolvers) {
    const resolverFile = project.createSourceFile(`${modelDir}/resolver.ts`, '', {
      overwrite: true,
    });
    generateModelResolver(resolverFile, model, dmmf, config, available);
    files.set(`${modelDir}/resolver.ts`, resolverFile);
  }

  // Generate index.ts for the model folder
  const indexFile = project.createSourceFile(`${modelDir}/index.ts`, '', { overwrite: true });
  generateModelIndex(indexFile, model, config, modelInputTypes.length > 0);
  files.set(`${modelDir}/index.ts`, indexFile);

  return files;
}

/**
 * Get all input types that belong to a specific model
 */
function getInputTypesForModel(modelName: string, dmmf: DMMFDocument): InputType[] {
  const result: InputType[] = [];
  for (const [name, inputType] of dmmf.inputTypes) {
    if (name.startsWith(modelName)) {
      result.push(inputType);
    }
  }
  return result;
}

/**
 * Generate the ObjectType class for a model
 */
function generateModelObjectType(
  sourceFile: SourceFile,
  model: Model,
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): void {
  const nestjsImports = ['ObjectType', 'Field', 'ID', 'Int', 'Float'];
  const hasJson = model.fields.some(f => f.type === 'Json');
  const hasBigInt = model.fields.some(f => f.type === 'BigInt');
  const relationFields = model.fields.filter(f => isRelationField(f));
  const relatedModels = [...new Set(relationFields.map(f => f.type))].filter(m => m !== model.name);

  // Add imports
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: nestjsImports,
  });

  if (hasJson) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: 'graphql-type-json',
      namedImports: ['GraphQLJSON'],
    });
  }

  if (hasBigInt) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: 'graphql-scalars',
      namedImports: ['GraphQLBigInt'],
    });
  }

  // Import related models
  if (relatedModels.length > 0) {
    sourceFile.addStatements(
      `// eslint-disable-next-line @typescript-eslint/no-unused-vars\nimport type { ${relatedModels.join(', ')} } from '../index';`,
    );
  }

  // Import enums
  const enumFields = model.fields.filter(f => isEnumField(f));
  const enumTypes = [...new Set(enumFields.map(f => f.type))];
  if (enumTypes.length > 0) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: '../enums',
      namedImports: enumTypes,
    });
  }

  // Create the class
  const classDecl = sourceFile.addClass({
    name: `${config.typePrefix ?? ''}${model.name}${config.typeSuffix ?? ''}`,
    isExported: true,
    decorators: [
      {
        name: 'ObjectType',
        arguments: [
          Writers.object({
            description: model.documentation
              ? `'${escapeDescription(model.documentation)}'`
              : undefined,
          }),
        ],
      },
    ],
  });

  // Add fields
  for (const field of model.fields) {
    addFieldToModelClass(classDecl, field, dmmf);
  }
}

/**
 * Add a field to the model class
 */
function addFieldToModelClass(
  classDecl: ReturnType<SourceFile['addClass']>,
  field: ModelField,
  _dmmf: DMMFDocument,
): void {
  const { graphqlType, tsType } = getFieldTypes(field);
  const isRelation = isRelationField(field);

  const fieldDecoratorArgs: string[] = [];

  if (isRelation) {
    if (field.isList) {
      fieldDecoratorArgs.push(`() => [require('../${field.type}/model').${field.type}]`);
    } else {
      fieldDecoratorArgs.push(`() => require('../${field.type}/model').${field.type}`);
    }
  } else {
    if (field.isList) {
      fieldDecoratorArgs.push(`() => [${graphqlType}]`);
    } else {
      fieldDecoratorArgs.push(`() => ${graphqlType}`);
    }
  }

  const options: Record<string, string> = {};
  if (!field.isRequired && !field.isList) {
    options['nullable'] = 'true';
  }
  if (field.documentation) {
    options['description'] = `'${escapeDescription(field.documentation)}'`;
  }
  if (Object.keys(options).length > 0) {
    const optionsStr = Object.entries(options)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    fieldDecoratorArgs.push(`{ ${optionsStr} }`);
  }

  let propertyType = tsType;
  if (field.isList) {
    propertyType = `${tsType}[]`;
  }
  if (!field.isRequired) {
    propertyType = `${propertyType} | null`;
  }

  classDecl.addProperty({
    name: field.name,
    type: propertyType,
    hasExclamationToken: field.isRequired || field.isList,
    hasQuestionToken: !field.isRequired && !field.isList,
    decorators: [{ name: 'Field', arguments: fieldDecoratorArgs }],
  });
}

/**
 * Get GraphQL and TypeScript types for a field
 */
function getFieldTypes(field: ModelField): { graphqlType: string; tsType: string } {
  if (field.isId) {
    return { graphqlType: 'ID', tsType: 'string' };
  }
  if (isScalarField(field)) {
    const graphqlType = PRISMA_TO_GRAPHQL_SCALAR[field.type] ?? 'String';
    const tsType = PRISMA_TO_TS_TYPE[field.type] ?? 'string';
    if (field.type === 'Json') {
      return { graphqlType: 'GraphQLJSON', tsType: 'any' };
    }
    return { graphqlType, tsType };
  }
  if (isEnumField(field)) {
    return { graphqlType: field.type, tsType: field.type };
  }
  if (isRelationField(field)) {
    return { graphqlType: field.type, tsType: field.type };
  }
  return { graphqlType: 'String', tsType: 'string' };
}

/**
 * Generate all inputs for a model in one file
 */
function generateModelInputs(
  sourceFile: SourceFile,
  model: Model,
  inputTypes: InputType[],
  dmmf: DMMFDocument,
  _config: GeneratorConfig,
): void {
  // Collect all needed imports
  const hasJson = inputTypes.some(it => it.fields.some(f => f.type === 'Json'));
  const hasBigInt = inputTypes.some(it => it.fields.some(f => f.type === 'BigInt'));

  // Add base imports
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['InputType', 'Field', 'Int', 'Float'],
  });

  if (hasJson) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: 'graphql-type-json',
      namedImports: ['GraphQLJSON'],
    });
  }

  if (hasBigInt) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: 'graphql-scalars',
      namedImports: ['GraphQLBigInt'],
    });
  }

  // Collect enum imports
  const enumTypes = new Set<string>();
  for (const inputType of inputTypes) {
    for (const field of inputType.fields) {
      if (dmmf.isEnum(field.type)) {
        enumTypes.add(field.type);
      }
    }
  }
  if (enumTypes.size > 0) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: '../enums',
      namedImports: [...enumTypes],
    });
  }

  // Generate each input class
  for (const inputType of inputTypes) {
    generateInputClass(sourceFile, inputType, dmmf, model.name);
  }
}

/**
 * Generate a single input class
 */
function generateInputClass(
  sourceFile: SourceFile,
  inputType: InputType,
  dmmf: DMMFDocument,
  modelName: string,
): void {
  const classDecl = sourceFile.addClass({
    name: inputType.name,
    isExported: true,
    decorators: [{ name: 'InputType', arguments: [] }],
  });

  for (const field of inputType.fields) {
    addFieldToInputClass(classDecl, field, dmmf, inputType.name, modelName);
  }
}

/**
 * Add a field to an input class
 */
function addFieldToInputClass(
  classDecl: ReturnType<SourceFile['addClass']>,
  field: { name: string; type: string; isList: boolean; isRequired: boolean },
  dmmf: DMMFDocument,
  currentTypeName: string,
  modelName: string,
): void {
  const { graphqlType, tsType, isInputObjectType } = getInputFieldTypes(field, dmmf);

  const fieldDecoratorArgs: string[] = [];

  // For input object types within the same model, use class reference; others use lazy require
  if (isInputObjectType && graphqlType !== currentTypeName) {
    if (graphqlType.startsWith(modelName)) {
      // Same model's input, just reference the class
      if (field.isList) {
        fieldDecoratorArgs.push(`() => [${graphqlType}]`);
      } else {
        fieldDecoratorArgs.push(`() => ${graphqlType}`);
      }
    } else {
      // Different model's input, use lazy require
      const otherModel = graphqlType.replace(/(?:Where|Create|Update|OrderBy|Scalar).*Input$/, '');
      if (field.isList) {
        fieldDecoratorArgs.push(`() => [require('../${otherModel}/inputs').${graphqlType}]`);
      } else {
        fieldDecoratorArgs.push(`() => require('../${otherModel}/inputs').${graphqlType}`);
      }
    }
  } else {
    if (field.isList) {
      fieldDecoratorArgs.push(`() => [${graphqlType}]`);
    } else {
      fieldDecoratorArgs.push(`() => ${graphqlType}`);
    }
  }

  if (!field.isRequired) {
    fieldDecoratorArgs.push('{ nullable: true }');
  }

  let propertyType = tsType;
  if (field.isList) {
    propertyType = `${tsType}[]`;
  }
  if (!field.isRequired) {
    propertyType = `${propertyType} | undefined`;
  }

  classDecl.addProperty({
    name: field.name,
    type: propertyType,
    hasQuestionToken: !field.isRequired,
    decorators: [{ name: 'Field', arguments: fieldDecoratorArgs }],
  });
}

/**
 * Get types for an input field
 */
function getInputFieldTypes(
  field: { type: string },
  dmmf: DMMFDocument,
): { graphqlType: string; tsType: string; isInputObjectType: boolean } {
  const mainType = field.type;

  if (PRISMA_TO_GRAPHQL_SCALAR[mainType]) {
    const graphqlType = PRISMA_TO_GRAPHQL_SCALAR[mainType];
    const tsType = PRISMA_TO_TS_TYPE[mainType];
    if (mainType === 'Json') {
      return { graphqlType: 'GraphQLJSON', tsType: 'any', isInputObjectType: false };
    }
    return {
      graphqlType: graphqlType ?? 'String',
      tsType: tsType ?? 'string',
      isInputObjectType: false,
    };
  }

  if (dmmf.isEnum(mainType)) {
    return { graphqlType: mainType, tsType: mainType, isInputObjectType: false };
  }

  return { graphqlType: mainType, tsType: 'any', isInputObjectType: true };
}

/**
 * Generate all args for a model in one file
 */
function generateModelArgs(
  sourceFile: SourceFile,
  model: Model,
  _dmmf: DMMFDocument,
  _config: GeneratorConfig,
  available: AvailableInputs,
): void {
  // Add imports
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ArgsType', 'Field', 'Int'],
  });

  // Import from local inputs.ts
  const inputImports: string[] = [];
  if (available.hasWhereInput) inputImports.push(`${model.name}WhereInput`);
  if (available.hasWhereUniqueInput) inputImports.push(`${model.name}WhereUniqueInput`);
  if (available.hasOrderByInput) inputImports.push(`${model.name}OrderByWithRelationInput`);
  if (available.hasCreateInput) inputImports.push(`${model.name}CreateInput`);
  if (available.hasCreateManyInput) inputImports.push(`${model.name}CreateManyInput`);
  if (available.hasUpdateInput) inputImports.push(`${model.name}UpdateInput`);
  if (available.hasUpdateManyInput) inputImports.push(`${model.name}UpdateManyMutationInput`);
  if (available.hasScalarWhereWithAggregates)
    inputImports.push(`${model.name}ScalarWhereWithAggregatesInput`);

  if (inputImports.length > 0) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: './inputs',
      namedImports: inputImports,
    });
  }

  // Import ScalarFieldEnum
  sourceFile.addImportDeclaration({
    moduleSpecifier: '../enums',
    namedImports: [`${model.name}ScalarFieldEnum`],
  });

  // Generate args classes
  if (available.hasWhereInput) {
    generateFindManyArgsClass(sourceFile, model, available);
    generateFindFirstArgsClass(sourceFile, model, available);
    generateDeleteManyArgsClass(sourceFile, model);
    generateAggregateArgsClass(sourceFile, model, available);
    generateGroupByArgsClass(sourceFile, model, available);
  }

  if (available.hasWhereUniqueInput) {
    generateFindUniqueArgsClass(sourceFile, model);
    generateDeleteArgsClass(sourceFile, model);
  }

  if (available.hasCreateInput) {
    generateCreateArgsClass(sourceFile, model);
  }

  if (available.hasCreateManyInput) {
    generateCreateManyArgsClass(sourceFile, model);
  }

  if (available.hasUpdateInput && available.hasWhereUniqueInput) {
    generateUpdateArgsClass(sourceFile, model);
  }

  if (available.hasUpdateManyInput && available.hasWhereInput) {
    generateUpdateManyArgsClass(sourceFile, model);
  }

  if (available.hasCreateInput && available.hasUpdateInput && available.hasWhereUniqueInput) {
    generateUpsertArgsClass(sourceFile, model);
  }
}

// Individual args class generators (simplified versions in single file)
function generateFindManyArgsClass(
  sourceFile: SourceFile,
  model: Model,
  available: AvailableInputs,
): void {
  const properties: any[] = [
    {
      name: 'where',
      type: `${model.name}WhereInput`,
      hasQuestionToken: true,
      decorators: [
        { name: 'Field', arguments: [`() => ${model.name}WhereInput`, '{ nullable: true }'] },
      ],
    },
  ];
  if (available.hasOrderByInput) {
    properties.push({
      name: 'orderBy',
      type: `${model.name}OrderByWithRelationInput[]`,
      hasQuestionToken: true,
      decorators: [
        {
          name: 'Field',
          arguments: [`() => [${model.name}OrderByWithRelationInput]`, '{ nullable: true }'],
        },
      ],
    });
  }
  if (available.hasWhereUniqueInput) {
    properties.push({
      name: 'cursor',
      type: `${model.name}WhereUniqueInput`,
      hasQuestionToken: true,
      decorators: [
        { name: 'Field', arguments: [`() => ${model.name}WhereUniqueInput`, '{ nullable: true }'] },
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
  );
  sourceFile.addClass({
    name: `FindMany${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties,
  });
}

function generateFindFirstArgsClass(
  sourceFile: SourceFile,
  model: Model,
  available: AvailableInputs,
): void {
  const properties: any[] = [
    {
      name: 'where',
      type: `${model.name}WhereInput`,
      hasQuestionToken: true,
      decorators: [
        { name: 'Field', arguments: [`() => ${model.name}WhereInput`, '{ nullable: true }'] },
      ],
    },
  ];
  if (available.hasOrderByInput) {
    properties.push({
      name: 'orderBy',
      type: `${model.name}OrderByWithRelationInput[]`,
      hasQuestionToken: true,
      decorators: [
        {
          name: 'Field',
          arguments: [`() => [${model.name}OrderByWithRelationInput]`, '{ nullable: true }'],
        },
      ],
    });
  }
  if (available.hasWhereUniqueInput) {
    properties.push({
      name: 'cursor',
      type: `${model.name}WhereUniqueInput`,
      hasQuestionToken: true,
      decorators: [
        { name: 'Field', arguments: [`() => ${model.name}WhereUniqueInput`, '{ nullable: true }'] },
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
  );
  sourceFile.addClass({
    name: `FindFirst${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties,
  });
}

function generateFindUniqueArgsClass(sourceFile: SourceFile, model: Model): void {
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

function generateCreateArgsClass(sourceFile: SourceFile, model: Model): void {
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

function generateCreateManyArgsClass(sourceFile: SourceFile, model: Model): void {
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
    ],
  });
}

function generateUpdateArgsClass(sourceFile: SourceFile, model: Model): void {
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

function generateUpdateManyArgsClass(sourceFile: SourceFile, model: Model): void {
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

function generateUpsertArgsClass(sourceFile: SourceFile, model: Model): void {
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

function generateDeleteArgsClass(sourceFile: SourceFile, model: Model): void {
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

function generateDeleteManyArgsClass(sourceFile: SourceFile, model: Model): void {
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

function generateAggregateArgsClass(
  sourceFile: SourceFile,
  model: Model,
  available: AvailableInputs,
): void {
  const properties: any[] = [
    {
      name: 'where',
      type: `${model.name}WhereInput`,
      hasQuestionToken: true,
      decorators: [
        { name: 'Field', arguments: [`() => ${model.name}WhereInput`, '{ nullable: true }'] },
      ],
    },
  ];
  if (available.hasOrderByInput) {
    properties.push({
      name: 'orderBy',
      type: `${model.name}OrderByWithRelationInput[]`,
      hasQuestionToken: true,
      decorators: [
        {
          name: 'Field',
          arguments: [`() => [${model.name}OrderByWithRelationInput]`, '{ nullable: true }'],
        },
      ],
    });
  }
  if (available.hasWhereUniqueInput) {
    properties.push({
      name: 'cursor',
      type: `${model.name}WhereUniqueInput`,
      hasQuestionToken: true,
      decorators: [
        { name: 'Field', arguments: [`() => ${model.name}WhereUniqueInput`, '{ nullable: true }'] },
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
    name: `Aggregate${model.name}Args`,
    isExported: true,
    decorators: [{ name: 'ArgsType', arguments: [] }],
    properties,
  });
}

function generateGroupByArgsClass(
  sourceFile: SourceFile,
  model: Model,
  available: AvailableInputs,
): void {
  const properties: any[] = [
    {
      name: 'where',
      type: `${model.name}WhereInput`,
      hasQuestionToken: true,
      decorators: [
        { name: 'Field', arguments: [`() => ${model.name}WhereInput`, '{ nullable: true }'] },
      ],
    },
  ];
  if (available.hasOrderByInput) {
    properties.push({
      name: 'orderBy',
      type: `${model.name}OrderByWithRelationInput[]`,
      hasQuestionToken: true,
      decorators: [
        {
          name: 'Field',
          arguments: [`() => [${model.name}OrderByWithRelationInput]`, '{ nullable: true }'],
        },
      ],
    });
  }
  properties.push({
    name: 'by',
    type: `${model.name}ScalarFieldEnum[]`,
    hasExclamationToken: true,
    decorators: [{ name: 'Field', arguments: [`() => [${model.name}ScalarFieldEnum]`] }],
  });
  if (available.hasScalarWhereWithAggregates) {
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
 * Generate resolver for a model
 */
function generateModelResolver(
  sourceFile: SourceFile,
  model: Model,
  _dmmf: DMMFDocument,
  _config: GeneratorConfig,
  ops: AvailableInputs,
): void {
  const modelName = model.name;
  const lowerModelName = camelCase(modelName);
  const pluralName = pluralize(lowerModelName);
  const isAlreadyPlural = pluralName === lowerModelName;
  const findManyMethodName = isAlreadyPlural ? `findMany${modelName}` : pluralName;
  const findUniqueMethodName = isAlreadyPlural ? `findUnique${modelName}` : lowerModelName;

  // Build imports
  const nestjsImports = ['Resolver', 'Query', 'Args', 'Info', 'Int'];
  if (ops.hasCreateInput || ops.hasUpdateInput) {
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
    moduleSpecifier: './model',
    namedImports: [modelName],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: '../common/AffectedRows',
    namedImports: ['AffectedRows'],
  });
  sourceFile.addImportDeclaration({
    moduleSpecifier: '../helpers',
    namedImports: ['transformInfoIntoPrismaArgs', 'getPrismaFromContext'],
  });

  // Import args
  const argsImports: string[] = [];
  if (ops.hasWhereInput) {
    argsImports.push(
      `FindMany${modelName}Args`,
      `FindFirst${modelName}Args`,
      `DeleteMany${modelName}Args`,
    );
  }
  if (ops.hasWhereUniqueInput) {
    argsImports.push(`FindUnique${modelName}Args`, `Delete${modelName}Args`);
  }
  if (ops.hasCreateInput) argsImports.push(`Create${modelName}Args`);
  if (ops.hasCreateManyInput) argsImports.push(`CreateMany${modelName}Args`);
  if (ops.hasUpdateInput && ops.hasWhereUniqueInput) argsImports.push(`Update${modelName}Args`);
  if (ops.hasUpdateManyInput && ops.hasWhereInput) argsImports.push(`UpdateMany${modelName}Args`);
  if (ops.hasCreateInput && ops.hasUpdateInput && ops.hasWhereUniqueInput)
    argsImports.push(`Upsert${modelName}Args`);

  if (argsImports.length > 0) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: './args',
      namedImports: argsImports,
    });
  }

  // Create resolver class
  const resolverClass = sourceFile.addClass({
    name: `${modelName}Resolver`,
    isExported: true,
    decorators: [{ name: 'Resolver', arguments: [`() => ${modelName}`] }],
  });

  // Add query methods
  if (ops.hasWhereInput) {
    addResolverMethod(
      resolverClass,
      'Query',
      findManyMethodName,
      `FindMany${modelName}Args`,
      `Promise<${modelName}[]>`,
      `[${modelName}]`,
      lowerModelName,
      'findMany',
    );
    addResolverMethod(
      resolverClass,
      'Query',
      `findFirst${modelName}`,
      `FindFirst${modelName}Args`,
      `Promise<${modelName} | null>`,
      modelName,
      lowerModelName,
      'findFirst',
      true,
    );
  }
  if (ops.hasWhereUniqueInput) {
    addResolverMethod(
      resolverClass,
      'Query',
      findUniqueMethodName,
      `FindUnique${modelName}Args`,
      `Promise<${modelName} | null>`,
      modelName,
      lowerModelName,
      'findUnique',
      true,
    );
  }

  // Add mutation methods
  if (ops.hasCreateInput) {
    addResolverMethod(
      resolverClass,
      'Mutation',
      `createOne${modelName}`,
      `Create${modelName}Args`,
      `Promise<${modelName}>`,
      modelName,
      lowerModelName,
      'create',
    );
  }
  if (ops.hasCreateManyInput) {
    addResolverMethod(
      resolverClass,
      'Mutation',
      `createMany${modelName}`,
      `CreateMany${modelName}Args`,
      'Promise<AffectedRows>',
      'AffectedRows',
      lowerModelName,
      'createMany',
    );
  }
  if (ops.hasUpdateInput && ops.hasWhereUniqueInput) {
    addResolverMethod(
      resolverClass,
      'Mutation',
      `updateOne${modelName}`,
      `Update${modelName}Args`,
      `Promise<${modelName} | null>`,
      modelName,
      lowerModelName,
      'update',
      true,
    );
  }
  if (ops.hasUpdateManyInput && ops.hasWhereInput) {
    addResolverMethod(
      resolverClass,
      'Mutation',
      `updateMany${modelName}`,
      `UpdateMany${modelName}Args`,
      'Promise<AffectedRows>',
      'AffectedRows',
      lowerModelName,
      'updateMany',
    );
  }
  if (ops.hasCreateInput && ops.hasUpdateInput && ops.hasWhereUniqueInput) {
    addResolverMethod(
      resolverClass,
      'Mutation',
      `upsertOne${modelName}`,
      `Upsert${modelName}Args`,
      `Promise<${modelName}>`,
      modelName,
      lowerModelName,
      'upsert',
    );
  }
  if (ops.hasWhereUniqueInput) {
    addResolverMethod(
      resolverClass,
      'Mutation',
      `deleteOne${modelName}`,
      `Delete${modelName}Args`,
      `Promise<${modelName} | null>`,
      modelName,
      lowerModelName,
      'delete',
      true,
    );
  }
  if (ops.hasWhereInput) {
    addResolverMethod(
      resolverClass,
      'Mutation',
      `deleteMany${modelName}`,
      `DeleteMany${modelName}Args`,
      'Promise<AffectedRows>',
      'AffectedRows',
      lowerModelName,
      'deleteMany',
    );
  }
}

function addResolverMethod(
  classDecl: ReturnType<SourceFile['addClass']>,
  decoratorType: 'Query' | 'Mutation',
  methodName: string,
  argsType: string,
  returnType: string,
  graphqlReturnType: string,
  prismaModel: string,
  prismaMethod: string,
  nullable: boolean = false,
): void {
  const returnTypeArg = nullable ? `{ nullable: true }` : '';
  classDecl.addMethod({
    name: methodName,
    isAsync: true,
    decorators: [
      {
        name: decoratorType,
        arguments: returnTypeArg
          ? [`() => ${graphqlReturnType}`, returnTypeArg]
          : [`() => ${graphqlReturnType}`],
      },
    ],
    parameters: [
      { name: 'args', type: argsType, decorators: [{ name: 'Args', arguments: [] }] },
      { name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info', arguments: [] }] },
    ],
    returnType,
    statements: [
      `const select = transformInfoIntoPrismaArgs(info);`,
      `const prisma = getPrismaFromContext(info);`,
      `return prisma.${prismaModel}.${prismaMethod}({ ...args, ...select });`,
    ],
  });
}

/**
 * Generate model folder index
 */
function generateModelIndex(
  sourceFile: SourceFile,
  _model: Model,
  config: GeneratorConfig,
  hasInputs: boolean,
): void {
  sourceFile.addExportDeclaration({ moduleSpecifier: './model' });
  if (hasInputs) {
    sourceFile.addExportDeclaration({ moduleSpecifier: './inputs' });
  }
  sourceFile.addExportDeclaration({ moduleSpecifier: './args' });
  if (config.generateResolvers) {
    sourceFile.addExportDeclaration({ moduleSpecifier: './resolver' });
  }
}

/**
 * Generate shared enums
 */
function generateEnumsGrouped(project: Project, dmmf: DMMFDocument): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();

  for (const enumDef of dmmf.enums) {
    const filePath = `enums/${enumDef.name}.ts`;
    const sourceFile = project.createSourceFile(filePath, '', { overwrite: true });

    sourceFile.addImportDeclaration({
      moduleSpecifier: '@nestjs/graphql',
      namedImports: ['registerEnumType'],
    });

    sourceFile.addEnum({
      name: enumDef.name,
      isExported: true,
      members: enumDef.values.map(v => ({ name: v.name, value: `'${v.name}'` })),
    });

    sourceFile.addStatements(`
registerEnumType(${enumDef.name}, {
  name: '${enumDef.name}',
  description: ${enumDef.documentation ? `'${escapeDescription(enumDef.documentation)}'` : 'undefined'},
});
`);

    files.set(filePath, sourceFile);
  }

  // Generate index
  const indexFile = project.createSourceFile('enums/index.ts', '', { overwrite: true });
  for (const enumDef of dmmf.enums) {
    indexFile.addExportDeclaration({ moduleSpecifier: `./${enumDef.name}` });
  }
  files.set('enums/index.ts', indexFile);

  return files;
}

/**
 * Generate common types
 */
function generateCommonTypesGrouped(project: Project): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();

  const affectedRowsFile = project.createSourceFile('common/AffectedRows.ts', '', {
    overwrite: true,
  });
  affectedRowsFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ObjectType', 'Field', 'Int'],
  });
  affectedRowsFile.addClass({
    name: 'AffectedRows',
    isExported: true,
    decorators: [{ name: 'ObjectType', arguments: [] }],
    properties: [
      {
        name: 'count',
        type: 'number',
        hasExclamationToken: true,
        decorators: [{ name: 'Field', arguments: ['() => Int'] }],
      },
    ],
  });
  files.set('common/AffectedRows.ts', affectedRowsFile);

  const indexFile = project.createSourceFile('common/index.ts', '', { overwrite: true });
  indexFile.addExportDeclaration({ moduleSpecifier: './AffectedRows' });
  files.set('common/index.ts', indexFile);

  return files;
}

/**
 * Generate helpers file
 */
function generateHelpersGrouped(project: Project, _config: GeneratorConfig): SourceFile {
  const sourceFile = project.createSourceFile('helpers.ts', '', { overwrite: true });

  sourceFile.addStatements(`
import { parseResolveInfo, ResolveTree, FieldsByTypeName } from 'graphql-parse-resolve-info';
import type { GraphQLResolveInfo } from 'graphql';

export function transformInfoIntoPrismaArgs(info: GraphQLResolveInfo): { select?: Record<string, any>; include?: Record<string, any> } {
  const parsedInfo = parseResolveInfo(info) as ResolveTree | null;
  if (!parsedInfo) return {};

  const select = buildPrismaSelect(parsedInfo.fieldsByTypeName);
  return Object.keys(select).length > 0 ? { select } : {};
}

function buildPrismaSelect(fieldsByTypeName: FieldsByTypeName): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const typeName in fieldsByTypeName) {
    const fields = fieldsByTypeName[typeName];
    for (const fieldName in fields) {
      if (fieldName.startsWith('__') || fieldName.startsWith('_count') || fieldName.startsWith('_avg') || fieldName.startsWith('_sum') || fieldName.startsWith('_min') || fieldName.startsWith('_max')) continue;
      
      const field = fields[fieldName];
      const nestedFields = field.fieldsByTypeName;
      
      if (Object.keys(nestedFields).length > 0) {
        const nestedSelect = buildPrismaSelect(nestedFields);
        result[fieldName] = Object.keys(nestedSelect).length > 0 ? { select: nestedSelect } : true;
      } else {
        result[fieldName] = true;
      }
    }
  }
  
  return result;
}

export function getPrismaFromContext(info: GraphQLResolveInfo): any {
  const context = (info.rootValue as any)?.context ?? info.rootValue;
  const prisma = context?.prisma ?? context?.db;
  if (!prisma) throw new Error('Prisma client not found in context. Please provide prisma in your GraphQL context.');
  return prisma;
}

export function mergePrismaSelects(...selects: Array<{ select?: Record<string, any>; include?: Record<string, any> }>): { select?: Record<string, any>; include?: Record<string, any> } {
  const result: { select?: Record<string, any>; include?: Record<string, any> } = {};
  for (const s of selects) {
    if (s.select) result.select = { ...(result.select ?? {}), ...s.select };
    if (s.include) result.include = { ...(result.include ?? {}), ...s.include };
  }
  return result;
}
`);

  return sourceFile;
}

/**
 * Generate root index
 */
function generateRootIndexGrouped(
  sourceFile: SourceFile,
  dmmf: DMMFDocument,
  _config: GeneratorConfig,
): void {
  sourceFile.addExportDeclaration({ moduleSpecifier: './enums' });
  sourceFile.addExportDeclaration({ moduleSpecifier: './common' });
  sourceFile.addExportDeclaration({ moduleSpecifier: './helpers' });

  for (const model of dmmf.models) {
    const inputTypeNames = new Set(dmmf.inputTypes.keys());
    const hasWhereInput = inputTypeNames.has(`${model.name}WhereInput`);
    const hasWhereUniqueInput = inputTypeNames.has(`${model.name}WhereUniqueInput`);
    if (hasWhereInput || hasWhereUniqueInput) {
      sourceFile.addExportDeclaration({ moduleSpecifier: `./${model.name}` });
    }
  }
}

function escapeDescription(text: string): string {
  return text.replace(/'/g, "\\'").replace(/\n/g, '\\n');
}
