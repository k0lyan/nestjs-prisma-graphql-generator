import { Project, SourceFile } from 'ts-morph';

import type { DMMFDocument } from '../dmmf/document';
import type { Enum } from '../dmmf/types';
import type { GeneratorConfig } from '../../cli/options-parser';

/**
 * Generate enum type files
 */
export function generateEnums(
  project: Project,
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();

  for (const enumDef of dmmf.enums) {
    const fileName = `${enumDef.name}.ts`;
    const filePath = `${config.outputDirs?.enums ?? 'enums'}/${fileName}`;

    const sourceFile = project.createSourceFile(filePath, '', { overwrite: true });
    generateEnumFile(sourceFile, enumDef, config);
    files.set(filePath, sourceFile);
  }

  // Generate index file
  if (dmmf.enums.length > 0) {
    const indexPath = `${config.outputDirs?.enums ?? 'enums'}/index.ts`;
    const indexFile = project.createSourceFile(indexPath, '', { overwrite: true });
    generateEnumIndexFile(indexFile, dmmf.enums);
    files.set(indexPath, indexFile);
  }

  return files;
}

/**
 * Generate a single enum file
 */
function generateEnumFile(sourceFile: SourceFile, enumDef: Enum, _config: GeneratorConfig): void {
  // Add imports
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['registerEnumType'],
  });

  // Add documentation comment if present
  if (enumDef.documentation) {
    sourceFile.addStatements(`/** ${enumDef.documentation} */`);
  }

  // Create the enum
  sourceFile.addEnum({
    name: enumDef.name,
    isExported: true,
    members: enumDef.values.map(v => ({
      name: v.name,
      value: v.name,
      docs: v.documentation ? [v.documentation] : undefined,
    })),
  });

  // Add registerEnumType call
  sourceFile.addStatements(`
registerEnumType(${enumDef.name}, {
  name: '${enumDef.name}',
  description: ${enumDef.documentation ? `'${enumDef.documentation.replace(/'/g, "\\'")}'` : 'undefined'},
});
`);
}

/**
 * Generate enum index file
 */
function generateEnumIndexFile(sourceFile: SourceFile, enums: Enum[]): void {
  for (const enumDef of enums) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: `./${enumDef.name}`,
    });
  }
}
