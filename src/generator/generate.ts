import { Project, SourceFile } from 'ts-morph';

import type { DMMFDocument } from './dmmf/document';
import type { GeneratedFile } from './dmmf/types';
import type { GeneratorConfig } from '../cli/options-parser';
import { generateArgs } from './templates/args';
import { generateCodeGrouped } from './generate-grouped';
import { generateCommonTypes } from './common';
import { generateEnums } from './templates/enum';
import { generateHelpers } from './helpers-generator';
import { generateInputs } from './templates/input';
import { generateModels } from './templates/model';
import { generateResolvers } from './templates/resolver';

/**
 * Main code generation orchestrator
 *
 * Coordinates generation of all code files from the DMMF document
 */
export async function generateCode(
  dmmf: DMMFDocument,
  config: GeneratorConfig,
): Promise<GeneratedFile[]> {
  // Use grouped generation if enabled
  if (config.groupByModel) {
    return generateCodeGrouped(dmmf, config);
  }
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

  // Check which blocks to emit
  const emitAll = !config.emitOnly || config.emitOnly.length === 0;
  const shouldEmit = (block: string) => emitAll || config.emitOnly?.includes(block as any);

  // Generate enums
  if (shouldEmit('enums')) {
    const enumFiles = generateEnums(project, dmmf, config);
    for (const [path, file] of enumFiles) {
      allFiles.set(path, file);
    }
  }

  // Generate model types
  if (shouldEmit('models')) {
    const modelFiles = generateModels(project, dmmf, config);
    for (const [path, file] of modelFiles) {
      allFiles.set(path, file);
    }
  }

  // Generate input types
  if (shouldEmit('inputs')) {
    const inputFiles = generateInputs(project, dmmf, config);
    for (const [path, file] of inputFiles) {
      allFiles.set(path, file);
    }
  }

  // Generate args types
  if (shouldEmit('args')) {
    const argsFiles = generateArgs(project, dmmf, config);
    for (const [path, file] of argsFiles) {
      allFiles.set(path, file);
    }
  }

  // Generate resolvers
  if (shouldEmit('resolvers') && config.generateResolvers) {
    const resolverFiles = generateResolvers(project, dmmf, config);
    for (const [path, file] of resolverFiles) {
      allFiles.set(path, file);
    }
  }

  // Generate common types (AffectedRows, etc.)
  const commonFiles = generateCommonTypes(project, config);
  for (const [path, file] of commonFiles) {
    allFiles.set(path, file);
  }

  // Generate helpers
  if (shouldEmit('helpers')) {
    const helperFiles = generateHelpers(project, config);
    for (const [path, file] of helperFiles) {
      allFiles.set(path, file);
    }
  }

  // Generate root index file
  const indexFile = project.createSourceFile('index.ts', '', { overwrite: true });
  generateRootIndex(indexFile, config, dmmf);
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
 * Generate root index.ts that exports everything
 */
function generateRootIndex(
  sourceFile: SourceFile,
  config: GeneratorConfig,
  dmmf: DMMFDocument,
): void {
  const emitAll = !config.emitOnly || config.emitOnly.length === 0;
  const shouldEmit = (block: string) => emitAll || config.emitOnly?.includes(block as any);

  if (shouldEmit('enums') && dmmf.enums.length > 0) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: `./${config.outputDirs?.enums ?? 'enums'}`,
    });
  }

  if (shouldEmit('models') && dmmf.models.length > 0) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: `./${config.outputDirs?.models ?? 'models'}`,
    });
  }

  if (shouldEmit('inputs')) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: `./${config.outputDirs?.inputs ?? 'inputs'}`,
    });
  }

  if (shouldEmit('args')) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: `./${config.outputDirs?.args ?? 'args'}`,
    });
  }

  if (shouldEmit('resolvers') && config.generateResolvers) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: `./${config.outputDirs?.resolvers ?? 'resolvers'}`,
    });
  }

  // Always export common types and helpers
  sourceFile.addExportDeclaration({
    moduleSpecifier: './common',
  });

  sourceFile.addExportDeclaration({
    moduleSpecifier: './helpers',
  });
}
