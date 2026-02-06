/**
 * Runtime helpers for NestJS Prisma GraphQL Generator
 *
 * These helpers are used at runtime to transform GraphQL queries
 * into optimized Prisma select/include objects.
 *
 * This implementation uses direct AST parsing of GraphQL field nodes
 * without relying on schema type introspection.
 */

import type { FieldNode, GraphQLResolveInfo, SelectionSetNode, ValueNode } from 'graphql';

/**
 * Prisma select/include object type
 */
export interface PrismaSelect {
  select?: Record<string, boolean | PrismaRelation>;
  include?: Record<string, boolean | PrismaRelation>;
}

/**
 * Prisma relation object with optional filtering arguments
 */
export interface PrismaRelation extends PrismaSelect {
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown> | Record<string, unknown>[];
  take?: number;
  skip?: number;
  cursor?: Record<string, unknown>;
  distinct?: string[];
  [key: string]: unknown;
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

/**
 * Options for transformInfoIntoPrismaArgs
 */
export interface TransformOptions {
  /**
   * Fields to exclude from the Prisma select.
   * Use this for custom @ResolveField() computed fields that don't exist in Prisma.
   * @example ['occupationStatus', 'computedField']
   */
  excludeFields?: string[];

  /**
   * Set of valid Prisma model fields. If provided, only these fields will be selected.
   * Any field not in this set will be automatically excluded.
   * Use getModelFields() helper to extract this from Prisma DMMF.
   * @example getModelFields(Prisma.dmmf, 'Slot')
   */
  modelFields?: Set<string>;
}

/**
 * Cache for model fields extracted from DMMF
 */
const modelFieldsCache = new Map<string, Set<string>>();

/**
 * Extract field names for a model from Prisma DMMF.
 * Results are cached for performance.
 *
 * @param dmmf - Prisma DMMF object (import { Prisma } from '@prisma/client', use Prisma.dmmf)
 * @param modelName - Name of the model (e.g., 'User', 'Slot')
 * @returns Set of field names that exist on the Prisma model
 *
 * @example
 * ```typescript
 * import { Prisma } from '@prisma/client';
 * const slotFields = getModelFields(Prisma.dmmf, 'Slot');
 * const select = transformInfoIntoPrismaArgs(info, { modelFields: slotFields });
 * ```
 */
export function getModelFields(
  dmmf: { datamodel: { models: Array<{ name: string; fields: Array<{ name: string }> }> } },
  modelName: string,
): Set<string> {
  const cacheKey = modelName;
  if (modelFieldsCache.has(cacheKey)) {
    return modelFieldsCache.get(cacheKey)!;
  }

  const model = dmmf.datamodel.models.find(m => m.name === modelName);
  if (!model) {
    throw new Error(`Model "${modelName}" not found in Prisma DMMF`);
  }

  const fields = new Set(model.fields.map(f => f.name));
  modelFieldsCache.set(cacheKey, fields);
  return fields;
}

/**
 * Fields that should be excluded from selection
 * These are GraphQL internal fields or aggregation fields
 */
const EXCLUDED_FIELDS = new Set(['__typename', '_count', '_avg', '_sum', '_min', '_max']);

/**
 * Prisma relation arguments that should be forwarded from GraphQL to Prisma
 */
const PRISMA_RELATION_ARGS = new Set(['where', 'orderBy', 'take', 'skip', 'cursor', 'distinct']);

/**
 * Convert a GraphQL AST ValueNode into a plain JavaScript value,
 * resolving variables from the request.
 */
function astValueToJs(valueNode: ValueNode, variableValues: Record<string, unknown>): unknown {
  switch (valueNode.kind) {
    case 'Variable':
      return variableValues[valueNode.name.value];
    case 'IntValue':
      return parseInt(valueNode.value, 10);
    case 'FloatValue':
      return parseFloat(valueNode.value);
    case 'StringValue':
      return valueNode.value;
    case 'BooleanValue':
      return valueNode.value;
    case 'NullValue':
      return null;
    case 'EnumValue':
      return valueNode.value;
    case 'ListValue':
      return valueNode.values.map(v => astValueToJs(v, variableValues));
    case 'ObjectValue': {
      const obj: Record<string, unknown> = {};
      for (const field of valueNode.fields) {
        obj[field.name.value] = astValueToJs(field.value, variableValues);
      }
      return obj;
    }
    default:
      return undefined;
  }
}

/**
 * Extract Prisma-compatible arguments from a GraphQL field node.
 * Handles both inline values and variable references.
 */
function extractFieldArgs(
  fieldNode: FieldNode,
  variableValues: Record<string, unknown>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  if (!fieldNode.arguments || fieldNode.arguments.length === 0) {
    return args;
  }

  for (const arg of fieldNode.arguments) {
    const argName = arg.name.value;

    // Only forward Prisma-compatible relation arguments
    if (!PRISMA_RELATION_ARGS.has(argName)) {
      continue;
    }

    const value = astValueToJs(arg.value, variableValues);
    if (value !== undefined) {
      args[argName] = value;
    }
  }

  return args;
}

/**
 * Parse a selection set into a Prisma select object
 * This function works directly with the AST without schema type introspection.
 * It also extracts relation arguments (where, orderBy, take, skip, cursor, distinct).
 */
function parseSelectionSetSimple(
  selectionSet: SelectionSetNode | undefined,
  info: GraphQLResolveInfo,
  excludeFields?: Set<string>,
  modelFields?: Set<string>,
): Record<string, boolean | PrismaRelation> {
  const select: Record<string, boolean | PrismaRelation> = {};

  if (!selectionSet) {
    return select;
  }

  const variableValues = (info.variableValues ?? {}) as Record<string, unknown>;

  for (const selection of selectionSet.selections) {
    // Handle field selections
    if (selection.kind === 'Field') {
      const fieldNode = selection as FieldNode;
      const fieldName = fieldNode.name.value;

      // Skip excluded fields (internal + user-specified)
      if (EXCLUDED_FIELDS.has(fieldName) || excludeFields?.has(fieldName)) {
        continue;
      }

      // If modelFields provided, skip fields not in Prisma model
      if (modelFields && !modelFields.has(fieldName)) {
        continue;
      }

      // Check if this field has nested selections (relation)
      if (fieldNode.selectionSet) {
        // Recursively parse nested selections
        const nestedSelect = parseSelectionSetSimple(fieldNode.selectionSet, info, excludeFields);

        // Extract relation arguments (where, orderBy, etc.)
        const relationArgs = extractFieldArgs(fieldNode, variableValues);

        if (Object.keys(nestedSelect).length > 0) {
          select[fieldName] = { select: nestedSelect, ...relationArgs };
        } else {
          select[fieldName] = Object.keys(relationArgs).length > 0 ? { ...relationArgs } : true;
        }
      } else {
        // Scalar field
        select[fieldName] = true;
      }
    }
    // Handle fragment spreads
    else if (selection.kind === 'FragmentSpread') {
      const fragmentName = selection.name.value;
      const fragment = info.fragments[fragmentName];

      if (fragment) {
        const fragmentSelect = parseSelectionSetSimple(fragment.selectionSet, info, excludeFields);
        Object.assign(select, fragmentSelect);
      }
    }
    // Handle inline fragments
    else if (selection.kind === 'InlineFragment') {
      if (selection.selectionSet) {
        const inlineSelect = parseSelectionSetSimple(selection.selectionSet, info, excludeFields);
        Object.assign(select, inlineSelect);
      }
    }
  }

  return select;
}

/**
 * Transform GraphQL resolve info into Prisma select/include arguments
 *
 * This is the core optimization function that analyzes the GraphQL query
 * and builds an optimal Prisma query with only the requested fields.
 *
 * @param info - GraphQL resolve info from the resolver
 * @param options - Optional configuration
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
 *
 * // With automatic field filtering using Prisma DMMF:
 * import { Prisma } from '@prisma/client';
 * const select = transformInfoIntoPrismaArgs(info, {
 *   modelFields: getModelFields(Prisma.dmmf, 'Slot')
 * });
 *
 * // Or manually exclude specific fields:
 * const select = transformInfoIntoPrismaArgs(info, { excludeFields: ['occupationStatus'] });
 * ```
 */
export function transformInfoIntoPrismaArgs(
  info: GraphQLResolveInfo,
  options?: TransformOptions,
): PrismaSelect {
  // Get the first field node
  const fieldNode = info.fieldNodes[0];
  if (!fieldNode?.selectionSet) {
    return {};
  }

  // Convert excludeFields array to Set for O(1) lookup
  const excludeSet = options?.excludeFields ? new Set(options.excludeFields) : undefined;

  // Parse the selection set directly from AST
  const select = parseSelectionSetSimple(
    fieldNode.selectionSet,
    info,
    excludeSet,
    options?.modelFields,
  );

  if (Object.keys(select).length === 0) {
    return {};
  }

  return { select };
}

/**
 * Aggregate field names that Prisma expects
 */
const AGGREGATE_FIELDS = new Set(['_count', '_avg', '_sum', '_min', '_max']);

/**
 * Transform GraphQL resolve info into Prisma aggregate arguments
 *
 * This function manually parses the GraphQL field nodes to extract aggregate
 * field selections. Unlike transformInfoIntoPrismaArgs, this returns aggregate
 * fields directly at the top level (e.g., { _count: true, _avg: { field: true } })
 * rather than wrapped in a select object.
 *
 * @param info - GraphQL resolve info from the resolver
 * @returns Prisma aggregate arguments
 *
 * @example
 * ```typescript
 * @Query(() => AggregateUser)
 * async aggregateUser(@Info() info: GraphQLResolveInfo, @Args() args: AggregateUserArgs) {
 *   const aggregateArgs = transformInfoIntoPrismaAggregateArgs(info);
 *   return prisma.user.aggregate({ ...args, ...aggregateArgs });
 * }
 * ```
 */
export function transformInfoIntoPrismaAggregateArgs(
  info: GraphQLResolveInfo,
): PrismaAggregateArgs {
  const result: PrismaAggregateArgs = {};

  // Get the first field node (the aggregate query field)
  const fieldNode = info.fieldNodes[0];
  if (!fieldNode?.selectionSet) {
    return {};
  }

  // Iterate through the selections (e.g., _count, _avg, _sum, etc.)
  for (const selection of fieldNode.selectionSet.selections) {
    if (selection.kind !== 'Field') continue;

    const fieldName = selection.name.value;

    // Only process aggregate fields
    if (!AGGREGATE_FIELDS.has(fieldName)) continue;

    // Check if the field has nested selections
    if (!selection.selectionSet) {
      // No nested selections - for _count, this means count all
      if (fieldName === '_count') {
        result._count = true;
      }
      continue;
    }

    // Parse nested field selections
    const fieldSelect: Record<string, boolean> = {};
    for (const nestedSelection of selection.selectionSet.selections) {
      if (nestedSelection.kind !== 'Field') continue;

      const nestedFieldName = nestedSelection.name.value;

      // Skip __typename
      if (nestedFieldName === '__typename') continue;

      // Special _all field for _count means count all records
      if (nestedFieldName === '_all') {
        if (fieldName === '_count') {
          result._count = true;
          break;
        }
      } else {
        fieldSelect[nestedFieldName] = true;
      }
    }

    // Add to result if we have field selections
    if (Object.keys(fieldSelect).length > 0) {
      (result as any)[fieldName] = fieldSelect;
    } else if (fieldName === '_count' && result._count !== true) {
      result._count = true;
    }
  }

  return result;
}

/**
 * Get Prisma client from GraphQL context
 *
 * @param context - GraphQL context object
 * @returns Prisma client instance
 * @throws Error if Prisma client is not found in context
 *
 * @example
 * ```typescript
 * @Query(() => [User])
 * async users(@Context() ctx: GraphQLContext<PrismaClient>) {
 *   const prisma = getPrismaFromContext(ctx);
 *   return prisma.user.findMany();
 * }
 * ```
 */
export function getPrismaFromContext<PrismaClient = unknown>(
  context: GraphQLContext<PrismaClient>,
): PrismaClient {
  const prismaClient = context.prisma;
  if (!prismaClient) {
    throw new Error(
      'Unable to find Prisma Client in GraphQL context. ' +
        'Please provide it under the `context["prisma"]` key.',
    );
  }
  return prismaClient;
}

/**
 * Merge multiple Prisma select objects
 *
 * @param selects - Array of PrismaSelect objects to merge
 * @returns Merged PrismaSelect object
 */
export function mergePrismaSelects(...selects: PrismaSelect[]): PrismaSelect {
  const result: PrismaSelect = {};
  for (const s of selects) {
    if (s.select) result.select = { ...(result.select ?? {}), ...s.select };
    if (s.include) result.include = { ...(result.include ?? {}), ...s.include };
  }
  return result;
}
