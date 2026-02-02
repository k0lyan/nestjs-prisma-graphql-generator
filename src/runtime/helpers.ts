/**
 * Runtime helpers for NestJS Prisma GraphQL Generator
 *
 * These helpers are used at runtime to transform GraphQL queries
 * into optimized Prisma select/include objects.
 */

import {
  ResolveTree,
  parseResolveInfo,
  simplifyParsedResolveInfoFragmentWithType,
} from 'graphql-parse-resolve-info';

import type { GraphQLResolveInfo } from 'graphql';

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
 * These are GraphQL internal fields or aggregation fields
 */
const EXCLUDED_FIELDS = new Set(['__typename', '_count', '_avg', '_sum', '_min', '_max']);

/**
 * Transform GraphQL resolve info into Prisma select/include arguments
 *
 * This is the core optimization function that analyzes the GraphQL query
 * and builds an optimal Prisma query with only the requested fields.
 *
 * @param info - GraphQL resolve info from the resolver
 * @returns Prisma select object
 *
 * @example
 * ```typescript
 * @Query(() => [User])
 * async users(@Info() info: GraphQLResolveInfo) {
 *   const select = transformInfoIntoPrismaArgs(info);
 *   return prisma.user.findMany({
 *     ...select,
 *   });
 * }
 * ```
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
 *
 * @param fields - Parsed fields from graphql-parse-resolve-info
 * @returns Prisma select object
 */
function buildPrismaSelect(fields: Record<string, ResolveTree>): PrismaSelect {
  const select: Record<string, boolean | PrismaSelect> = {};

  for (const [fieldName, fieldInfo] of Object.entries(fields)) {
    // Skip excluded fields
    if (EXCLUDED_FIELDS.has(fieldName)) {
      continue;
    }

    // Check if field has nested selections (relation)
    const nestedFields = fieldInfo.fieldsByTypeName;
    const nestedTypes = Object.keys(nestedFields);

    if (nestedTypes.length > 0) {
      // This is a relation field - need to use include or nested select

      // Merge fields from all possible types (for union/interface types)
      const allNestedFields: Record<string, ResolveTree> = {};
      for (const typeName of nestedTypes) {
        Object.assign(allNestedFields, nestedFields[typeName]);
      }

      // Recursively build select for nested fields
      const nestedSelect = buildPrismaSelect(allNestedFields);

      if (Object.keys(nestedSelect).length > 0) {
        select[fieldName] = nestedSelect;
      } else {
        select[fieldName] = true;
      }
    } else {
      // Scalar field
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
 *
 * @param info - GraphQL resolve info
 * @returns Prisma client instance
 * @throws Error if Prisma client is not found in context
 *
 * @example
 * ```typescript
 * const prisma = getPrismaFromContext(info);
 * return prisma.user.findMany();
 * ```
 */
export function getPrismaFromContext(info: GraphQLResolveInfo): any {
  const context =
    (info as any).variableValues?.context ||
    (info as any).rootValue?.context ||
    (info as any).context;

  if (context?.prisma) {
    return context.prisma;
  }

  // Fallback: try to get from rootValue directly
  const rootValue = info.rootValue as GraphQLContext | undefined;
  if (rootValue?.prisma) {
    return rootValue.prisma;
  }

  throw new Error(
    'Prisma client not found in GraphQL context. ' +
      'Make sure to pass the Prisma client in the context: { prisma }',
  );
}

/**
 * Transform count fields into Prisma _count select
 *
 * Handles the special _count field that aggregates relation counts
 *
 * @param fields - Parsed fields containing _count
 * @returns Prisma _count select object
 */
export function transformCountFieldIntoSelectRelationsCount(fields: Record<string, ResolveTree>): {
  _count?: { select: Record<string, boolean> };
} {
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
 *
 * @param selects - Array of PrismaSelect objects to merge
 * @returns Merged PrismaSelect object
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
 * Check if a field is a relation based on Prisma schema info
 *
 * This is a simple heuristic - in generated code, we have full schema info
 *
 * @param fieldName - Name of the field
 * @param modelFields - Map of field names to their types
 * @returns true if the field is a relation
 */
export function isRelationField(
  fieldName: string,
  modelFields: Map<string, { isRelation: boolean }>,
): boolean {
  const field = modelFields.get(fieldName);
  return field?.isRelation ?? false;
}

/**
 * Apply pagination to Prisma args
 *
 * @param args - Existing Prisma args
 * @param pagination - Pagination options
 * @returns Prisma args with pagination
 */
export function applyPagination<T extends object>(
  args: T,
  pagination?: { skip?: number; take?: number; cursor?: any },
): T {
  if (!pagination) {
    return args;
  }

  return {
    ...args,
    ...(pagination.skip !== undefined && { skip: pagination.skip }),
    ...(pagination.take !== undefined && { take: pagination.take }),
    ...(pagination.cursor !== undefined && { cursor: pagination.cursor }),
  };
}
