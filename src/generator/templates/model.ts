import type { Model, ModelField } from '../dmmf/types';
import { PRISMA_TO_GRAPHQL_SCALAR, PRISMA_TO_TS_TYPE } from '../dmmf/types';
import { Project, SourceFile, Writers } from 'ts-morph';
import { isEnumField, isRelationField, isScalarField } from '../dmmf/transformer';

import type { DMMFDocument } from '../dmmf/document';
import type { GeneratorConfig } from '../../cli/options-parser';
import { escapeDescription } from './utils';

/**
 * Generate model object type files
 */
export function generateModels(
  project: Project,
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();

  for (const model of dmmf.models) {
    const fileName = `${model.name}.ts`;
    const filePath = `${config.outputDirs?.models ?? 'models'}/${fileName}`;

    const sourceFile = project.createSourceFile(filePath, '', { overwrite: true });
    generateModelFile(sourceFile, model, dmmf, config);
    files.set(filePath, sourceFile);
  }

  // Generate index file
  if (dmmf.models.length > 0) {
    const indexPath = `${config.outputDirs?.models ?? 'models'}/index.ts`;
    const indexFile = project.createSourceFile(indexPath, '', { overwrite: true });
    generateModelIndexFile(indexFile, dmmf.models);
    files.set(indexPath, indexFile);
  }

  return files;
}

/**
 * Generate a single model file
 */
function generateModelFile(
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

  // Import GraphQLBigInt from graphql-scalars for BigInt fields
  if (hasBigInt) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: 'graphql-scalars',
      namedImports: ['GraphQLBigInt'],
    });
  }

  // Import related models as TYPE ONLY - used for TypeScript types but not at runtime
  // The actual class reference is loaded via lazy require() in @Field decorator
  if (relatedModels.length > 0) {
    sourceFile.addStatements(
      `// eslint-disable-next-line @typescript-eslint/no-unused-vars\nimport type { ${relatedModels.join(', ')} } from './index';`,
    );
  }

  // Import enums
  const enumFields = model.fields.filter(f => isEnumField(f));
  const enumTypes = [...new Set(enumFields.map(f => f.type))];

  if (enumTypes.length > 0) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: `../${config.outputDirs?.enums ?? 'enums'}`,
      namedImports: enumTypes,
    });
  }

  // Add documentation comment if present
  if (model.documentation) {
    sourceFile.addStatements(`/** ${model.documentation} */`);
  }

  // Create the class with @ObjectType decorator
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
              : 'undefined',
          }),
        ],
      },
    ],
  });

  // Add fields
  for (const field of model.fields) {
    addFieldToClass(classDecl, field, dmmf, config);
  }
}

/**
 * Add a field to the model class
 */
function addFieldToClass(
  classDecl: ReturnType<SourceFile['addClass']>,
  field: ModelField,
  dmmf: DMMFDocument,
  _config: GeneratorConfig,
): void {
  const { graphqlType, tsType } = getFieldTypes(field, dmmf);
  const isRelation = isRelationField(field);

  // Build @Field decorator arguments
  const fieldDecoratorArgs: string[] = [];

  // Type function - use lazy require for relations to avoid circular deps
  if (isRelation) {
    if (field.isList) {
      fieldDecoratorArgs.push(`() => [require('./${field.type}').${field.type}]`);
    } else {
      fieldDecoratorArgs.push(`() => require('./${field.type}').${field.type}`);
    }
  } else {
    if (field.isList) {
      fieldDecoratorArgs.push(`() => [${graphqlType}]`);
    } else {
      fieldDecoratorArgs.push(`() => ${graphqlType}`);
    }
  }

  // Options object
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

  // Determine TypeScript type
  let propertyType = tsType;
  if (field.isList) {
    propertyType = `${tsType}[]`;
  }
  if (!field.isRequired) {
    propertyType = `${propertyType} | null`;
  }

  // Add property with @Field decorator
  classDecl.addProperty({
    name: field.name,
    type: propertyType,
    hasExclamationToken: field.isRequired || field.isList,
    hasQuestionToken: !field.isRequired && !field.isList,
    decorators: [
      {
        name: 'Field',
        arguments: fieldDecoratorArgs,
      },
    ],
  });
}

/**
 * Get GraphQL and TypeScript types for a field
 */
function getFieldTypes(
  field: ModelField,
  _dmmf: DMMFDocument,
): { graphqlType: string; tsType: string } {
  // Handle ID fields
  if (field.isId) {
    return { graphqlType: 'ID', tsType: 'string' };
  }

  // Handle scalar fields
  if (isScalarField(field)) {
    const graphqlType = PRISMA_TO_GRAPHQL_SCALAR[field.type] ?? 'String';
    const tsType = PRISMA_TO_TS_TYPE[field.type] ?? 'string';

    // Special case for ID type represented as Int
    if (field.type === 'Int' && field.isId) {
      return { graphqlType: 'ID', tsType: 'number' };
    }

    // Special case for JSON
    if (field.type === 'Json') {
      return { graphqlType: 'GraphQLJSON', tsType: 'any' };
    }

    return { graphqlType, tsType };
  }

  // Handle enum fields
  if (isEnumField(field)) {
    return { graphqlType: field.type, tsType: field.type };
  }

  // Handle relation fields
  if (isRelationField(field)) {
    return { graphqlType: field.type, tsType: field.type };
  }

  // Fallback
  return { graphqlType: 'String', tsType: 'string' };
}

/**
 * Generate model index file
 */
function generateModelIndexFile(sourceFile: SourceFile, models: Model[]): void {
  for (const model of models) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: `./${model.name}`,
    });
  }
}
