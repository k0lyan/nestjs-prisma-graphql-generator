import { Project, SourceFile } from 'ts-morph';

import type { GeneratorConfig } from '../cli/options-parser';

/**
 * Generate common types shared across the generated code
 */
export function generateCommonTypes(
  project: Project,
  _config: GeneratorConfig,
): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();

  // Generate AffectedRows type
  const affectedRowsPath = 'common/AffectedRows.ts';
  const affectedRowsFile = project.createSourceFile(affectedRowsPath, '', { overwrite: true });
  generateAffectedRows(affectedRowsFile);
  files.set(affectedRowsPath, affectedRowsFile);

  // Generate BatchPayload type (alias for AffectedRows)
  const batchPayloadPath = 'common/BatchPayload.ts';
  const batchPayloadFile = project.createSourceFile(batchPayloadPath, '', { overwrite: true });
  generateBatchPayload(batchPayloadFile);
  files.set(batchPayloadPath, batchPayloadFile);

  // Generate index file
  const indexPath = 'common/index.ts';
  const indexFile = project.createSourceFile(indexPath, '', { overwrite: true });
  generateCommonIndex(indexFile);
  files.set(indexPath, indexFile);

  return files;
}

/**
 * Generate AffectedRows type
 */
function generateAffectedRows(sourceFile: SourceFile): void {
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@nestjs/graphql',
    namedImports: ['ObjectType', 'Field', 'Int'],
  });

  sourceFile.addClass({
    name: 'AffectedRows',
    isExported: true,
    decorators: [
      {
        name: 'ObjectType',
        arguments: [`{ description: 'Affected rows result' }`],
      },
    ],
    properties: [
      {
        name: 'count',
        type: 'number',
        hasExclamationToken: true,
        decorators: [
          {
            name: 'Field',
            arguments: ['() => Int', `{ description: 'Number of affected rows' }`],
          },
        ],
      },
    ],
  });
}

/**
 * Generate BatchPayload type (alias for backwards compatibility)
 */
function generateBatchPayload(sourceFile: SourceFile): void {
  sourceFile.addImportDeclaration({
    moduleSpecifier: './AffectedRows',
    namedImports: ['AffectedRows'],
  });

  sourceFile.addTypeAlias({
    name: 'BatchPayload',
    isExported: true,
    type: 'AffectedRows',
  });

  sourceFile.addStatements(`
/** @deprecated Use AffectedRows instead */
export { AffectedRows as BatchPayload };
`);
}

/**
 * Generate common index file
 */
function generateCommonIndex(sourceFile: SourceFile): void {
  sourceFile.addExportDeclaration({
    moduleSpecifier: './AffectedRows',
  });
  sourceFile.addExportDeclaration({
    moduleSpecifier: './BatchPayload',
  });
}
