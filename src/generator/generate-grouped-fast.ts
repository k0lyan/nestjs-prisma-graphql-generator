import type { GeneratedFile, InputType, Model, ModelField } from './dmmf/types';
import { PRISMA_TO_GRAPHQL_SCALAR, PRISMA_TO_TS_TYPE } from './dmmf/types';
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
 * Generate code with files grouped by model using direct string generation
 * (faster than ts-morph AST manipulation)
 */
export async function generateCodeGrouped(
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];

  // Pre-compute input type names set for all models
  const inputTypeNames = new Set(dmmf.inputTypes.keys());
  // Pre-compute all model names for better input type matching
  const allModelNames = new Set(dmmf.models.map(m => m.name));

  // Generate shared enums
  files.push(...generateEnumsGrouped(dmmf));

  // Generate common types (including shared input types like IntFilter, StringFilter, etc.)
  files.push(...generateCommonTypesGrouped(dmmf, allModelNames));

  // Generate helpers
  files.push(generateHelpersGrouped());

  // Generate per-model files
  for (const model of dmmf.models) {
    files.push(...generateModelGrouped(model, dmmf, config, inputTypeNames, allModelNames));
  }

  // Generate root index
  files.push(generateRootIndexGrouped(dmmf, inputTypeNames));

  return files;
}

/**
 * Generate all files for a single model
 */
function generateModelGrouped(
  model: Model,
  dmmf: DMMFDocument,
  config: GeneratorConfig,
  inputTypeNames: Set<string>,
  allModelNames: Set<string>,
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const modelDir = model.name;

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

  // Generate model.ts
  files.push({
    path: `${modelDir}/model.ts`,
    content: generateModelObjectType(model, dmmf, config),
  });

  // Generate inputs.ts
  const modelInputTypes = getInputTypesForModel(model.name, dmmf, allModelNames);
  if (modelInputTypes.length > 0) {
    files.push({
      path: `${modelDir}/inputs.ts`,
      content: generateModelInputs(model, modelInputTypes, dmmf, allModelNames),
    });
  }

  // Generate args.ts
  files.push({
    path: `${modelDir}/args.ts`,
    content: generateModelArgs(model, available),
  });

  // Generate resolver.ts
  if (config.generateResolvers) {
    files.push({
      path: `${modelDir}/resolver.ts`,
      content: generateModelResolver(model, available, config),
    });
  }

  // Generate index.ts
  files.push({
    path: `${modelDir}/index.ts`,
    content: generateModelIndex(config, modelInputTypes.length > 0),
  });

  return files;
}

function getInputTypesForModel(
  modelName: string,
  dmmf: DMMFDocument,
  allModelNames: Set<string>,
): InputType[] {
  const result: InputType[] = [];
  // Match inputs that start with modelName
  // But exclude inputs that belong to a longer model name (e.g., ClinicType vs Clinic)

  for (const [name, inputType] of dmmf.inputTypes) {
    // Check if it starts with modelName
    if (!name.startsWith(modelName)) continue;

    // Check it doesn't belong to a longer model name (e.g., ClinicType vs Clinic)
    let belongsToLongerModel = false;
    for (const otherModel of allModelNames) {
      if (
        otherModel !== modelName &&
        otherModel.startsWith(modelName) &&
        name.startsWith(otherModel)
      ) {
        belongsToLongerModel = true;
        break;
      }
    }

    if (!belongsToLongerModel) {
      result.push(inputType);
    }
  }
  return result;
}

// ============ Model ObjectType ============

