import { Project, SourceFile } from 'ts-morph';
import type { GeneratorConfig } from '../cli/options-parser';

/**
 * Generate runtime helper files that will be included in the output
 */
export function generateHelpers(
  project: Project,
  config: GeneratorConfig,
): Map<string, SourceFile> {
  const files = new Map<string, SourceFile>();

  // Generate main helpers file
  const helpersPath = 'helpers.ts';
  const helpersFile = project.createSourceFile(helpersPath, '', { overwrite: true });
  generateHelpersFile(helpersFile, config);
  files.set(helpersPath, helpersFile);

  return files;
}

/**
 * Generate the helpers.ts file with runtime utilities
 */
function generateHelpersFile(sourceFile: SourceFile, _config: GeneratorConfig): void {
  sourceFile.addStatements(`
/**
 * Runtime helpers for NestJS Prisma GraphQL Generator
 * 
 * These helpers are used at runtime to transform GraphQL queries
 * into optimized Prisma select/include objects.
 */

import type { GraphQLResolveInfo } from 'graphql';
import {
  parseResolveInfo,
  simplifyParsedResolveInfoFragmentWithType,
  ResolveTree,
} from 'graphql-parse-resolve-info';

/**
 * Prisma select/include object type
 */
export interface PrismaSelect {
  select?: Record<string, boolean | PrismaSelect>;
  include?: Record<string, boolean | PrismaSelect>;
}

/**
 * Context type that should contain the Prisma client
 */
export interface GraphQLContext {
  prisma: any;
  [key: string]: any;
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
 * Transform GraphQL resolve info into Prisma select/include arguments
 * 
 * This is the core optimization function that analyzes the GraphQL query
 * and builds an optimal Prisma query with only the requested fields.
 * 
 * @param info - GraphQL resolve info from the resolver
 * @returns Prisma select object
 */
export function transformInfoIntoPrismaArgs(info: GraphQLResolveInfo): PrismaSelect {
  const parsedInfo = parseResolveInfo(info);
  
  if (!parsedInfo) {
    return {};
  }

  const simplifiedInfo = simplifyParsedResolveInfoFragmentWithType(
    parsedInfo as ResolveTree,
    info.returnType,
  );

  return buildPrismaSelect(simplifiedInfo.fields);
}

/**
 * Build Prisma select object from parsed GraphQL fields
 */
function buildPrismaSelect(fields: Record<string, ResolveTree>): PrismaSelect {
  const select: Record<string, boolean | PrismaSelect> = {};

  for (const [fieldName, fieldInfo] of Object.entries(fields)) {
    if (EXCLUDED_FIELDS.has(fieldName)) {
      continue;
    }

    const nestedFields = fieldInfo.fieldsByTypeName;
    const nestedTypes = Object.keys(nestedFields);

    if (nestedTypes.length > 0) {
      // Relation field
      const allNestedFields: Record<string, ResolveTree> = {};
      for (const typeName of nestedTypes) {
        Object.assign(allNestedFields, nestedFields[typeName]);
      }

      const nestedSelect = buildPrismaSelect(allNestedFields);
      
      if (Object.keys(nestedSelect).length > 0) {
        select[fieldName] = nestedSelect;
      } else {
        select[fieldName] = true;
      }
    } else {
      select[fieldName] = true;
    }
  }

  if (Object.keys(select).length === 0) {
    return {};
  }

  return { select };
}

/**
 * Get Prisma client from GraphQL context
 */
export function getPrismaFromContext(info: GraphQLResolveInfo): any {
  const ctx = (info as any).variableValues?.context || 
              (info as any).rootValue?.context ||
              (info as any).context;
  
  if (ctx?.prisma) {
    return ctx.prisma;
  }

  const rootValue = info.rootValue as GraphQLContext | undefined;
  if (rootValue?.prisma) {
    return rootValue.prisma;
  }

  throw new Error(
    'Prisma client not found in GraphQL context. ' +
    'Make sure to pass the Prisma client in the context: { prisma }'
  );
}

/**
 * Transform count fields into Prisma _count select
 */
export function transformCountFieldIntoSelectRelationsCount(
  fields: Record<string, ResolveTree>,
): { _count?: { select: Record<string, boolean> } } {
  const countField = fields['_count'];
  
  if (!countField) {
    return {};
  }

  const countNestedFields = countField.fieldsByTypeName;
  const countTypes = Object.keys(countNestedFields);
  
  if (countTypes.length === 0) {
    return {};
  }

  const countSelect: Record<string, boolean> = {};
  
  for (const typeName of countTypes) {
    const typeFields = countNestedFields[typeName];
    if (typeFields) {
      for (const fieldName of Object.keys(typeFields)) {
        countSelect[fieldName] = true;
      }
    }
  }

  if (Object.keys(countSelect).length === 0) {
    return {};
  }

  return {
    _count: {
      select: countSelect,
    },
  };
}

/**
 * Merge multiple Prisma select objects
 */
export function mergePrismaSelects(...selects: PrismaSelect[]): PrismaSelect {
  const result: PrismaSelect = {};

  for (const select of selects) {
    if (select.select) {
      result.select = {
        ...result.select,
        ...select.select,
      };
    }
    if (select.include) {
      result.include = {
        ...result.include,
        ...select.include,
      };
    }
  }

  return result;
}
`);
}
