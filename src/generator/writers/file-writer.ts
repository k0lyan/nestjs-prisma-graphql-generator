import type { GeneratedFile } from '../dmmf/types';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Write generated files to the output directory
 */
export async function writeFiles(outputDir: string, files: GeneratedFile[]): Promise<void> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Write each file
  for (const file of files) {
    const filePath = path.join(outputDir, file.path);
    const fileDir = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(fileDir, { recursive: true });

    // Write file content
    await fs.writeFile(filePath, file.content, 'utf-8');
  }
}

/**
 * Clean output directory before generation
 */
export async function cleanOutputDir(outputDir: string): Promise<void> {
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore error if directory doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
