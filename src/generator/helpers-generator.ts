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
export interface GraphQLContext<PrismaClient = unknown> {
  prisma: PrismaClient;
  [key: string]: unknown;
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
export function getPrismaFromContext<PrismaClient = unknown>(
  context: GraphQLContext<PrismaClient>,
): PrismaClient {
  const prismaClient = context.prisma;
  if (!prismaClient) {
    throw new Error(
      'Unable to find Prisma Client in GraphQL context. ' +
      'Please provide it under the \`context["prisma"]\` key.'
    );
  }
  return prismaClient;
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
 * Aggregate field names that Prisma expects
 */
const AGGREGATE_FIELDS = ['_count', '_avg', '_sum', '_min', '_max'] as const;

/**
 * Transform GraphQL resolve info into Prisma aggregate arguments
 * 
 * Unlike transformInfoIntoPrismaArgs, this function returns aggregate fields
 * directly at the top level (e.g., { _count: true, _avg: { field: true } })
 * rather than wrapped in a select object.
 * 
 * This is required because Prisma's aggregate() and groupBy() APIs expect
 * aggregate fields at the top level, not in a select wrapper.
 * 
 * @param info - GraphQL resolve info from the resolver
 * @returns Prisma aggregate arguments
 */
export function transformInfoIntoPrismaAggregateArgs(info: GraphQLResolveInfo): PrismaAggregateArgs {
  const parsedInfo = parseResolveInfo(info);
  
  if (!parsedInfo) {
    return {};
  }

  const simplifiedInfo = simplifyParsedResolveInfoFragmentWithType(
    parsedInfo as ResolveTree,
    info.returnType,
  );

  return buildPrismaAggregateArgs(simplifiedInfo.fields);
}

/**
 * Build Prisma aggregate arguments from parsed GraphQL fields
 */
function buildPrismaAggregateArgs(fields: Record<string, ResolveTree>): PrismaAggregateArgs {
  const result: PrismaAggregateArgs = {};

  for (const aggregateField of AGGREGATE_FIELDS) {
    const fieldInfo = fields[aggregateField];
    
    if (!fieldInfo) {
      continue;
    }

    const nestedFields = fieldInfo.fieldsByTypeName;
    const nestedTypes = Object.keys(nestedFields);

    if (nestedTypes.length === 0) {
      // No nested fields selected, use true to get all
      if (aggregateField === '_count') {
        result._count = true;
      }
      continue;
    }

    // Collect all nested field names
    const selectedFields: Record<string, boolean> = {};
    for (const typeName of nestedTypes) {
      const typeFields = nestedFields[typeName];
      if (typeFields) {
        for (const nestedFieldName of Object.keys(typeFields)) {
          if (nestedFieldName === '_all') {
            // Special case: _all means count all records
            if (aggregateField === '_count') {
              result._count = true;
              break;
            }
          } else {
            selectedFields[nestedFieldName] = true;
          }
        }
      }
    }

    if (Object.keys(selectedFields).length > 0) {
      (result as Record<string, unknown>)[aggregateField] = selectedFields;
    } else if (aggregateField === '_count') {
      result._count = true;
    }
  }

  return result;
}
`);
}
