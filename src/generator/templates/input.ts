import type { InputField, InputType } from '../dmmf/types';
import { PRISMA_TO_GRAPHQL_SCALAR, PRISMA_TO_TS_TYPE } from '../dmmf/types';
import { Project, SourceFile } from 'ts-morph';

import type { DMMFDocument } from '../dmmf/document';
import type { GeneratorConfig } from '../../cli/options-parser';

/**
 * Generate input type files
 */
export function generateInputs(
  project: Project,
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();
  const generatedInputTypes = new Set<string>();

  // Generate ALL input types from the DMMF
  for (const [name, inputType] of dmmf.inputTypes) {
    if (!generatedInputTypes.has(name)) {
      generatedInputTypes.add(name);

      const fileName = `${name}.ts`;
      const filePath = `${config.outputDirs?.inputs ?? 'inputs'}/${fileName}`;

      const sourceFile = project.createSourceFile(filePath, '', { overwrite: true });
      generateInputTypeFile(sourceFile, inputType, dmmf, config);
      files.set(filePath, sourceFile);
    }
  }

  // Generate index file
  if (generatedInputTypes.size > 0) {
    const indexPath = `${config.outputDirs?.inputs ?? 'inputs'}/index.ts`;
    const indexFile = project.createSourceFile(indexPath, '', { overwrite: true });
    generateInputIndexFile(indexFile, [...generatedInputTypes]);
    files.set(indexPath, indexFile);
  }

  return files;
}

/**
 * Generate a single input type file
 */
function generateInputTypeFile(
  sourceFile: SourceFile,
  inputType: InputType,
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): void {
  const nestjsImports = ['InputType', 'Field', 'Int', 'Float'];
  const hasJson = inputType.fields.some(f => f.type === 'Json');

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

  // Collect referenced types
  const referencedTypes = collectReferencedTypes(inputType, dmmf);
  const enumTypes = new Set<string>();

  for (const refType of referencedTypes) {
    if (refType !== inputType.name && dmmf.isEnum(refType)) {
      enumTypes.add(refType);
    }
  }

  // Import enums directly (no circular dependency risk)
  for (const enumType of enumTypes) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: `../${config.outputDirs?.enums ?? 'enums'}/${enumType}`,
      namedImports: [enumType],
    });
  }

  // NO imports for other input types - we use lazy require() to avoid circular deps
  // TypeScript types are declared inline using the class name directly

  // Create the class with @InputType decorator
  const classDecl = sourceFile.addClass({
    name: inputType.name,
    isExported: true,
    decorators: [
      {
        name: 'InputType',
        arguments: [],
      },
    ],
  });

  // Add fields
  for (const field of inputType.fields) {
    addInputFieldToClass(classDecl, field, dmmf, inputType.name);
  }
}

/**
 * Collect all referenced types in an input type
 */
function collectReferencedTypes(inputType: InputType, _dmmf: DMMFDocument): Set<string> {
  const types = new Set<string>();

  for (const field of inputType.fields) {
    for (const typeRef of field.inputTypes) {
      if (typeRef.location === 'inputObjectTypes' || typeRef.location === 'enumTypes') {
        // Skip scalar types
        if (!isScalarType(typeRef.type)) {
          types.add(typeRef.type);
        }
      }
    }
  }

  return types;
}

/**
 * Check if a type is a scalar type
 */
function isScalarType(typeName: string): boolean {
  const scalars = [
    'String',
    'Int',
    'Float',
    'Boolean',
    'DateTime',
    'Json',
    'BigInt',
    'Decimal',
    'Bytes',
  ];
  return scalars.includes(typeName);
}

/**
 * Add a field to the input type class
 */
function addInputFieldToClass(
  classDecl: ReturnType<SourceFile['addClass']>,
  field: InputField,
  dmmf: DMMFDocument,
  currentTypeName: string,
): void {
  const { graphqlType, tsType, isInputObjectType } = getInputFieldTypes(field, dmmf);

  // Build @Field decorator arguments
  const fieldDecoratorArgs: string[] = [];

  // Type function - use lazy require() for input object types to avoid circular deps
  if (isInputObjectType && graphqlType !== currentTypeName) {
    if (field.isList) {
      fieldDecoratorArgs.push(`() => [require('./${graphqlType}').${graphqlType}]`);
    } else {
      fieldDecoratorArgs.push(`() => require('./${graphqlType}').${graphqlType}`);
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

  if (!field.isRequired) {
    options['nullable'] = 'true';
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
    propertyType = `${propertyType} | undefined`;
  }

  // Add property with @Field decorator
  classDecl.addProperty({
    name: field.name,
    type: propertyType,
    hasQuestionToken: !field.isRequired,
    decorators: [
      {
        name: 'Field',
        arguments: fieldDecoratorArgs,
      },
    ],
  });
}

/**
 * Get GraphQL and TypeScript types for an input field
 */
function getInputFieldTypes(
  field: InputField,
  dmmf: DMMFDocument,
): { graphqlType: string; tsType: string; isInputObjectType: boolean } {
  const mainType = field.type;

  // Handle scalar types
  if (PRISMA_TO_GRAPHQL_SCALAR[mainType]) {
    const graphqlType = PRISMA_TO_GRAPHQL_SCALAR[mainType];
    const tsType = PRISMA_TO_TS_TYPE[mainType];

    if (mainType === 'Json') {
      return { graphqlType: 'GraphQLJSON', tsType: 'any', isInputObjectType: false };
    }

    return { graphqlType: graphqlType ?? 'String', tsType: tsType ?? 'string', isInputObjectType: false };
  }

  // Handle enum types
  if (dmmf.isEnum(mainType)) {
    return { graphqlType: mainType, tsType: mainType, isInputObjectType: false };
  }

  // Handle input object types - use 'any' for TS type to avoid circular import issues
  return { graphqlType: mainType, tsType: 'any', isInputObjectType: true };
}

/**
 * Generate input types index file
 */
function generateInputIndexFile(sourceFile: SourceFile, inputTypeNames: string[]): void {
  for (const name of inputTypeNames.sort()) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: `./${name}`,
    });
  }
}
