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
  /** True if the model is read-only (e.g., a database view) - no mutation inputs exist */
  isReadOnly: boolean;
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
  files.push(...generateEnumsGrouped(dmmf, config));

  // Generate common types (including shared input types like IntFilter, StringFilter, etc.)
  files.push(...generateCommonTypesGrouped(dmmf, allModelNames, config));

  // Generate helpers
  files.push(generateHelpersGrouped(config));

  // Generate per-model files under models/ folder
  for (const model of dmmf.models) {
    files.push(...generateModelGrouped(model, dmmf, config, inputTypeNames, allModelNames));
  }

  // Generate models/index.ts that exports all models
  files.push(generateModelsIndex(dmmf, inputTypeNames));

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
  const modelDir = `models/${model.name}`;

  const hasCreateInput = inputTypeNames.has(`${model.name}CreateInput`);
  const hasCreateManyInput = inputTypeNames.has(`${model.name}CreateManyInput`);
  const hasUpdateInput = inputTypeNames.has(`${model.name}UpdateInput`);
  const hasUpdateManyInput = inputTypeNames.has(`${model.name}UpdateManyMutationInput`);

  // A model is read-only (e.g., a database view) if it has no mutation-related inputs
  const isReadOnly =
    !hasCreateInput && !hasCreateManyInput && !hasUpdateInput && !hasUpdateManyInput;

  const available: AvailableInputs = {
    hasWhereInput: inputTypeNames.has(`${model.name}WhereInput`),
    hasWhereUniqueInput: inputTypeNames.has(`${model.name}WhereUniqueInput`),
    hasOrderByInput: inputTypeNames.has(`${model.name}OrderByWithRelationInput`),
    hasCreateInput,
    hasCreateManyInput,
    hasUpdateInput,
    hasUpdateManyInput,
    hasScalarWhereWithAggregates: inputTypeNames.has(`${model.name}ScalarWhereWithAggregatesInput`),
    isReadOnly,
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
      content: generateModelInputs(model, modelInputTypes, dmmf, allModelNames, config),
    });
  }

  // Generate args.ts
  files.push({
    path: `${modelDir}/args.ts`,
    content: generateModelArgs(model, available),
  });

  // Generate resolver.ts
  const relationFields = model.fields.filter(f => isRelationField(f));
  const hasRelations = relationFields.length > 0;

  if (config.generateResolvers) {
    files.push({
      path: `${modelDir}/resolver.ts`,
      content: generateModelResolver(model, available, config),
    });

    // Generate relations.ts (separate file for relation resolvers)
    if (hasRelations) {
      files.push({
        path: `${modelDir}/relations.ts`,
        content: generateRelationsResolver(model, config, dmmf),
      });
    }

    // Generate aggregations.ts (separate file for aggregate/groupBy)
    if (available.hasWhereInput) {
      files.push({
        path: `${modelDir}/aggregations.ts`,
        content: generateAggregationsFile(model, available, config),
      });
    }
  }

  // Generate index.ts
  files.push({
    path: `${modelDir}/index.ts`,
    content: generateModelIndex(
      model.name,
      config,
      modelInputTypes.length > 0,
      available.hasWhereInput,
      hasRelations,
    ),
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
  const hasDecimal = model.fields.some(f => f.type === 'Decimal');
  const relationFields = model.fields.filter(f => isRelationField(f));
  const scalarFields = model.fields.filter(f => !isRelationField(f));
  const relatedModels = [...new Set(relationFields.map(f => f.type))].filter(m => m !== model.name);
  const enumFields = model.fields.filter(f => isEnumField(f));
  const enumTypes = [...new Set(enumFields.map(f => f.type))];

  // Imports - paths are relative to models/{ModelName}/model.ts
  lines.push(`import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';`);
  const scalarImports: string[] = [];
  if (hasJson) scalarImports.push('GraphQLJSON');
  if (hasBigInt) scalarImports.push('GraphQLBigInt');
  if (scalarImports.length > 0) {
    lines.push(`import { ${scalarImports.join(', ')} } from 'graphql-scalars';`);
  }
  // Import GraphQLDecimal from helpers
  if (hasDecimal) {
    lines.push(`import { GraphQLDecimal } from '../../helpers';`);
  }
  // Import Prisma namespace for Decimal type
  if (hasDecimal) {
    const prismaClientPath = config.prismaClientPath || '@prisma/client';
    lines.push(`import { Prisma } from '${prismaClientPath}';`);
  }
  // Import related models for the relation field types
  if (relatedModels.length > 0) {
    for (const relatedModel of relatedModels) {
      lines.push(`import type { ${relatedModel} } from '../${relatedModel}/model';`);
    }
  }
  if (enumTypes.length > 0) {
    lines.push(`import { ${enumTypes.join(', ')} } from '../../enums';`);
  }

  lines.push('');

  // Single class with scalar fields having @Field() and relation fields as plain properties
  // Relations are resolved by @ResolveField() in the relations resolver
  const className = `${config.typePrefix ?? ''}${model.name}${config.typeSuffix ?? ''}`;
  const descOption = model.documentation
    ? `{ description: '${escapeStr(model.documentation)}' }`
    : '';
  lines.push(`@ObjectType(${descOption})`);
  lines.push(`export class ${className} {`);

  // Scalar fields with @Field()
  for (const field of scalarFields) {
    lines.push(generateModelField(field, dmmf, config));
  }

  // Relation fields as plain properties (no @Field() - resolved by @ResolveField())
  for (const field of relationFields) {
    lines.push(generateRelationProperty(field));
  }

  lines.push('}');

  return lines.join('\n');
}

function generateRelationProperty(field: ModelField): string {
  const relatedType = field.type;
  let propertyType = relatedType;
  if (field.isList) propertyType = `${propertyType}[]`;
  if (!field.isRequired) propertyType = `${propertyType} | null`;

  const modifier = field.isRequired || field.isList ? '!' : '?';
  return `  ${field.name}${modifier}: ${propertyType};\n`;
}

function generateModelField(
  field: ModelField,
  _dmmf: DMMFDocument,
  _config: GeneratorConfig,
): string {
  const { graphqlType, tsType } = getFieldTypes(field);
  const lines: string[] = [];

  // Generate @Field() decorator for scalar/enum fields
  const typeArg = field.isList ? `() => [${graphqlType}]` : `() => ${graphqlType}`;
  const options: string[] = [];
  if (!field.isRequired && !field.isList) options.push('nullable: true');
  if (field.documentation) options.push(`description: '${escapeStr(field.documentation)}'`);
  const optionsStr = options.length > 0 ? `, { ${options.join(', ')} }` : '';
  lines.push(`  @Field(${typeArg}${optionsStr})`);

  let propertyType = tsType;
  if (field.isList) propertyType = `${propertyType}[]`;
  if (!field.isRequired) propertyType = `${propertyType} | null`;

  const modifier = field.isRequired || field.isList ? '!' : '?';
  lines.push(`  ${field.name}${modifier}: ${propertyType};`);
  lines.push('');

  return lines.join('\n');
}

function getFieldTypes(field: ModelField): { graphqlType: string; tsType: string } {
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

/**
 * Collect all external input type references for a model's inputs
 */
function collectExternalInputRefs(
  inputTypes: InputType[],
  dmmf: DMMFDocument,
  modelName: string,
  allModelNames: Set<string>,
): { commonInputs: Set<string>; modelInputs: Map<string, Set<string>> } {
  const commonInputs = new Set<string>();
  const modelInputs = new Map<string, Set<string>>();

  for (const inputType of inputTypes) {
    for (const field of inputType.fields) {
      const { isInputObjectType, graphqlType } = getInputFieldTypes(field, dmmf);
      if (isInputObjectType && graphqlType !== inputType.name) {
        const owningModel = findOwningModel(graphqlType, allModelNames);
        if (!owningModel) {
          // Shared/common input
          commonInputs.add(graphqlType);
        } else if (owningModel !== modelName) {
          // Different model
          if (!modelInputs.has(owningModel)) {
            modelInputs.set(owningModel, new Set());
          }
          modelInputs.get(owningModel)!.add(graphqlType);
        }
      }
    }
  }

  return { commonInputs, modelInputs };
}

function generateModelInputs(
  model: Model,
  inputTypes: InputType[],
  dmmf: DMMFDocument,
  allModelNames: Set<string>,
  config: GeneratorConfig,
): string {
  const lines: string[] = [];
  const hasJson = inputTypes.some(it => it.fields.some(f => f.type === 'Json'));
  const hasBigInt = inputTypes.some(it => it.fields.some(f => f.type === 'BigInt'));
  const hasDecimal = inputTypes.some(it => it.fields.some(f => f.type === 'Decimal'));

  // Collect enums
  const enumTypes = new Set<string>();
  for (const it of inputTypes) {
    for (const f of it.fields) {
      if (dmmf.isEnum(f.type)) enumTypes.add(f.type);
    }
  }

  // Collect external input references
  const { commonInputs, modelInputs } = collectExternalInputRefs(
    inputTypes,
    dmmf,
    model.name,
    allModelNames,
  );

  // Imports
  lines.push(`import { InputType, Field, Int, Float } from '@nestjs/graphql';`);
  const scalarImports: string[] = [];
  if (hasJson) scalarImports.push('GraphQLJSON');
  if (hasBigInt) scalarImports.push('GraphQLBigInt');
  if (scalarImports.length > 0) {
    lines.push(`import { ${scalarImports.join(', ')} } from 'graphql-scalars';`);
  }
  // Import GraphQLDecimal from helpers
  if (hasDecimal) {
    lines.push(`import { GraphQLDecimal } from '../../helpers';`);
  }
  // Import Prisma namespace for Decimal type
  if (hasDecimal) {
    const prismaClientPath = config.prismaClientPath || '@prisma/client';
    lines.push(`import { Prisma } from '${prismaClientPath}';`);
  }
  if (enumTypes.size > 0) lines.push(`import { ${[...enumTypes].join(', ')} } from '../../enums';`);
  if (commonInputs.size > 0) {
    lines.push(`import { ${[...commonInputs].join(', ')} } from '../../common/inputs';`);
  }
  for (const [otherModel, types] of modelInputs) {
    lines.push(`import { ${[...types].join(', ')} } from '../${otherModel}/inputs';`);
  }
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
  _modelName: string,
  _allModelNames: Set<string>,
): string {
  const { graphqlType, tsType, isInputObjectType } = getInputFieldTypes(field, dmmf);
  const lines: string[] = [];

  let typeArg: string;
  if (isInputObjectType && graphqlType !== currentTypeName) {
    // All external types are now imported at the top, so we can use direct references
    typeArg = field.isList ? `() => [${graphqlType}]` : `() => ${graphqlType}`;
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
      // Note: compound unique inputs have pattern like {FieldNames}CompoundUniqueInput
      if (
        remainder.length === 0 ||
        /^(Where|Create|Update|Upsert|Delete|OrderBy|Scalar|List|Nullable|Nested|Unchecked|Count|Avg|Sum|Min|Max|Aggregate|GroupBy|RelationFilter)/.test(
          remainder,
        ) ||
        /CompoundUniqueInput$/.test(remainder)
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
  lines.push(`import { ${m}ScalarFieldEnum } from '../../enums';`);
  lines.push('');

  // Generate args classes
  if (available.hasWhereInput) {
    lines.push(generateFindManyArgs(m, available));
    lines.push(generateFindFirstArgs(m, available));
    // Only generate delete args for non-read-only models (not views)
    if (!available.isReadOnly) {
      lines.push(generateDeleteManyArgs(m));
    }
    lines.push(generateAggregateArgs(m, available));
    lines.push(generateGroupByArgs(m, available));
  }
  if (available.hasWhereUniqueInput) {
    lines.push(generateFindUniqueArgs(m));
    // Only generate delete args for non-read-only models (not views)
    if (!available.isReadOnly) {
      lines.push(generateDeleteArgs(m));
    }
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

  // Check if any mutations will be generated (views/read-only models have no mutations)
  const hasMutations =
    !ops.isReadOnly &&
    (ops.hasCreateInput ||
      ops.hasCreateManyInput ||
      (ops.hasUpdateInput && ops.hasWhereUniqueInput) ||
      (ops.hasUpdateManyInput && ops.hasWhereInput) ||
      ops.hasWhereUniqueInput ||
      ops.hasWhereInput); // delete operations

  // Imports
  const nestjsImports = ['Resolver', 'Query', 'Args', 'Info', 'Context'];
  if (hasMutations) nestjsImports.push('Mutation');

  lines.push(`import { ${nestjsImports.join(', ')} } from '@nestjs/graphql';`);
  lines.push(`import { GraphQLResolveInfo } from 'graphql';`);
  lines.push(`import { PrismaClient } from '${prismaClientPath}';`);
  lines.push(`import { ${m} } from './model';`);
  lines.push(`import { AffectedRows } from '../../common/AffectedRows';`);
  lines.push(`import { transformInfoIntoPrismaArgs, GraphQLContext } from '../../helpers';`);

  const argsImports: string[] = [];
  if (ops.hasWhereInput) argsImports.push(`FindMany${m}Args`, `FindFirst${m}Args`);
  if (ops.hasWhereUniqueInput) argsImports.push(`FindUnique${m}Args`);
  // Only include delete args for non-read-only models
  if (!ops.isReadOnly && ops.hasWhereInput) argsImports.push(`DeleteMany${m}Args`);
  if (!ops.isReadOnly && ops.hasWhereUniqueInput) argsImports.push(`Delete${m}Args`);
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
        `${m}`,
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
        `${m}`,
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
        `${m}`,
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
        `${m}`,
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
        `${m}`,
        `Promise<${m}>`,
        lowerName,
        'upsert',
      ),
    );
  }
  // Delete mutations - only for non-read-only models (not views)
  if (!ops.isReadOnly && ops.hasWhereUniqueInput) {
    lines.push(
      resolverMethod(
        'Mutation',
        `deleteOne${m}`,
        `Delete${m}Args`,
        `${m}`,
        `Promise<${m} | null>`,
        lowerName,
        'delete',
        true,
      ),
    );
  }
  if (!ops.isReadOnly && ops.hasWhereInput) {
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

// ============ Relations Resolver ============

function generateRelationsResolver(
  model: Model,
  _config: GeneratorConfig,
  dmmf: DMMFDocument,
): string {
  const m = model.name;
  const relationFields = model.fields.filter(f => isRelationField(f));
  const listRelations = relationFields.filter(f => f.isList);

  const lines: string[] = [];

  // Imports
  lines.push(`import { Resolver, ResolveField, Parent, Args, Int } from '@nestjs/graphql';`);
  lines.push(`import { ${m} } from './model';`);

  // Import related model types for return types
  const relatedModelsToImport = new Set(relationFields.map(f => f.type).filter(t => t !== m));
  for (const relatedModel of relatedModelsToImport) {
    lines.push(`import { ${relatedModel} } from '../${relatedModel}/model';`);
  }

  // Import related input types for @ResolveField() arguments
  const relatedInputImports = new Map<string, Set<string>>();
  for (const field of listRelations) {
    const relatedModelName = field.type;
    const whereInput = `${relatedModelName}WhereInput`;
    const orderByInput = `${relatedModelName}OrderByWithRelationInput`;

    if (dmmf.inputTypes.has(whereInput)) {
      if (!relatedInputImports.has(relatedModelName)) {
        relatedInputImports.set(relatedModelName, new Set());
      }
      relatedInputImports.get(relatedModelName)!.add(whereInput);
    }
    if (dmmf.inputTypes.has(orderByInput)) {
      if (!relatedInputImports.has(relatedModelName)) {
        relatedInputImports.set(relatedModelName, new Set());
      }
      relatedInputImports.get(relatedModelName)!.add(orderByInput);
    }
  }
  for (const [relatedModel, inputs] of relatedInputImports) {
    const importPath = relatedModel === m ? './inputs' : `../${relatedModel}/inputs`;
    lines.push(`import { ${[...inputs].join(', ')} } from '${importPath}';`);
  }

  lines.push('');
  lines.push(`@Resolver(() => ${m})`);
  lines.push(`export class ${m}RelationsResolver {`);

  // Add @ResolveField() methods for ALL relation fields
  for (const field of relationFields) {
    const relatedModelName = field.type;
    const fieldName = field.name;
    const isList = field.isList;
    const relatedType = `${relatedModelName}`;
    const returnTypeExpr = isList ? `[${relatedType}]` : relatedType;
    const nullable = !field.isRequired;

    // Build parameters
    const params: string[] = [`@Parent() parent: ${m}`];

    // Only list relations get filtering/pagination args
    if (isList) {
      const hasWhereInput = dmmf.inputTypes.has(`${relatedModelName}WhereInput`);
      const hasOrderByInput = dmmf.inputTypes.has(`${relatedModelName}OrderByWithRelationInput`);

      if (hasWhereInput) {
        params.push(
          `@Args('where', { type: () => ${relatedModelName}WhereInput, nullable: true }) _where?: ${relatedModelName}WhereInput`,
        );
      }
      if (hasOrderByInput) {
        params.push(
          `@Args('orderBy', { type: () => [${relatedModelName}OrderByWithRelationInput], nullable: true }) _orderBy?: ${relatedModelName}OrderByWithRelationInput[]`,
        );
      }
      params.push(`@Args('take', { type: () => Int, nullable: true }) _take?: number`);
      params.push(`@Args('skip', { type: () => Int, nullable: true }) _skip?: number`);
    }

    lines.push(`
  @ResolveField(() => ${returnTypeExpr}, { nullable: ${nullable} })
  ${fieldName}(
    ${params.join(',\n    ')},
  ) {
    // Data is already loaded by parent query via transformInfoIntoPrismaArgs
    // which extracts relation args (where, orderBy, take, skip) from the GraphQL query
    return parent.${fieldName};
  }
`);
  }

  lines.push('}');
  return lines.join('\n');
}

function resolverMethod(
  type: 'Query' | 'Mutation',
  methodName: string,
  argsType: string,
  graphqlReturn: string,
  _tsReturn: string,
  prismaModel: string,
  prismaMethod: string,
  nullable = false,
): string {
  const nullableOpt = nullable ? ', { nullable: true }' : '';
  // Extract the model name from prismaModel (e.g., 'user' -> 'User')
  const modelName = prismaModel.charAt(0).toUpperCase() + prismaModel.slice(1);
  return `
  @${type}(() => ${graphqlReturn}${nullableOpt})
  async ${methodName}(
    @Context() ctx: GraphQLContext<PrismaClient>,
    @Info() info: GraphQLResolveInfo,
    @Args() args: ${argsType},
  ) {
    const select = transformInfoIntoPrismaArgs(info, '${modelName}');
    return ctx.prisma.${prismaModel}.${prismaMethod}({ ...args, ...select } as any);
  }
`;
}

// ============ Aggregations ============

function generateAggregationsFile(
  model: Model,
  _ops: AvailableInputs,
  config: GeneratorConfig,
): string {
  const m = model.name;
  const lowerName = camelCase(m);
  const lines: string[] = [];
  const prismaClientPath = config.prismaClientPath || '@prisma/client';

  // Get numeric and string fields for aggregation
  const numericFields = model.fields.filter(
    f => isScalarField(f) && ['Int', 'Float', 'BigInt', 'Decimal'].includes(f.type),
  );
  const allScalarFields = model.fields.filter(f => isScalarField(f) && !isRelationField(f));

  // Check what types are needed for imports
  const hasIdField = allScalarFields.some(f => f.isId);
  const hasJsonField = allScalarFields.some(f => f.type === 'Json');
  const hasBigInt = allScalarFields.some(f => f.type === 'BigInt');
  const hasDecimal = allScalarFields.some(f => f.type === 'Decimal');

  // Build NestJS GraphQL imports
  const nestjsImports = [
    'Resolver',
    'Query',
    'Args',
    'Info',
    'Context',
    'ObjectType',
    'Field',
    'Int',
    'Float',
  ];
  if (hasIdField) nestjsImports.push('ID');

  // Imports
  lines.push(`import { ${nestjsImports.join(', ')} } from '@nestjs/graphql';`);
  lines.push(`import { GraphQLResolveInfo } from 'graphql';`);
  if (hasDecimal) {
    lines.push(`import { PrismaClient, Prisma } from '${prismaClientPath}';`);
  } else {
    lines.push(`import { PrismaClient } from '${prismaClientPath}';`);
  }

  // graphql-scalars imports
  const scalarImports: string[] = [];
  if (hasJsonField) scalarImports.push('GraphQLJSON');
  if (hasBigInt) scalarImports.push('GraphQLBigInt');
  if (scalarImports.length > 0) {
    lines.push(`import { ${scalarImports.join(', ')} } from 'graphql-scalars';`);
  }

  // Import from helpers (include GraphQLDecimal if needed)
  const helpersImports = ['transformInfoIntoPrismaAggregateArgs', 'GraphQLContext'];
  if (hasDecimal) {
    helpersImports.push('GraphQLDecimal');
  }
  lines.push(`import { ${helpersImports.join(', ')} } from '../../helpers';`);
  lines.push(`import { Aggregate${m}Args, GroupBy${m}Args } from './args';`);
  lines.push('');

  // Generate Count aggregate type
  lines.push(`@ObjectType()`);
  lines.push(`export class ${m}CountAggregate {`);
  for (const field of allScalarFields) {
    lines.push(`  @Field(() => Int, { nullable: true })`);
    lines.push(`  ${field.name}?: number;`);
    lines.push('');
  }
  lines.push(`  @Field(() => Int)`);
  lines.push(`  _all!: number;`);
  lines.push(`}`);
  lines.push('');

  // Generate Avg aggregate type (only numeric fields, always Float)
  if (numericFields.length > 0) {
    lines.push(`@ObjectType()`);
    lines.push(`export class ${m}AvgAggregate {`);
    for (const field of numericFields) {
      lines.push(`  @Field(() => Float, { nullable: true })`);
      lines.push(`  ${field.name}?: number;`);
      lines.push('');
    }
    lines.push(`}`);
    lines.push('');

    // Generate Sum aggregate type
    lines.push(`@ObjectType()`);
    lines.push(`export class ${m}SumAggregate {`);
    for (const field of numericFields) {
      const gqlType =
        field.type === 'BigInt'
          ? 'GraphQLBigInt'
          : field.type === 'Decimal'
            ? 'GraphQLDecimal'
            : field.type === 'Int'
              ? 'Int'
              : 'Float';
      const tsType =
        field.type === 'BigInt' ? 'bigint' : field.type === 'Decimal' ? 'Decimal' : 'number';
      lines.push(`  @Field(() => ${gqlType}, { nullable: true })`);
      lines.push(`  ${field.name}?: ${tsType};`);
      lines.push('');
    }
    lines.push(`}`);
    lines.push('');
  }

  // Generate Min aggregate type
  lines.push(`@ObjectType()`);
  lines.push(`export class ${m}MinAggregate {`);
  for (const field of allScalarFields) {
    const { graphqlType, tsType } = getFieldTypes(field);
    lines.push(`  @Field(() => ${graphqlType}, { nullable: true })`);
    lines.push(`  ${field.name}?: ${tsType};`);
    lines.push('');
  }
  lines.push(`}`);
  lines.push('');

  // Generate Max aggregate type
  lines.push(`@ObjectType()`);
  lines.push(`export class ${m}MaxAggregate {`);
  for (const field of allScalarFields) {
    const { graphqlType, tsType } = getFieldTypes(field);
    lines.push(`  @Field(() => ${graphqlType}, { nullable: true })`);
    lines.push(`  ${field.name}?: ${tsType};`);
    lines.push('');
  }
  lines.push(`}`);
  lines.push('');

  // Generate main Aggregate result type
  lines.push(`@ObjectType()`);
  lines.push(`export class Aggregate${m} {`);
  lines.push(`  @Field(() => ${m}CountAggregate, { nullable: true })`);
  lines.push(`  _count?: ${m}CountAggregate;`);
  lines.push('');
  if (numericFields.length > 0) {
    lines.push(`  @Field(() => ${m}AvgAggregate, { nullable: true })`);
    lines.push(`  _avg?: ${m}AvgAggregate;`);
    lines.push('');
    lines.push(`  @Field(() => ${m}SumAggregate, { nullable: true })`);
    lines.push(`  _sum?: ${m}SumAggregate;`);
    lines.push('');
  }
  lines.push(`  @Field(() => ${m}MinAggregate, { nullable: true })`);
  lines.push(`  _min?: ${m}MinAggregate;`);
  lines.push('');
  lines.push(`  @Field(() => ${m}MaxAggregate, { nullable: true })`);
  lines.push(`  _max?: ${m}MaxAggregate;`);
  lines.push(`}`);
  lines.push('');

  // Generate GroupBy result type
  lines.push(`@ObjectType()`);
  lines.push(`export class ${m}GroupBy {`);
  // Include all scalar fields as potential grouping fields
  for (const field of allScalarFields) {
    const { graphqlType, tsType } = getFieldTypes(field);
    const nullable = !field.isRequired;
    lines.push(`  @Field(() => ${graphqlType}, { nullable: ${nullable} })`);
    lines.push(`  ${field.name}${nullable ? '?' : '!'}: ${tsType}${nullable ? ' | null' : ''};`);
    lines.push('');
  }
  // Aggregate fields on groupBy
  lines.push(`  @Field(() => ${m}CountAggregate, { nullable: true })`);
  lines.push(`  _count?: ${m}CountAggregate;`);
  lines.push('');
  if (numericFields.length > 0) {
    lines.push(`  @Field(() => ${m}AvgAggregate, { nullable: true })`);
    lines.push(`  _avg?: ${m}AvgAggregate;`);
    lines.push('');
    lines.push(`  @Field(() => ${m}SumAggregate, { nullable: true })`);
    lines.push(`  _sum?: ${m}SumAggregate;`);
    lines.push('');
  }
  lines.push(`  @Field(() => ${m}MinAggregate, { nullable: true })`);
  lines.push(`  _min?: ${m}MinAggregate;`);
  lines.push('');
  lines.push(`  @Field(() => ${m}MaxAggregate, { nullable: true })`);
  lines.push(`  _max?: ${m}MaxAggregate;`);
  lines.push(`}`);
  lines.push('');

  // Generate Aggregation Resolver
  lines.push(`@Resolver()`);
  lines.push(`export class ${m}AggregateResolver {`);
  lines.push('');

  // Aggregate query
  lines.push(`  @Query(() => Aggregate${m})`);
  lines.push(`  async aggregate${m}(`);
  lines.push(`    @Context() ctx: GraphQLContext<PrismaClient>,`);
  lines.push(`    @Info() info: GraphQLResolveInfo,`);
  lines.push(`    @Args() args: Aggregate${m}Args,`);
  lines.push(`  ) {`);
  lines.push(`    const aggregateArgs = transformInfoIntoPrismaAggregateArgs(info);`);
  lines.push(`    return ctx.prisma.${lowerName}.aggregate({ ...args, ...aggregateArgs } as any);`);
  lines.push(`  }`);
  lines.push('');

  // GroupBy query
  lines.push(`  @Query(() => [${m}GroupBy])`);
  lines.push(`  async groupBy${m}(`);
  lines.push(`    @Context() ctx: GraphQLContext<PrismaClient>,`);
  lines.push(`    @Info() info: GraphQLResolveInfo,`);
  lines.push(`    @Args() args: GroupBy${m}Args,`);
  lines.push(`  ) {`);
  lines.push(`    const aggregateArgs = transformInfoIntoPrismaAggregateArgs(info);`);
  lines.push(`    return ctx.prisma.${lowerName}.groupBy({ ...args, ...aggregateArgs } as any);`);
  lines.push(`  }`);
  lines.push('');

  // Count query
  lines.push(`  @Query(() => Int)`);
  lines.push(`  async ${lowerName}Count(`);
  lines.push(`    @Context() ctx: GraphQLContext<PrismaClient>,`);
  lines.push(`    @Args() args: Aggregate${m}Args,`);
  lines.push(`  ) {`);
  lines.push(`    return ctx.prisma.${lowerName}.count({ where: args.where });`);
  lines.push(`  }`);

  lines.push(`}`);

  return lines.join('\n');
}

// ============ Model Index ============

function generateModelIndex(
  _modelName: string,
  config: GeneratorConfig,
  hasInputs: boolean,
  hasAggregations: boolean,
  hasRelations: boolean,
): string {
  const lines: string[] = [];
  lines.push(`export * from './model';`);
  if (hasInputs) lines.push(`export * from './inputs';`);
  lines.push(`export * from './args';`);
  if (config.generateResolvers) {
    lines.push(`export * from './resolver';`);
    if (hasRelations) lines.push(`export * from './relations';`);
    if (hasAggregations) lines.push(`export * from './aggregations';`);
  }
  return lines.join('\n');
}

// ============ Enums ============

function generateEnumsGrouped(dmmf: DMMFDocument, config: GeneratorConfig): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const prismaPath = config.prismaClientPath ?? '@prisma/client';

  for (const enumDef of dmmf.enums) {
    const desc = enumDef.documentation ? `'${escapeStr(enumDef.documentation)}'` : 'undefined';

    let content: string;
    if (config.usePrismaEnums) {
      // Re-export enum from Prisma client
      content = `import { registerEnumType } from '@nestjs/graphql';
import { ${enumDef.name} } from '${prismaPath}';
export { ${enumDef.name} } from '${prismaPath}';

registerEnumType(${enumDef.name}, {
  name: '${enumDef.name}',
  description: ${desc},
});
`;
    } else {
      // Generate new enum
      const values = enumDef.values.map(v => `  ${v.name} = '${v.name}',`).join('\n');
      content = `import { registerEnumType } from '@nestjs/graphql';

export enum ${enumDef.name} {
${values}
}

registerEnumType(${enumDef.name}, {
  name: '${enumDef.name}',
  description: ${desc},
});
`;
    }

    files.push({
      path: `enums/${enumDef.name}.ts`,
      content,
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
  config: GeneratorConfig,
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
      content: generateSharedInputs(sharedInputTypes, dmmf, allModelNames, config),
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
  config: GeneratorConfig,
): string {
  const lines: string[] = [];
  const hasJson = inputTypes.some(it => it.fields.some(f => f.type === 'Json'));
  const hasBigInt = inputTypes.some(it => it.fields.some(f => f.type === 'BigInt'));
  const hasDecimal = inputTypes.some(it => it.fields.some(f => f.type === 'Decimal'));

  // Collect enums
  const enumTypes = new Set<string>();
  for (const it of inputTypes) {
    for (const f of it.fields) {
      if (dmmf.isEnum(f.type)) enumTypes.add(f.type);
    }
  }

  // Collect model input references
  const modelInputs = new Map<string, Set<string>>();
  for (const inputType of inputTypes) {
    for (const field of inputType.fields) {
      const { isInputObjectType, graphqlType } = getInputFieldTypes(field, dmmf);
      if (isInputObjectType && graphqlType !== inputType.name) {
        const owningModel = findOwningModel(graphqlType, allModelNames);
        if (owningModel) {
          if (!modelInputs.has(owningModel)) {
            modelInputs.set(owningModel, new Set());
          }
          modelInputs.get(owningModel)!.add(graphqlType);
        }
      }
    }
  }

  // Imports
  lines.push(`import { InputType, Field, Int, Float } from '@nestjs/graphql';`);
  const scalarImports: string[] = [];
  if (hasJson) scalarImports.push('GraphQLJSON');
  if (hasBigInt) scalarImports.push('GraphQLBigInt');
  if (scalarImports.length > 0) {
    lines.push(`import { ${scalarImports.join(', ')} } from 'graphql-scalars';`);
  }
  // Import GraphQLDecimal from helpers
  if (hasDecimal) {
    lines.push(`import { GraphQLDecimal } from '../helpers';`);
  }
  // Import Prisma namespace for Decimal type
  if (hasDecimal) {
    const prismaClientPath = config.prismaClientPath || '@prisma/client';
    lines.push(`import { Prisma } from '${prismaClientPath}';`);
  }
  if (enumTypes.size > 0) lines.push(`import { ${[...enumTypes].join(', ')} } from '../enums';`);
  for (const [model, types] of modelInputs) {
    lines.push(`import { ${[...types].join(', ')} } from '../models/${model}/inputs';`);
  }
  lines.push('');

  for (const inputType of inputTypes) {
    lines.push(generateSharedInputClass(inputType, dmmf));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate a shared input class (for common/inputs.ts)
 */
function generateSharedInputClass(inputType: InputType, dmmf: DMMFDocument): string {
  const lines: string[] = [];
  lines.push(`@InputType()`);
  lines.push(`export class ${inputType.name} {`);

  for (const field of inputType.fields) {
    lines.push(generateSharedInputField(field, dmmf, inputType.name));
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
): string {
  const { graphqlType, tsType, isInputObjectType } = getInputFieldTypes(field, dmmf);
  const lines: string[] = [];

  // All external types are imported at the top, use direct references
  let typeArg: string;
  if (isInputObjectType && graphqlType !== currentTypeName) {
    typeArg = field.isList ? `() => [${graphqlType}]` : `() => ${graphqlType}`;
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

function generateHelpersGrouped(config: GeneratorConfig): GeneratedFile {
  const prismaClientPath = config.prismaClientPath || '@prisma/client';
  return {
    path: 'helpers.ts',
    content: `import type { GraphQLResolveInfo, SelectionSetNode, FieldNode, ValueNode } from 'graphql';
import { GraphQLScalarType } from 'graphql';
import { Prisma } from '${prismaClientPath}';

/**
 * GraphQL Scalar for Prisma.Decimal type
 * Based on Decimal.js library
 */
export const GraphQLDecimal = new GraphQLScalarType({
  name: 'Decimal',
  description:
    'GraphQL Scalar representing the Prisma.Decimal type, based on Decimal.js library.',
  serialize: (value: unknown) => {
    if (Prisma.Decimal.isDecimal(value)) {
      return (value as Prisma.Decimal).toString();
    }
    throw new Error(
      \`[DecimalError] Invalid argument: \${Object.prototype.toString.call(value)}. Expected Prisma.Decimal.\`,
    );
  },
  parseValue: (value: unknown) => {
    // Accept valid Decimal.Value types: string | number | Decimal
    if (typeof value === 'string' || typeof value === 'number') {
      return new Prisma.Decimal(value);
    }
    // Handle bigint by converting to string
    if (typeof value === 'bigint') {
      return new Prisma.Decimal(value.toString());
    }
    if (Prisma.Decimal.isDecimal(value)) {
      return value as Prisma.Decimal;
    }
    throw new Error(
      \`[DecimalError] Invalid argument: \${typeof value}. Expected string, number, bigint, or Decimal.\`,
    );
  },
});

export interface PrismaSelect {
  select?: Record<string, boolean | PrismaRelation>;
  include?: Record<string, boolean | PrismaRelation>;
}

/**
 * Prisma relation object with optional filtering arguments
 */
export interface PrismaRelation extends PrismaSelect {
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown> | Record<string, unknown>[];
  take?: number;
  skip?: number;
  cursor?: Record<string, unknown>;
  distinct?: string[];
  [key: string]: unknown;
}

/**
 * Prisma aggregate arguments type
 * 
 * For aggregate operations, Prisma expects _count, _avg, etc. at the top level,
 * NOT wrapped in a select object.
 */
export interface PrismaAggregateArgs {
  _count?: boolean | Record<string, boolean>;
  _avg?: Record<string, boolean>;
  _sum?: Record<string, boolean>;
  _min?: Record<string, boolean>;
  _max?: Record<string, boolean>;
}

/**
 * Context type that should contain the Prisma client.
 * Extend this interface in your app to add custom properties.
 */
export interface GraphQLContext<PrismaClient = unknown> {
  prisma: PrismaClient;
  [key: string]: unknown;
}

/**
 * Model field information extracted from DMMF
 */
interface ModelFieldInfo {
  scalars: Set<string>;
  relations: Map<string, string>;
}

/**
 * Cache for model fields extracted from DMMF
 */
const modelFieldsCache = new Map<string, ModelFieldInfo>();

/**
 * Extract scalar and relation field names from Prisma DMMF for a model.
 */
function getModelFields(modelName: string): ModelFieldInfo {
  if (modelFieldsCache.has(modelName)) {
    return modelFieldsCache.get(modelName)!;
  }

  const model = Prisma.dmmf.datamodel.models.find((m: { name: string }) => m.name === modelName);
  if (!model) {
    throw new Error(\`Model "\${modelName}" not found in Prisma DMMF\`);
  }

  const scalars = new Set<string>();
  const relations = new Map<string, string>();

  for (const field of model.fields) {
    if (field.kind === 'object') {
      relations.set(field.name, field.type);
    } else {
      scalars.add(field.name);
    }
  }

  const info: ModelFieldInfo = { scalars, relations };
  modelFieldsCache.set(modelName, info);
  return info;
}

/**
 * Fields that should be excluded from selection
 */
const EXCLUDED_FIELDS = new Set([
  '__typename',
  '_count',
  '_avg',
  '_sum',
  '_min',
  '_max',
]);

/**
 * Prisma relation arguments that should be forwarded from GraphQL to Prisma
 */
const PRISMA_RELATION_ARGS = new Set(['where', 'orderBy', 'take', 'skip', 'cursor', 'distinct']);

/**
 * Convert a GraphQL AST ValueNode into a plain JavaScript value,
 * resolving variables from the request.
 */
function astValueToJs(
  valueNode: ValueNode,
  variableValues: Record<string, unknown>,
): unknown {
  switch (valueNode.kind) {
    case 'Variable':
      return variableValues[valueNode.name.value];
    case 'IntValue':
      return parseInt(valueNode.value, 10);
    case 'FloatValue':
      return parseFloat(valueNode.value);
    case 'StringValue':
      return valueNode.value;
    case 'BooleanValue':
      return valueNode.value;
    case 'NullValue':
      return null;
    case 'EnumValue':
      return valueNode.value;
    case 'ListValue':
      return valueNode.values.map((v) => astValueToJs(v, variableValues));
    case 'ObjectValue': {
      const obj: Record<string, unknown> = {};
      for (const field of valueNode.fields) {
        obj[field.name.value] = astValueToJs(field.value, variableValues);
      }
      return obj;
    }
    default:
      return undefined;
  }
}

/**
 * Extract Prisma-compatible arguments from a GraphQL field node.
 * Handles both inline values and variable references.
 */
function extractFieldArgs(
  fieldNode: FieldNode,
  variableValues: Record<string, unknown>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  if (!fieldNode.arguments || fieldNode.arguments.length === 0) {
    return args;
  }

  for (const arg of fieldNode.arguments) {
    const argName = arg.name.value;

    // Only forward Prisma-compatible relation arguments
    if (!PRISMA_RELATION_ARGS.has(argName)) {
      continue;
    }

    const value = astValueToJs(arg.value, variableValues);
    if (value !== undefined) {
      args[argName] = value;
    }
  }

  return args;
}

/**
 * Parse a selection set into a Prisma select object.
 * When modelName is provided, filters out fields not in the Prisma model.
 */
function parseSelectionSetSimple(
  selectionSet: SelectionSetNode | undefined,
  info: GraphQLResolveInfo,
  modelFields?: ModelFieldInfo,
): Record<string, boolean | PrismaRelation> {
  const select: Record<string, boolean | PrismaRelation> = {};

  if (!selectionSet) {
    return select;
  }

  const variableValues = (info.variableValues ?? {}) as Record<string, unknown>;

  for (const selection of selectionSet.selections) {
    // Handle field selections
    if (selection.kind === 'Field') {
      const fieldNode = selection as FieldNode;
      const fieldName = fieldNode.name.value;

      // Skip excluded fields
      if (EXCLUDED_FIELDS.has(fieldName)) {
        continue;
      }

      // If modelFields provided, filter based on Prisma model schema
      if (modelFields) {
        const isScalar = modelFields.scalars.has(fieldName);
        const isRelation = modelFields.relations.has(fieldName);

        if (!isScalar && !isRelation) {
          // Field doesn't exist in Prisma model - skip it (custom @ResolveField)
          continue;
        }

        if (isRelation && fieldNode.selectionSet) {
          // For relations, recursively get related model's fields
          const relatedModelName = modelFields.relations.get(fieldName)!;
          const relatedModelFields = getModelFields(relatedModelName);
          const nestedSelect = parseSelectionSetSimple(
            fieldNode.selectionSet,
            info,
            relatedModelFields,
          );
          const relationArgs = extractFieldArgs(fieldNode, variableValues);

          if (Object.keys(nestedSelect).length > 0) {
            select[fieldName] = { select: nestedSelect, ...relationArgs };
          } else {
            select[fieldName] = Object.keys(relationArgs).length > 0 ? { ...relationArgs } : true;
          }
          continue;
        }

        // Scalar field
        if (isScalar) {
          select[fieldName] = true;
          continue;
        }
      }

      // Fallback: no modelFields filtering (original behavior)
      if (fieldNode.selectionSet) {
        // Recursively parse nested selections
        const nestedSelect = parseSelectionSetSimple(fieldNode.selectionSet, info);

        // Extract relation arguments (where, orderBy, etc.)
        const relationArgs = extractFieldArgs(fieldNode, variableValues);

        if (Object.keys(nestedSelect).length > 0) {
          select[fieldName] = { select: nestedSelect, ...relationArgs };
        } else {
          select[fieldName] = Object.keys(relationArgs).length > 0
            ? { ...relationArgs }
            : true;
        }
      } else {
        // Scalar field
        select[fieldName] = true;
      }
    }
    // Handle fragment spreads
    else if (selection.kind === 'FragmentSpread') {
      const fragmentName = selection.name.value;
      const fragment = info.fragments[fragmentName];

      if (fragment) {
        const fragmentSelect = parseSelectionSetSimple(fragment.selectionSet, info, modelFields);
        Object.assign(select, fragmentSelect);
      }
    }
    // Handle inline fragments
    else if (selection.kind === 'InlineFragment') {
      if (selection.selectionSet) {
        const inlineSelect = parseSelectionSetSimple(selection.selectionSet, info, modelFields);
        Object.assign(select, inlineSelect);
      }
    }
  }

  return select;
}

/**
 * Transform GraphQL resolve info into Prisma select/include arguments.
 * 
 * @param info - GraphQL resolve info from the resolver
 * @param modelName - Optional model name for automatic field filtering (e.g., 'User')
 * @returns Prisma select object
 * 
 * @example
 * // Without filtering (all fields passed through):
 * const select = transformInfoIntoPrismaArgs(info);
 * 
 * // With filtering (custom @ResolveField fields excluded):
 * const select = transformInfoIntoPrismaArgs(info, 'User');
 */
export function transformInfoIntoPrismaArgs(
  info: GraphQLResolveInfo,
  modelName?: string,
): PrismaSelect {
  // Get the first field node
  const fieldNode = info.fieldNodes[0];
  if (!fieldNode?.selectionSet) {
    return {};
  }

  // Get model fields if modelName is provided
  const modelFields = modelName ? getModelFields(modelName) : undefined;

  // Parse the selection set directly from AST
  const select = parseSelectionSetSimple(fieldNode.selectionSet, info, modelFields);

  if (Object.keys(select).length === 0) {
    return {};
  }

  return { select };
}

/**
 * Aggregate field names that Prisma expects
 */
const AGGREGATE_FIELDS = new Set(['_count', '_avg', '_sum', '_min', '_max']);

/**
 * Transform GraphQL resolve info into Prisma aggregate arguments
 * 
 * This function manually parses the GraphQL field nodes to extract aggregate
 * field selections. Unlike transformInfoIntoPrismaArgs, this returns aggregate
 * fields directly at the top level (e.g., { _count: true, _avg: { field: true } })
 * rather than wrapped in a select object.
 */
export function transformInfoIntoPrismaAggregateArgs(info: GraphQLResolveInfo): PrismaAggregateArgs {
  const result: PrismaAggregateArgs = {};

  // Get the first field node (the aggregate query field)
  const fieldNode = info.fieldNodes[0];
  if (!fieldNode?.selectionSet) {
    return {};
  }

  // Iterate through the selections (e.g., _count, _avg, _sum, etc.)
  for (const selection of fieldNode.selectionSet.selections) {
    if (selection.kind !== 'Field') continue;

    const fieldName = selection.name.value;

    // Only process aggregate fields
    if (!AGGREGATE_FIELDS.has(fieldName)) continue;

    // Check if the field has nested selections
    if (!selection.selectionSet) {
      // No nested selections - for _count, this means count all
      if (fieldName === '_count') {
        result._count = true;
      }
      continue;
    }

    // Parse nested field selections
    const fieldSelect: Record<string, boolean> = {};
    for (const nestedSelection of selection.selectionSet.selections) {
      if (nestedSelection.kind !== 'Field') continue;

      const nestedFieldName = nestedSelection.name.value;

      // Skip __typename
      if (nestedFieldName === '__typename') continue;

      // Include all fields including _all in the selection
      // This ensures Prisma returns the correct object shape for GraphQL
      fieldSelect[nestedFieldName] = true;
    }

    // Add to result if we have field selections
    if (Object.keys(fieldSelect).length > 0) {
      (result as any)[fieldName] = fieldSelect;
    } else if (fieldName === '_count' && result._count !== true) {
      result._count = true;
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
      'Please provide it under the \\\`context["prisma"]\\\` key.'
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

function generateRootIndexGrouped(
  _dmmf: DMMFDocument,
  _inputTypeNames: Set<string>,
): GeneratedFile {
  const lines: string[] = [];
  lines.push(`export * from './enums';`);
  lines.push(`export * from './common';`);
  lines.push(`export * from './helpers';`);
  lines.push(`export * from './models';`);

  return { path: 'index.ts', content: lines.join('\n') + '\n' };
}

/**
 * Generate models/index.ts that exports all model types
 */
function generateModelsIndex(dmmf: DMMFDocument, inputTypeNames: Set<string>): GeneratedFile {
  const lines: string[] = [];
  for (const model of dmmf.models) {
    const hasWhereInput = inputTypeNames.has(`${model.name}WhereInput`);
    const hasWhereUniqueInput = inputTypeNames.has(`${model.name}WhereUniqueInput`);
    if (hasWhereInput || hasWhereUniqueInput) {
      lines.push(`export * from './${model.name}';`);
    }
  }
  return { path: 'models/index.ts', content: lines.join('\n') + '\n' };
}

// ============ Utilities ============

function escapeStr(text: string): string {
  return text.replace(/'/g, "\\'").replace(/\n/g, '\\n');
}
