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
 * Prisma DMMF type for model field introspection
 */
export interface PrismaDMMF {
  datamodel: {
    models: Array<{
      name: string;
      fields: Array<{
        name: string;
        kind: string;
        type: string;
      }>;
    }>;
  };
}

/**
 * Model field information extracted from DMMF
 */
export interface ModelFieldInfo {
  /** Scalar field names (non-relation fields) */
  scalars: Set<string>;
  /** Relation field name -> related model name */
  relations: Map<string, string>;
}

/**
 * Cache for model fields extracted from DMMF
 */
const modelFieldsCache = new Map<string, ModelFieldInfo>();

/**
 * Cache for pre-built field filter functions (per model + exclude combination)
 */
const fieldFilterCache = new Map<string, FieldFilter>();

/**
 * Fast field filter function type
 * Returns: 'scalar' | 'relation' | null (null means skip)
 */
export type FieldFilterResult = 'scalar' | 'relation' | null;
export type FieldFilter = (fieldName: string) => FieldFilterResult;

/**
 * Create a fast field filter function that combines all exclusion checks.
 * Returns a single function for O(1) field classification.
 *
 * @param modelFields - Model field info (scalars/relations)
 * @param excludeFields - Optional additional fields to exclude
 * @returns Fast filter function
 */
export function createFieldFilter(
  modelFields?: ModelFieldInfo,
  excludeFields?: Set<string> | readonly string[],
): FieldFilter {
  // Convert array to Set if needed
  const excludeSet =
    excludeFields instanceof Set
      ? excludeFields
      : excludeFields
        ? new Set(excludeFields)
        : undefined;

  // If we have model info, create a strict filter
  if (modelFields) {
    const { scalars, relations } = modelFields;

    return (fieldName: string): FieldFilterResult => {
      // Fast path: check excluded first (most likely to be small)
      if (EXCLUDED_FIELDS.has(fieldName)) return null;
      if (excludeSet?.has(fieldName)) return null;

      // Check relations first (usually fewer than scalars)
      if (relations.has(fieldName)) return 'relation';
      if (scalars.has(fieldName)) return 'scalar';

      // Not in model - skip (custom @ResolveField)
      return null;
    };
  }

  // No model info - permissive filter (original behavior)
  return (fieldName: string): FieldFilterResult => {
    if (EXCLUDED_FIELDS.has(fieldName)) return null;
    if (excludeSet?.has(fieldName)) return null;
    // Without model info, we can't distinguish - return 'scalar' as default
    // The caller should check for selectionSet to determine if it's a relation
    return 'scalar';
  };
}

/**
 * Get or create a cached field filter for a model
 *
 * @param dmmf - Prisma DMMF
 * @param modelName - Model name
 * @param excludeFields - Fields to exclude
 * @returns Cached field filter function
 */
export function getFieldFilter(
  dmmf: PrismaDMMF,
  modelName: string,
  excludeFields?: readonly string[],
): FieldFilter {
  // Create cache key including excluded fields for uniqueness
  const excludeKey = excludeFields?.length ? `:${excludeFields.join(',')}` : '';
  const cacheKey = `${modelName}${excludeKey}`;

  let filter = fieldFilterCache.get(cacheKey);
  if (!filter) {
    const modelFields = getModelFields(dmmf, modelName);
    const excludeSet = excludeFields?.length ? new Set(excludeFields) : undefined;
    filter = createFieldFilter(modelFields, excludeSet);
    fieldFilterCache.set(cacheKey, filter);
  }

  return filter;
}

/**
 * Batch filter result with classified fields
 */
export interface BatchFilterResult {
  /** Scalar field names that exist in Prisma model */
  scalars: string[];
  /** Relation field names that exist in Prisma model */
  relations: string[];
}

/**
 * Filter multiple field names at once using a pre-built filter.
 * This is faster than calling filter.has() multiple times when processing
 * many fields, as it loops once and classifies all fields.
 *
 * @param fields - Array of field names to classify
 * @param filter - Pre-built field filter (from createFieldFilter or getFieldFilter)
 * @returns Object with scalars and relations arrays
 *
 * @example
 * ```typescript
 * const filter = getFieldFilter(Prisma.dmmf, 'User');
 * const { scalars, relations } = filterFieldsBatch(['id', 'name', 'posts', '__typename'], filter);
 * // scalars: ['id', 'name']
 * // relations: ['posts']
 * ```
 */
export function filterFieldsBatch(
  fields: readonly string[],
  filter: FieldFilter,
): BatchFilterResult {
  const scalars: string[] = [];
  const relations: string[] = [];

  for (const field of fields) {
    const result = filter(field);
    if (result === 'scalar') {
      scalars.push(field);
    } else if (result === 'relation') {
      relations.push(field);
    }
    // null means skip (excluded or not in model)
  }

  return { scalars, relations };
}

/**
 * Create a fast Prisma select object from an array of field names.
 * Uses a pre-built filter for O(1) classification per field.
 *
 * @param fields - Array of field names
 * @param filter - Pre-built field filter
 * @returns Prisma-compatible select object with only valid fields
 *
 * @example
 * ```typescript
 * const filter = getFieldFilter(Prisma.dmmf, 'User');
 * const select = buildSelectFromFields(['id', 'name', 'computedField'], filter);
 * // { id: true, name: true } - computedField excluded if not in Prisma model
 * ```
 */
