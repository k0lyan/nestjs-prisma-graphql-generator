/**
 * NestJS Prisma GraphQL Generator
 *
 * A Prisma generator that produces optimized NestJS GraphQL resolvers,
 * object types, input types, and args from Prisma models.
 *
 * Key features:
 * - Generates @ObjectType classes from Prisma models
 * - Generates @InputType classes for CRUD operations
 * - Generates @ArgsType classes for query/mutation arguments
 * - Generates full CRUD resolvers with optimized Prisma queries
 * - Uses GraphQL selection analysis to build minimal Prisma queries
 * - Avoids N+1 problems without using slow field resolvers
 *
 * @example
 * ```prisma
 * generator nestjsGraphql {
 *   provider = "nestjs-prisma-graphql-generator"
 *   output   = "../src/generated/graphql"
 * }
 * ```
 */

export * from './cli';
export * from './generator';
// Note: runtime helpers are exported separately to avoid conflicts
export {
  transformInfoIntoPrismaArgs,
  transformInfoIntoPrismaAggregateArgs,
  getPrismaFromContext,
  mergePrismaSelects,
  type PrismaSelect,
  type PrismaAggregateArgs,
  type GraphQLContext,
} from './runtime';