function generateModelObjectType(
  model: Model,
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): string {
  const lines: string[] = [];
  const hasJson = model.fields.some(f => f.type === 'Json');
  const hasBigInt = model.fields.some(f => f.type === 'BigInt');
  const relationFields = model.fields.filter(f => isRelationField(f));
  const relatedModels = [...new Set(relationFields.map(f => f.type))].filter(m => m !== model.name);
  const enumFields = model.fields.filter(f => isEnumField(f));
  const enumTypes = [...new Set(enumFields.map(f => f.type))];

  // Imports
  lines.push(`import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';`);
  if (hasJson) lines.push(`import { GraphQLJSON } from 'graphql-type-json';`);
  if (hasBigInt) lines.push(`import { GraphQLBigInt } from 'graphql-scalars';`);
  if (relatedModels.length > 0) {
    lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`);
    lines.push(`import type { ${relatedModels.join(', ')} } from '../index';`);
  }
  if (enumTypes.length > 0) {
    lines.push(`import { ${enumTypes.join(', ')} } from '../enums';`);
  }

  lines.push('');

  // Class
  const className = `${config.typePrefix ?? ''}${model.name}${config.typeSuffix ?? ''}`;
  const descOption = model.documentation
    ? `, { description: '${escapeStr(model.documentation)}' }`
    : '';
  lines.push(`@ObjectType()${descOption}`);
  lines.push(`export class ${className} {`);

  for (const field of model.fields) {
    lines.push(generateModelField(field, dmmf));
  }

  lines.push('}');
  return lines.join('\n');
}

function generateModelField(field: ModelField, _dmmf: DMMFDocument): string {
  const { graphqlType, tsType } = getFieldTypes(field);
  const isRelation = isRelationField(field);
  const lines: string[] = [];

  let typeArg: string;
  if (isRelation) {
    typeArg = field.isList
      ? `() => [require('../${field.type}/model').${field.type}]`
      : `() => require('../${field.type}/model').${field.type}`;
  } else {
    typeArg = field.isList ? `() => [${graphqlType}]` : `() => ${graphqlType}`;
  }

  const options: string[] = [];
  if (!field.isRequired && !field.isList) options.push('nullable: true');
  if (field.documentation) options.push(`description: '${escapeStr(field.documentation)}'`);

  const optionsStr = options.length > 0 ? `, { ${options.join(', ')} }` : '';
  lines.push(`  @Field(${typeArg}${optionsStr})`);

  let propertyType = tsType;
  if (field.isList) propertyType = `${tsType}[]`;
  if (!field.isRequired) propertyType = `${propertyType} | null`;

  const modifier = field.isRequired || field.isList ? '!' : '?';
  lines.push(`  ${field.name}${modifier}: ${propertyType};`);
  lines.push('');

  return lines.join('\n');
}

function getFieldTypes(field: ModelField): { graphqlType: string; tsType: string } {
  if (field.isId) return { graphqlType: 'ID', tsType: 'string' };
  if (isScalarField(field)) {
    if (field.type === 'Json') return { graphqlType: 'GraphQLJSON', tsType: 'any' };
    return {
      graphqlType: PRISMA_TO_GRAPHQL_SCALAR[field.type] ?? 'String',
      tsType: PRISMA_TO_TS_TYPE[field.type] ?? 'string',
    };
  }
  if (isEnumField(field)) return { graphqlType: field.type, tsType: field.type };
  if (isRelationField(field)) return { graphqlType: field.type, tsType: field.type };
  return { graphqlType: 'String', tsType: 'string' };
}

// ============ Inputs ============

function generateModelInputs(
  model: Model,
  inputTypes: InputType[],
  dmmf: DMMFDocument,
  allModelNames: Set<string>,
): string {
  const lines: string[] = [];
  const hasJson = inputTypes.some(it => it.fields.some(f => f.type === 'Json'));
  const hasBigInt = inputTypes.some(it => it.fields.some(f => f.type === 'BigInt'));

  // Collect enums
  const enumTypes = new Set<string>();
  for (const it of inputTypes) {
    for (const f of it.fields) {
      if (dmmf.isEnum(f.type)) enumTypes.add(f.type);
    }
  }

  // Imports
  lines.push(`import { InputType, Field, Int, Float } from '@nestjs/graphql';`);
  if (hasJson) lines.push(`import { GraphQLJSON } from 'graphql-type-json';`);
  if (hasBigInt) lines.push(`import { GraphQLBigInt } from 'graphql-scalars';`);
  if (enumTypes.size > 0) lines.push(`import { ${[...enumTypes].join(', ')} } from '../enums';`);
  lines.push('');

  for (const inputType of inputTypes) {
    lines.push(generateInputClass(inputType, dmmf, model.name, allModelNames));
    lines.push('');
  }

  return lines.join('\n');
}

function generateInputClass(
  inputType: InputType,
  dmmf: DMMFDocument,
  modelName: string,
  allModelNames: Set<string>,
): string {
  const lines: string[] = [];
  lines.push(`@InputType()`);
  lines.push(`export class ${inputType.name} {`);

  for (const field of inputType.fields) {
    lines.push(generateInputField(field, dmmf, inputType.name, modelName, allModelNames));
  }

  lines.push('}');
  return lines.join('\n');
}

function generateInputField(
  field: { name: string; type: string; isList: boolean; isRequired: boolean },
  dmmf: DMMFDocument,
  currentTypeName: string,
  modelName: string,
  allModelNames: Set<string>,
): string {
  const { graphqlType, tsType, isInputObjectType } = getInputFieldTypes(field, dmmf);
  const lines: string[] = [];

  let typeArg: string;
  if (isInputObjectType && graphqlType !== currentTypeName) {
    // Check if this input type belongs to the current model
    // We need to find which model this input type belongs to by checking
    // which model name it starts with (longest match wins to handle cases like City vs CityType)
    const owningModel = findOwningModel(graphqlType, allModelNames);

    if (owningModel === modelName) {
      // Same model - local reference
      typeArg = field.isList ? `() => [${graphqlType}]` : `() => ${graphqlType}`;
    } else if (owningModel) {
      // Different model - use require
      typeArg = field.isList
        ? `() => [require('../${owningModel}/inputs').${graphqlType}]`
        : `() => require('../${owningModel}/inputs').${graphqlType}`;
    } else {
      // Shared/common input type (like IntFilter, StringFilter, etc.) - use require from common
      typeArg = field.isList
        ? `() => [require('../common/inputs').${graphqlType}]`
        : `() => require('../common/inputs').${graphqlType}`;
    }
  } else {
    typeArg = field.isList ? `() => [${graphqlType}]` : `() => ${graphqlType}`;
  }

  const optionsStr = !field.isRequired ? ', { nullable: true }' : '';
  lines.push(`  @Field(${typeArg}${optionsStr})`);

  let propertyType = tsType;
  if (field.isList) propertyType = `${tsType}[]`;
  if (!field.isRequired) propertyType = `${propertyType} | undefined`;

  const modifier = field.isRequired ? '!' : '?';
  lines.push(`  ${field.name}${modifier}: ${propertyType};`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Find which model owns an input type by checking which model name the input type starts with.
 * Uses longest match to handle cases like City vs CityType correctly.
 */
function findOwningModel(inputTypeName: string, allModelNames: Set<string>): string | null {
  let longestMatch: string | null = null;
  let longestLength = 0;

  for (const modelName of allModelNames) {
    if (inputTypeName.startsWith(modelName) && modelName.length > longestLength) {
      // Verify it's a proper prefix (followed by a capital letter or end of known suffix patterns)
      const remainder = inputTypeName.slice(modelName.length);
      // Check if the remainder starts with a typical input type suffix pattern
      if (
        remainder.length === 0 ||
        /^(Where|Create|Update|Upsert|Delete|OrderBy|Scalar|List|Nullable|Nested|Unchecked|Count|Avg|Sum|Min|Max|Aggregate|GroupBy|RelationFilter)/.test(
          remainder,
        )
      ) {
        longestMatch = modelName;
        longestLength = modelName.length;
      }
    }
  }

  return longestMatch;
}

function getInputFieldTypes(
  field: { type: string },
  dmmf: DMMFDocument,
): { graphqlType: string; tsType: string; isInputObjectType: boolean } {
  if (PRISMA_TO_GRAPHQL_SCALAR[field.type]) {
    if (field.type === 'Json')
      return { graphqlType: 'GraphQLJSON', tsType: 'any', isInputObjectType: false };
    return {
      graphqlType: PRISMA_TO_GRAPHQL_SCALAR[field.type] ?? 'String',
      tsType: PRISMA_TO_TS_TYPE[field.type] ?? 'string',
      isInputObjectType: false,
    };
  }
  if (dmmf.isEnum(field.type))
    return { graphqlType: field.type, tsType: field.type, isInputObjectType: false };
  return { graphqlType: field.type, tsType: 'any', isInputObjectType: true };
}

// ============ Args ============

function generateModelArgs(model: Model, available: AvailableInputs): string {
  const lines: string[] = [];
  const m = model.name;

  // Imports
  lines.push(`import { ArgsType, Field, Int } from '@nestjs/graphql';`);

  const inputImports: string[] = [];
  if (available.hasWhereInput) inputImports.push(`${m}WhereInput`);
  if (available.hasWhereUniqueInput) inputImports.push(`${m}WhereUniqueInput`);
  if (available.hasOrderByInput) inputImports.push(`${m}OrderByWithRelationInput`);
  if (available.hasCreateInput) inputImports.push(`${m}CreateInput`);
  if (available.hasCreateManyInput) inputImports.push(`${m}CreateManyInput`);
  if (available.hasUpdateInput) inputImports.push(`${m}UpdateInput`);
  if (available.hasUpdateManyInput) inputImports.push(`${m}UpdateManyMutationInput`);
  if (available.hasScalarWhereWithAggregates)
    inputImports.push(`${m}ScalarWhereWithAggregatesInput`);

  if (inputImports.length > 0) {
    lines.push(`import { ${inputImports.join(', ')} } from './inputs';`);
  }
  lines.push(`import { ${m}ScalarFieldEnum } from '../enums';`);
  lines.push('');

  // Generate args classes
  if (available.hasWhereInput) {
    lines.push(generateFindManyArgs(m, available));
    lines.push(generateFindFirstArgs(m, available));
    lines.push(generateDeleteManyArgs(m));
    lines.push(generateAggregateArgs(m, available));
    lines.push(generateGroupByArgs(m, available));
  }
  if (available.hasWhereUniqueInput) {
    lines.push(generateFindUniqueArgs(m));
    lines.push(generateDeleteArgs(m));
  }
  if (available.hasCreateInput) lines.push(generateCreateArgs(m));
  if (available.hasCreateManyInput) lines.push(generateCreateManyArgs(m));
  if (available.hasUpdateInput && available.hasWhereUniqueInput) lines.push(generateUpdateArgs(m));
  if (available.hasUpdateManyInput && available.hasWhereInput)
    lines.push(generateUpdateManyArgs(m));
  if (available.hasCreateInput && available.hasUpdateInput && available.hasWhereUniqueInput) {
    lines.push(generateUpsertArgs(m));
  }

  return lines.join('\n');
}

function generateFindManyArgs(m: string, a: AvailableInputs): string {
  return `@ArgsType()
export class FindMany${m}Args {
  @Field(() => ${m}WhereInput, { nullable: true })
  where?: ${m}WhereInput;
${
  a.hasOrderByInput
    ? `
  @Field(() => [${m}OrderByWithRelationInput], { nullable: true })
  orderBy?: ${m}OrderByWithRelationInput[];
`
    : ''
}${
    a.hasWhereUniqueInput
      ? `
  @Field(() => ${m}WhereUniqueInput, { nullable: true })
  cursor?: ${m}WhereUniqueInput;
`
      : ''
  }
  @Field(() => Int, { nullable: true })
  take?: number;

  @Field(() => Int, { nullable: true })
  skip?: number;

  @Field(() => [${m}ScalarFieldEnum], { nullable: true })
  distinct?: ${m}ScalarFieldEnum[];
}
`;
}

function generateFindFirstArgs(m: string, a: AvailableInputs): string {
  return `@ArgsType()
export class FindFirst${m}Args {
  @Field(() => ${m}WhereInput, { nullable: true })
  where?: ${m}WhereInput;
${
  a.hasOrderByInput
    ? `
  @Field(() => [${m}OrderByWithRelationInput], { nullable: true })
  orderBy?: ${m}OrderByWithRelationInput[];
`
    : ''
}${
    a.hasWhereUniqueInput
      ? `
  @Field(() => ${m}WhereUniqueInput, { nullable: true })
  cursor?: ${m}WhereUniqueInput;
`
      : ''
  }
  @Field(() => Int, { nullable: true })
  take?: number;

  @Field(() => Int, { nullable: true })
  skip?: number;

  @Field(() => [${m}ScalarFieldEnum], { nullable: true })
  distinct?: ${m}ScalarFieldEnum[];
}
`;
}

function generateFindUniqueArgs(m: string): string {
  return `@ArgsType()
export class FindUnique${m}Args {
  @Field(() => ${m}WhereUniqueInput)
  where!: ${m}WhereUniqueInput;
}
`;
}

function generateCreateArgs(m: string): string {
  return `@ArgsType()
export class Create${m}Args {
  @Field(() => ${m}CreateInput)
  data!: ${m}CreateInput;
}
`;
}

function generateCreateManyArgs(m: string): string {
  return `@ArgsType()
export class CreateMany${m}Args {
  @Field(() => [${m}CreateManyInput])
  data!: ${m}CreateManyInput[];
}
`;
}

function generateUpdateArgs(m: string): string {
  return `@ArgsType()
export class Update${m}Args {
  @Field(() => ${m}UpdateInput)
  data!: ${m}UpdateInput;

  @Field(() => ${m}WhereUniqueInput)
  where!: ${m}WhereUniqueInput;
}
`;
}

function generateUpdateManyArgs(m: string): string {
  return `@ArgsType()
export class UpdateMany${m}Args {
  @Field(() => ${m}UpdateManyMutationInput)
  data!: ${m}UpdateManyMutationInput;

  @Field(() => ${m}WhereInput, { nullable: true })
  where?: ${m}WhereInput;
}
`;
}

function generateUpsertArgs(m: string): string {
  return `@ArgsType()
export class Upsert${m}Args {
  @Field(() => ${m}WhereUniqueInput)
  where!: ${m}WhereUniqueInput;

  @Field(() => ${m}CreateInput)
  create!: ${m}CreateInput;

  @Field(() => ${m}UpdateInput)
  update!: ${m}UpdateInput;
}
`;
}

function generateDeleteArgs(m: string): string {
  return `@ArgsType()
export class Delete${m}Args {
  @Field(() => ${m}WhereUniqueInput)
  where!: ${m}WhereUniqueInput;
}
`;
}

function generateDeleteManyArgs(m: string): string {
  return `@ArgsType()
export class DeleteMany${m}Args {
  @Field(() => ${m}WhereInput, { nullable: true })
  where?: ${m}WhereInput;
}
`;
}

function generateAggregateArgs(m: string, a: AvailableInputs): string {
  return `@ArgsType()
export class Aggregate${m}Args {
  @Field(() => ${m}WhereInput, { nullable: true })
  where?: ${m}WhereInput;
${
  a.hasOrderByInput
    ? `
  @Field(() => [${m}OrderByWithRelationInput], { nullable: true })
  orderBy?: ${m}OrderByWithRelationInput[];
`
    : ''
}${
    a.hasWhereUniqueInput
      ? `
  @Field(() => ${m}WhereUniqueInput, { nullable: true })
  cursor?: ${m}WhereUniqueInput;
`
      : ''
  }
  @Field(() => Int, { nullable: true })
  take?: number;

  @Field(() => Int, { nullable: true })
  skip?: number;
}
`;
}

function generateGroupByArgs(m: string, a: AvailableInputs): string {
  return `@ArgsType()
export class GroupBy${m}Args {
  @Field(() => ${m}WhereInput, { nullable: true })
  where?: ${m}WhereInput;
${
  a.hasOrderByInput
    ? `
  @Field(() => [${m}OrderByWithRelationInput], { nullable: true })
  orderBy?: ${m}OrderByWithRelationInput[];
`
    : ''
}
  @Field(() => [${m}ScalarFieldEnum])
  by!: ${m}ScalarFieldEnum[];
${
  a.hasScalarWhereWithAggregates
    ? `
  @Field(() => ${m}ScalarWhereWithAggregatesInput, { nullable: true })
  having?: ${m}ScalarWhereWithAggregatesInput;
`
    : ''
}
  @Field(() => Int, { nullable: true })
  take?: number;

  @Field(() => Int, { nullable: true })
  skip?: number;
}
`;
}

// ============ Resolver ============

function generateModelResolver(
  model: Model,
  ops: AvailableInputs,
  config: GeneratorConfig,
): string {
  const m = model.name;
  const lowerName = camelCase(m);
  const pluralName = pluralize(lowerName);
  const isAlreadyPlural = pluralName === lowerName;
  const findManyMethod = isAlreadyPlural ? `findMany${m}` : pluralName;
  const findUniqueMethod = isAlreadyPlural ? `findUnique${m}` : lowerName;

  const lines: string[] = [];
  const prismaClientPath = config.prismaClientPath || '@prisma/client';

  // Check if any mutations will be generated
  const hasMutations =
    ops.hasCreateInput ||
    ops.hasCreateManyInput ||
    (ops.hasUpdateInput && ops.hasWhereUniqueInput) ||
    (ops.hasUpdateManyInput && ops.hasWhereInput) ||
    ops.hasWhereUniqueInput ||
    ops.hasWhereInput; // delete operations

  // Imports
  const nestjsImports = ['Resolver', 'Query', 'Args', 'Info', 'Int', 'Context'];
  if (hasMutations) nestjsImports.push('Mutation');

  lines.push(`import { ${nestjsImports.join(', ')} } from '@nestjs/graphql';`);
  lines.push(`import { GraphQLResolveInfo } from 'graphql';`);
  lines.push(`import { PrismaClient } from '${prismaClientPath}';`);
  lines.push(`import { ${m} } from './model';`);
  lines.push(`import { AffectedRows } from '../common/AffectedRows';`);
  lines.push(`import { transformInfoIntoPrismaArgs, GraphQLContext } from '../helpers';`);

  const argsImports: string[] = [];
  if (ops.hasWhereInput)
    argsImports.push(`FindMany${m}Args`, `FindFirst${m}Args`, `DeleteMany${m}Args`);
  if (ops.hasWhereUniqueInput) argsImports.push(`FindUnique${m}Args`, `Delete${m}Args`);
  if (ops.hasCreateInput) argsImports.push(`Create${m}Args`);
  if (ops.hasCreateManyInput) argsImports.push(`CreateMany${m}Args`);
  if (ops.hasUpdateInput && ops.hasWhereUniqueInput) argsImports.push(`Update${m}Args`);
  if (ops.hasUpdateManyInput && ops.hasWhereInput) argsImports.push(`UpdateMany${m}Args`);
  if (ops.hasCreateInput && ops.hasUpdateInput && ops.hasWhereUniqueInput)
    argsImports.push(`Upsert${m}Args`);

  if (argsImports.length > 0) {
    lines.push(`import { ${argsImports.join(', ')} } from './args';`);
  }

  lines.push('');
  lines.push(`@Resolver(() => ${m})`);
  lines.push(`export class ${m}Resolver {`);

  // Queries
  if (ops.hasWhereInput) {
    lines.push(
      resolverMethod(
        'Query',
        findManyMethod,
        `FindMany${m}Args`,
        `[${m}]`,
        `Promise<${m}[]>`,
        lowerName,
        'findMany',
      ),
    );
    lines.push(
      resolverMethod(
        'Query',
        `findFirst${m}`,
        `FindFirst${m}Args`,
        m,
        `Promise<${m} | null>`,
        lowerName,
        'findFirst',
        true,
      ),
    );
  }
  if (ops.hasWhereUniqueInput) {
    lines.push(
      resolverMethod(
        'Query',
        findUniqueMethod,
        `FindUnique${m}Args`,
        m,
        `Promise<${m} | null>`,
        lowerName,
        'findUnique',
        true,
      ),
    );
  }

  // Mutations
  if (ops.hasCreateInput) {
    lines.push(
      resolverMethod(
        'Mutation',
        `createOne${m}`,
        `Create${m}Args`,
        m,
        `Promise<${m}>`,
        lowerName,
        'create',
      ),
    );
  }
  if (ops.hasCreateManyInput) {
    lines.push(
      resolverMethod(
        'Mutation',
        `createMany${m}`,
        `CreateMany${m}Args`,
        'AffectedRows',
        'Promise<AffectedRows>',
        lowerName,
        'createMany',
      ),
    );
  }
  if (ops.hasUpdateInput && ops.hasWhereUniqueInput) {
    lines.push(
      resolverMethod(
        'Mutation',
        `updateOne${m}`,
        `Update${m}Args`,
        m,
        `Promise<${m} | null>`,
        lowerName,
        'update',
        true,
      ),
    );
  }
  if (ops.hasUpdateManyInput && ops.hasWhereInput) {
    lines.push(
      resolverMethod(
        'Mutation',
        `updateMany${m}`,
        `UpdateMany${m}Args`,
        'AffectedRows',
        'Promise<AffectedRows>',
        lowerName,
        'updateMany',
      ),
    );
  }
  if (ops.hasCreateInput && ops.hasUpdateInput && ops.hasWhereUniqueInput) {
    lines.push(
      resolverMethod(
        'Mutation',
        `upsertOne${m}`,
        `Upsert${m}Args`,
        m,
        `Promise<${m}>`,
        lowerName,
        'upsert',
      ),
    );
  }
  if (ops.hasWhereUniqueInput) {
    lines.push(
      resolverMethod(
        'Mutation',
        `deleteOne${m}`,
        `Delete${m}Args`,
        m,
        `Promise<${m} | null>`,
        lowerName,
        'delete',
        true,
      ),
    );
  }
  if (ops.hasWhereInput) {
    lines.push(
      resolverMethod(
        'Mutation',
        `deleteMany${m}`,
        `DeleteMany${m}Args`,
        'AffectedRows',
        'Promise<AffectedRows>',
        lowerName,
        'deleteMany',
      ),
    );
  }

  lines.push('}');
  return lines.join('\n');
}

function resolverMethod(
  type: 'Query' | 'Mutation',
  methodName: string,
  argsType: string,
  graphqlReturn: string,
  tsReturn: string,
  prismaModel: string,
  prismaMethod: string,
  nullable = false,
): string {
  const nullableOpt = nullable ? ', { nullable: true }' : '';
  return `
  @${type}(() => ${graphqlReturn}${nullableOpt})
  async ${methodName}(
    @Context() ctx: GraphQLContext<PrismaClient>,
    @Info() info: GraphQLResolveInfo,
    @Args() args: ${argsType},
  ): ${tsReturn} {
    const select = transformInfoIntoPrismaArgs(info);
    return ctx.prisma.${prismaModel}.${prismaMethod}({ ...args, ...select } as any);
  }
`;
}

// ============ Model Index ============

function generateModelIndex(config: GeneratorConfig, hasInputs: boolean): string {
  const lines: string[] = [];
  lines.push(`export * from './model';`);
  if (hasInputs) lines.push(`export * from './inputs';`);
  lines.push(`export * from './args';`);
  if (config.generateResolvers) lines.push(`export * from './resolver';`);
  return lines.join('\n');
}

// ============ Enums ============

function generateEnumsGrouped(dmmf: DMMFDocument): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const enumDef of dmmf.enums) {
    const values = enumDef.values.map(v => `  ${v.name} = '${v.name}',`).join('\n');
    const desc = enumDef.documentation ? `'${escapeStr(enumDef.documentation)}'` : 'undefined';

    files.push({
      path: `enums/${enumDef.name}.ts`,
      content: `import { registerEnumType } from '@nestjs/graphql';

export enum ${enumDef.name} {
${values}
}

registerEnumType(${enumDef.name}, {
  name: '${enumDef.name}',
  description: ${desc},
});
`,
    });
  }

  // Index file
  const exports = dmmf.enums.map(e => `export * from './${e.name}';`).join('\n');
  files.push({ path: 'enums/index.ts', content: exports + '\n' });

  return files;
}

// ============ Common Types ============

function generateCommonTypesGrouped(
  dmmf: DMMFDocument,
  allModelNames: Set<string>,
): GeneratedFile[] {
  const files: GeneratedFile[] = [
    {
      path: 'common/AffectedRows.ts',
      content: `import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class AffectedRows {
  @Field(() => Int)
  count!: number;
}
`,
    },
  ];

  // Generate shared input types (types that don't belong to any model)
  const sharedInputTypes = getSharedInputTypes(dmmf, allModelNames);
  if (sharedInputTypes.length > 0) {
    files.push({
      path: 'common/inputs.ts',
      content: generateSharedInputs(sharedInputTypes, dmmf, allModelNames),
    });
  }

  // Generate index file
  const indexExports = [`export * from './AffectedRows';`];
  if (sharedInputTypes.length > 0) {
    indexExports.push(`export * from './inputs';`);
  }

  files.push({
    path: 'common/index.ts',
    content: indexExports.join('\n') + '\n',
  });

  return files;
}

/**
 * Get input types that don't belong to any model (shared types like IntFilter, StringFilter, etc.)
 */
function getSharedInputTypes(dmmf: DMMFDocument, allModelNames: Set<string>): InputType[] {
  const result: InputType[] = [];

  for (const [name, inputType] of dmmf.inputTypes) {
    const owningModel = findOwningModel(name, allModelNames);
    if (!owningModel) {
      result.push(inputType);
    }
  }

  return result;
}

/**
 * Generate shared input types file
 */
function generateSharedInputs(
  inputTypes: InputType[],
  dmmf: DMMFDocument,
  allModelNames: Set<string>,
): string {
  const lines: string[] = [];
  const hasJson = inputTypes.some(it => it.fields.some(f => f.type === 'Json'));
  const hasBigInt = inputTypes.some(it => it.fields.some(f => f.type === 'BigInt'));

  // Collect enums
  const enumTypes = new Set<string>();
  for (const it of inputTypes) {
    for (const f of it.fields) {
      if (dmmf.isEnum(f.type)) enumTypes.add(f.type);
    }
  }

  // Imports
  lines.push(`import { InputType, Field, Int, Float } from '@nestjs/graphql';`);
  if (hasJson) lines.push(`import { GraphQLJSON } from 'graphql-type-json';`);
  if (hasBigInt) lines.push(`import { GraphQLBigInt } from 'graphql-scalars';`);
  if (enumTypes.size > 0) lines.push(`import { ${[...enumTypes].join(', ')} } from '../enums';`);
  lines.push('');

  for (const inputType of inputTypes) {
    lines.push(generateSharedInputClass(inputType, dmmf, allModelNames));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate a shared input class (for common/inputs.ts)
 */
function generateSharedInputClass(
  inputType: InputType,
  dmmf: DMMFDocument,
  allModelNames: Set<string>,
): string {
  const lines: string[] = [];
  lines.push(`@InputType()`);
  lines.push(`export class ${inputType.name} {`);

  for (const field of inputType.fields) {
    lines.push(generateSharedInputField(field, dmmf, inputType.name, allModelNames));
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate a field for a shared input class
 */
function generateSharedInputField(
  field: { name: string; type: string; isList: boolean; isRequired: boolean },
  dmmf: DMMFDocument,
  currentTypeName: string,
  allModelNames: Set<string>,
): string {
  const { graphqlType, tsType, isInputObjectType } = getInputFieldTypes(field, dmmf);
  const lines: string[] = [];

  let typeArg: string;
  if (isInputObjectType && graphqlType !== currentTypeName) {
    const owningModel = findOwningModel(graphqlType, allModelNames);

    if (owningModel) {
      // Belongs to a model - use require
      typeArg = field.isList
        ? `() => [require('../${owningModel}/inputs').${graphqlType}]`
        : `() => require('../${owningModel}/inputs').${graphqlType}`;
    } else {
      // Another shared type - local reference (same file)
      typeArg = field.isList ? `() => [${graphqlType}]` : `() => ${graphqlType}`;
    }
  } else {
    typeArg = field.isList ? `() => [${graphqlType}]` : `() => ${graphqlType}`;
  }

  const optionsStr = !field.isRequired ? ', { nullable: true }' : '';
  lines.push(`  @Field(${typeArg}${optionsStr})`);

  let propertyType = tsType;
  if (field.isList) propertyType = `${tsType}[]`;
  if (!field.isRequired) propertyType = `${propertyType} | undefined`;

  const modifier = field.isRequired ? '!' : '?';
  lines.push(`  ${field.name}${modifier}: ${propertyType};`);
  lines.push('');

  return lines.join('\n');
}

// ============ Helpers ============

function generateHelpersGrouped(): GeneratedFile {
  return {
    path: 'helpers.ts',
    content: `import { parseResolveInfo, ResolveTree, FieldsByTypeName } from 'graphql-parse-resolve-info';
import type { GraphQLResolveInfo } from 'graphql';

export interface PrismaSelect {
  select?: Record<string, boolean | PrismaSelect>;
  include?: Record<string, boolean | PrismaSelect>;
}

/**
 * Context type that should contain the Prisma client.
 * Extend this interface in your app to add custom properties.
 * 
 * @example
 * // In your app
 * interface AppContext extends GraphQLContext {
 *   req: Request;
 *   user?: User;
 * }
 */
export interface GraphQLContext<PrismaClient = unknown> {
  prisma: PrismaClient;
  [key: string]: unknown;
}

export function transformInfoIntoPrismaArgs(info: GraphQLResolveInfo): PrismaSelect {
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

export function getPrismaFromContext<PrismaClient = unknown>(
  context: GraphQLContext<PrismaClient>,
): PrismaClient {
  const prismaClient = context.prisma;
  if (!prismaClient) {
    throw new Error(
      'Unable to find Prisma Client in GraphQL context. ' +
      'Please provide it under the \`context["prisma"]\` key.'
    );
  }
  return prismaClient;
}

export function mergePrismaSelects(...selects: PrismaSelect[]): PrismaSelect {
  const result: PrismaSelect = {};
  for (const s of selects) {
    if (s.select) result.select = { ...(result.select ?? {}), ...s.select };
    if (s.include) result.include = { ...(result.include ?? {}), ...s.include };
  }
  return result;
}
`,
  };
}

// ============ Root Index ============

function generateRootIndexGrouped(dmmf: DMMFDocument, inputTypeNames: Set<string>): GeneratedFile {
  const lines: string[] = [];
  lines.push(`export * from './enums';`);
  lines.push(`export * from './common';`);
  lines.push(`export * from './helpers';`);

  // Export model types explicitly to avoid conflicts
  const modelExports: string[] = [];
  for (const model of dmmf.models) {
    const hasWhereInput = inputTypeNames.has(`${model.name}WhereInput`);
    const hasWhereUniqueInput = inputTypeNames.has(`${model.name}WhereUniqueInput`);
    if (hasWhereInput || hasWhereUniqueInput) {
      // Export only the model class and resolver to avoid input type conflicts
      modelExports.push(`export { ${model.name} } from './${model.name}/model';`);
    }
  }
  lines.push(...modelExports);

  return { path: 'index.ts', content: lines.join('\n') + '\n' };
}

// ============ Utilities ============

function escapeStr(text: string): string {
  return text.replace(/'/g, "\\'").replace(/\n/g, '\\n');
}
