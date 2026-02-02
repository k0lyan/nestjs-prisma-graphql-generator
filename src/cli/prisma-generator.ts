import type { GeneratorOptions } from '@prisma/generator-helper';
import { GeneratorConfig } from './options-parser';
import { DMMFDocument } from '../generator/dmmf/document';
import { generateCode } from '../generator/generate';
import { writeFiles } from '../generator/writers/file-writer';
import path from 'path';

export async function generate(options: GeneratorOptions, config: GeneratorConfig): Promise<void> {
  const outputDir = options.generator.output?.value;
  
  if (!outputDir) {
    throw new Error('Output directory is required');
  }

  const absoluteOutputDir = path.isAbsolute(outputDir)
    ? outputDir
    : path.join(options.schemaPath, '..', outputDir);

  // Parse DMMF into our internal document structure
  const dmmfDocument = new DMMFDocument(options.dmmf, config);

  // Generate all code files
  const generatedFiles = await generateCode(dmmfDocument, config);

  // Write files to output directory
  await writeFiles(absoluteOutputDir, generatedFiles);

  console.log(`✅ NestJS GraphQL types generated to ${absoluteOutputDir}`);
}
