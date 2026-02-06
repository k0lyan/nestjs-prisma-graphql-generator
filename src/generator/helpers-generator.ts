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
 *
 * This implementation uses manual AST parsing of GraphQL field nodes
 * to avoid issues with the graphql-parse-resolve-info library.
 */

import type {
  GraphQLResolveInfo,
  SelectionSetNode,
  GraphQLOutputType,
  GraphQLObjectType,
  GraphQLField,
} from 'graphql';
import {
  getNamedType,
} from 'graphql';

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
 * Unwrap GraphQL type to get the underlying object type
 * Handles NonNull and List wrappers
 */
function unwrapType(type: GraphQLOutputType): GraphQLObjectType | null {
  // Use getNamedType to unwrap all layers (NonNull, List, etc.)
  const namedType = getNamedType(type);

  // Check if it's an object type with getFields method
  if (namedType && typeof (namedType as any).getFields === 'function') {
    return namedType as GraphQLObjectType;
  }

  return null;
}

/**
 * Get field definition from a GraphQL object type
 */
function getFieldDef(
  parentType: GraphQLObjectType,
  fieldName: string,
): GraphQLField<unknown, unknown> | undefined {
  const fields = parentType.getFields();
  return fields[fieldName];
}

/**
 * Parse a selection set into a Prisma select object
 */
function parseSelectionSet(
  selectionSet: SelectionSetNode | undefined,
  parentType: GraphQLObjectType,
  info: GraphQLResolveInfo,
): Record<string, boolean | PrismaSelect> {
  const select: Record<string, boolean | PrismaSelect> = {};

  if (!selectionSet) {
    return select;
  }

  for (const selection of selectionSet.selections) {
    // Handle field selections
    if (selection.kind === 'Field') {
      const fieldName = selection.name.value;

      // Skip excluded fields
      if (EXCLUDED_FIELDS.has(fieldName)) {
        continue;
      }

      // Get the field definition from the schema
      const fieldDef = getFieldDef(parentType, fieldName);
      if (!fieldDef) {
        // Field not found in schema, skip it
        continue;
      }

      // Check if this field has nested selections (relation)
      if (selection.selectionSet) {
        // Get the return type of the field
        const fieldType = unwrapType(fieldDef.type);

        if (fieldType) {
          // Recursively parse nested selections
          const nestedSelect = parseSelectionSet(
            selection.selectionSet,
            fieldType,
            info,
          );

          if (Object.keys(nestedSelect).length > 0) {
            select[fieldName] = { select: nestedSelect };
          } else {
            select[fieldName] = true;
          }
        } else {
          select[fieldName] = true;
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
        // Get the type the fragment is on
        const fragmentTypeName = fragment.typeCondition.name.value;
        const fragmentType = info.schema.getType(fragmentTypeName);

        if (fragmentType && isObjectType(fragmentType)) {
          const fragmentSelect = parseSelectionSet(
            fragment.selectionSet,
            fragmentType,
            info,
          );
          Object.assign(select, fragmentSelect);
        }
      }
    }
    // Handle inline fragments
    else if (selection.kind === 'InlineFragment') {
      let fragmentType: GraphQLObjectType | null = parentType;

      if (selection.typeCondition) {
        const typeName = selection.typeCondition.name.value;
        const conditionType = info.schema.getType(typeName);
        fragmentType = conditionType && isObjectType(conditionType) ? conditionType : null;
      }

      if (fragmentType) {
        const inlineSelect = parseSelectionSet(
          selection.selectionSet,
          fragmentType,
          info,
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
 * @returns Prisma select object
 */
export function transformInfoIntoPrismaArgs(info: GraphQLResolveInfo): PrismaSelect {
  // Get the first field node
  const fieldNode = info.fieldNodes[0];
  if (!fieldNode?.selectionSet) {
    return {};
  }

  // Get the return type of the query/mutation field
  const returnType = unwrapType(info.returnType);
  if (!returnType) {
    return {};
  }

  // Parse the selection set
  const select = parseSelectionSet(fieldNode.selectionSet, returnType, info);

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
 */
export function transformInfoIntoPrismaAggregateArgs(info: GraphQLResolveInfo): PrismaAggregateArgs {
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
