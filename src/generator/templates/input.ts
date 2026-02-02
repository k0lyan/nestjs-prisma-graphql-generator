import { Project, SourceFile } from 'ts-morph';
import type { DMMFDocument } from '../dmmf/document';
import type { InputType, InputField } from '../dmmf/types';
import type { GeneratorConfig } from '../../cli/options-parser';
import { PRISMA_TO_GRAPHQL_SCALAR, PRISMA_TO_TS_TYPE } from '../dmmf/types';

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

  // Generate input types for each model
  for (const model of dmmf.models) {
    const modelInputTypes = getInputTypesForModel(dmmf, model.name);
    
    for (const inputType of modelInputTypes) {
      if (!generatedInputTypes.has(inputType.name)) {
        generatedInputTypes.add(inputType.name);
        
        const fileName = `${inputType.name}.ts`;
        const filePath = `${config.outputDirs?.inputs ?? 'inputs'}/${fileName}`;
        
        const sourceFile = project.createSourceFile(filePath, '', { overwrite: true });
        generateInputTypeFile(sourceFile, inputType, dmmf, config);
        files.set(filePath, sourceFile);
      }
    }
  }

  // Generate common filter input types
  const commonInputTypes = getCommonInputTypes(dmmf);
  for (const inputType of commonInputTypes) {
    if (!generatedInputTypes.has(inputType.name)) {
      generatedInputTypes.add(inputType.name);
      
      const fileName = `${inputType.name}.ts`;
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
 * Get input types for a specific model
 */
function getInputTypesForModel(dmmf: DMMFDocument, modelName: string): InputType[] {
  const result: InputType[] = [];
  
  for (const [name, inputType] of dmmf.inputTypes) {
    if (name.startsWith(modelName)) {
      result.push(inputType);
    }
  }
  
  return result;
}

/**
 * Get common/shared input types (filters, sorting, etc.)
 */
function getCommonInputTypes(dmmf: DMMFDocument): InputType[] {
  const result: InputType[] = [];
  const commonPatterns = [
    /^String.*Filter$/,
    /^Int.*Filter$/,
    /^Float.*Filter$/,
    /^Boolean.*Filter$/,
    /^DateTime.*Filter$/,
    /^Json.*Filter$/,
    /^Enum.*Filter$/,
    /^SortOrder$/,
    /^NullsOrder$/,
  ];

  for (const [name, inputType] of dmmf.inputTypes) {
    for (const pattern of commonPatterns) {
      if (pattern.test(name)) {
        result.push(inputType);
        break;
      }
    }
  }

  return result;
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

  // Collect referenced input types for imports
  const referencedTypes = collectReferencedTypes(inputType, dmmf);
  
  for (const refType of referencedTypes) {
    if (refType !== inputType.name) {
      // Check if it's an enum
      if (dmmf.isEnum(refType)) {
        sourceFile.addImportDeclaration({
          moduleSpecifier: `../${config.outputDirs?.enums ?? 'enums'}/${refType}`,
          namedImports: [refType],
        });
      } else {
        // It's another input type
        sourceFile.addImportDeclaration({
          moduleSpecifier: `./${refType}`,
          namedImports: [refType],
        });
      }
    }
  }

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
    addInputFieldToClass(classDecl, field, dmmf);
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
  const scalars = ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes'];
  return scalars.includes(typeName);
}

/**
 * Add a field to the input type class
 */
function addInputFieldToClass(
  classDecl: ReturnType<SourceFile['addClass']>,
  field: InputField,
  dmmf: DMMFDocument,
): void {
  const { graphqlType, tsType } = getInputFieldTypes(field, dmmf);
  
  // Build @Field decorator arguments
  const fieldDecoratorArgs: string[] = [];
  
  // Type function
  if (field.isList) {
    fieldDecoratorArgs.push(`() => [${graphqlType}]`);
  } else {
    fieldDecoratorArgs.push(`() => ${graphqlType}`);
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
): { graphqlType: string; tsType: string } {
  const mainType = field.type;

  // Handle scalar types
  if (PRISMA_TO_GRAPHQL_SCALAR[mainType]) {
    const graphqlType = PRISMA_TO_GRAPHQL_SCALAR[mainType];
    const tsType = PRISMA_TO_TS_TYPE[mainType];
    
    if (mainType === 'Json') {
      return { graphqlType: 'GraphQLJSON', tsType: 'any' };
    }
    
    return { graphqlType: graphqlType ?? 'String', tsType: tsType ?? 'string' };
  }

  // Handle enum types
  if (dmmf.isEnum(mainType)) {
    return { graphqlType: mainType, tsType: mainType };
  }

  // Handle input object types (reference by name)
  return { graphqlType: mainType, tsType: mainType };
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
