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
  ResolveTree,
  FieldsByTypeName,
} from 'graphql-parse-resolve-info';

/**
 * Prisma select/include object type
 */
export interface PrismaSelect {
  select?: Record<string, boolean | PrismaSelect>;
  include?: Record<string, boolean | PrismaSelect>;
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
 * Context type that should contain the Prisma client.
 * Extend this interface in your app to add custom properties.
 * 
 * @example
 * // In your app
 * interface AppContext extends GraphQLContext {
 *   req: Request;
 *   user?: User;
 * }
 */
export interface GraphQLContext<PrismaClient = unknown> {
  prisma: PrismaClient;
  [key: string]: unknown;
}

export function transformInfoIntoPrismaArgs(info: GraphQLResolveInfo): PrismaSelect {
  const parsedInfo = parseResolveInfo(info) as ResolveTree | null;
  if (!parsedInfo) return {};

  const select = buildPrismaSelect(parsedInfo.fieldsByTypeName);
  return Object.keys(select).length > 0 ? { select } : {};
}

function buildPrismaSelect(fieldsByTypeName: FieldsByTypeName): Record<string, any> {
  const result: Record<string, any> = {};

  for (const typeName in fieldsByTypeName) {
    const fields = fieldsByTypeName[typeName];
    for (const fieldName in fields) {
      if (fieldName.startsWith('__') || fieldName.startsWith('_count') || fieldName.startsWith('_avg') || fieldName.startsWith('_sum') || fieldName.startsWith('_min') || fieldName.startsWith('_max')) continue;

      const field = fields[fieldName];
      const nestedFields = field.fieldsByTypeName;

      if (Object.keys(nestedFields).length > 0) {
        const nestedSelect = buildPrismaSelect(nestedFields);
        result[fieldName] = Object.keys(nestedSelect).length > 0 ? { select: nestedSelect } : true;
      } else {
        result[fieldName] = true;
      }
    }
  }

  return result;
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
 */
export function transformInfoIntoPrismaAggregateArgs(info: GraphQLResolveInfo): PrismaAggregateArgs {
  const parsedInfo = parseResolveInfo(info) as ResolveTree | null;
  if (!parsedInfo) return {};

  return buildPrismaAggregateArgs(parsedInfo.fieldsByTypeName);
}

function buildPrismaAggregateArgs(fieldsByTypeName: FieldsByTypeName): PrismaAggregateArgs {
  const result: PrismaAggregateArgs = {};

  for (const typeName in fieldsByTypeName) {
    const fields = fieldsByTypeName[typeName];
    
    for (const aggregateField of AGGREGATE_FIELDS) {
      const fieldInfo = fields[aggregateField];
      if (!fieldInfo) continue;

      const nestedFields = fieldInfo.fieldsByTypeName;
      const nestedTypes = Object.keys(nestedFields);

      if (nestedTypes.length === 0) {
        if (aggregateField === '_count') result._count = true;
        continue;
      }

      const selectedFields: Record<string, boolean> = {};
      for (const nestedTypeName of nestedTypes) {
        const typeFields = nestedFields[nestedTypeName];
        for (const nestedFieldName in typeFields) {
          if (nestedFieldName === '_all') {
            if (aggregateField === '_count') {
              result._count = true;
              break;
            }
          } else {
            selectedFields[nestedFieldName] = true;
          }
        }
      }

      if (Object.keys(selectedFields).length > 0) {
        (result as Record<string, unknown>)[aggregateField] = selectedFields;
      } else if (aggregateField === '_count') {
        result._count = true;
      }
    }
  }

  return result;
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
      'Please provide it under the \\\`context["prisma"]\\\` key.'
    );
  }
  return prismaClient;
}

/**
 * Merge multiple Prisma select objects
 */
export function mergePrismaSelects(...selects: PrismaSelect[]): PrismaSelect {
  const result: PrismaSelect = {};
  for (const s of selects) {
    if (s.select) result.select = { ...(result.select ?? {}), ...s.select };
    if (s.include) result.include = { ...(result.include ?? {}), ...s.include };
  }
  return result;
}
`);
}