export function buildSelectFromFields(
  fields: readonly string[],
  filter: FieldFilter,
): Record<string, true> {
  const select: Record<string, true> = {};

  for (const fieldName of fields) {
    const result = filter(fieldName);
    if (result !== null) {
      select[fieldName] = true;
    }
  }

  return select;
}

/**
 * Extract scalar and relation field names from Prisma DMMF for a model.
 * Results are cached for performance.
 *
 * @param dmmf - Prisma DMMF object (import { Prisma } from '@prisma/client', use Prisma.dmmf)
 * @param modelName - Name of the model (e.g., 'User', 'Slot')
 * @returns ModelFieldInfo with scalars and relations
 *
 * @example
 * ```typescript
 * import { Prisma } from '@prisma/client';
 * const fields = getModelFields(Prisma.dmmf, 'Slot');
 * // fields.scalars: Set<string> - all scalar field names
 * // fields.relations: Map<string, string> - relation field name -> related model name
 * ```
 */
export function getModelFields(dmmf: PrismaDMMF, modelName: string): ModelFieldInfo {
  const cached = modelFieldsCache.get(modelName);
  if (cached) return cached;

  const model = dmmf.datamodel.models.find(m => m.name === modelName);
  if (!model) {
    throw new Error(`Model "${modelName}" not found in Prisma DMMF`);
  }

  const scalars = new Set<string>();
  const relations = new Map<string, string>();

  for (const field of model.fields) {
    if (field.kind === 'object') {
      relations.set(field.name, field.type);
    } else {
      scalars.add(field.name);
    }
  }

  const info: ModelFieldInfo = { scalars, relations };
  modelFieldsCache.set(modelName, info);
  return info;
}

/**
 * Options for transformInfoIntoPrismaArgs
 */
export interface TransformOptions {
  /**
   * Fields to exclude from the Prisma select at all nesting levels.
   * Use this for custom @ResolveField() computed fields that don't exist in Prisma.
   * @example ['occupationStatus', 'computedField']
   */
  excludeFields?: string[];

  /**
   * Prisma DMMF for automatic field filtering.
   * When provided with modelName, only valid Prisma fields will be selected.
   * @example Prisma.dmmf
   */
  dmmf?: PrismaDMMF;

  /**
   * Root model name for automatic field filtering.
   * Used with dmmf to filter out non-Prisma fields recursively.
   * @example 'User'
   */
  modelName?: string;
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
 * When dmmf and modelFields are provided, filters out fields not in Prisma model.
 */
function parseSelectionSetSimple(
  selectionSet: SelectionSetNode | undefined,
  info: GraphQLResolveInfo,
  excludeFields?: Set<string>,
  dmmf?: PrismaDMMF,
  modelFields?: ModelFieldInfo,
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

      // If modelFields provided, filter based on Prisma model schema
      if (modelFields) {
        const isScalar = modelFields.scalars.has(fieldName);
        const isRelation = modelFields.relations.has(fieldName);

        if (!isScalar && !isRelation) {
          // Field doesn't exist in Prisma model - skip it (custom @ResolveField)
          continue;
        }

        if (isRelation && fieldNode.selectionSet && dmmf) {
          // For relations, recursively get related model's fields
          const relatedModelName = modelFields.relations.get(fieldName)!;
          const relatedModelFields = getModelFields(dmmf, relatedModelName);
          const nestedSelect = parseSelectionSetSimple(
            fieldNode.selectionSet,
            info,
            excludeFields,
            dmmf,
            relatedModelFields,
          );

          const relationArgs = extractFieldArgs(fieldNode, variableValues);

          if (Object.keys(nestedSelect).length > 0) {
            select[fieldName] = { select: nestedSelect, ...relationArgs };
          } else {
            select[fieldName] = Object.keys(relationArgs).length > 0 ? { ...relationArgs } : true;
          }
          continue;
        }

        // Scalar field
        if (isScalar) {
          select[fieldName] = true;
          continue;
        }
      }

      // Fallback: no modelFields filtering (original behavior)
      if (fieldNode.selectionSet) {
        // Recursively parse nested selections
        const nestedSelect = parseSelectionSetSimple(
          fieldNode.selectionSet,
          info,
          excludeFields,
          dmmf,
          undefined, // No model fields for nested if we don't have relation info
        );

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
        const fragmentSelect = parseSelectionSetSimple(
          fragment.selectionSet,
          info,
          excludeFields,
          dmmf,
          modelFields,
        );
        Object.assign(select, fragmentSelect);
      }
    }
    // Handle inline fragments
    else if (selection.kind === 'InlineFragment') {
      if (selection.selectionSet) {
        const inlineSelect = parseSelectionSetSimple(
          selection.selectionSet,
          info,
          excludeFields,
          dmmf,
          modelFields,
        );
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
 * // Automatic field filtering using Prisma DMMF (recommended):
 * import { Prisma } from '@prisma/client';
 * const select = transformInfoIntoPrismaArgs(info, {
 *   dmmf: Prisma.dmmf,
 *   modelName: 'User',
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

  // Get model fields if dmmf and modelName are provided
  let modelFields: ModelFieldInfo | undefined;
  if (options?.dmmf && options?.modelName) {
    modelFields = getModelFields(options.dmmf, options.modelName);
  }

  // Parse the selection set directly from AST
  const select = parseSelectionSetSimple(
    fieldNode.selectionSet,
    info,
    excludeSet,
    options?.dmmf,
    modelFields,
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
