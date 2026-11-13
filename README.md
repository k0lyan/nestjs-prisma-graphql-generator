# NestJS Prisma GraphQL Generator

A Prisma generator that produces **optimized** NestJS 11 GraphQL resolvers, object types, input types, and args from Prisma models.

## Key Features

- 🚀 **Optimized Queries** - No N+1 problems! Uses GraphQL selection analysis to build minimal Prisma queries
- 📦 **Full CRUD** - Generates complete CRUD resolvers (findMany, findUnique, create, update, delete, etc.)
- 🎯 **NestJS Native** - Uses `@nestjs/graphql` decorators (`@ObjectType`, `@Resolver`, `@Query`, `@Mutation`)
- 🔧 **Configurable** - Customize output directories, select specific blocks to generate
- 📝 **Type-Safe** - Full TypeScript support with proper type inference

## Why This Generator?

Traditional GraphQL resolvers use `@ResolveField()` for relations, causing N+1 queries:

```typescript
// ❌ SLOW - Causes N+1 queries on large lists
@ResolveField(() => [Post])
async posts(@Parent() user: User) {
  return this.prisma.post.findMany({ where: { authorId: user.id } });
}
```

This generator produces resolvers that analyze the GraphQL query and build a **single optimized Prisma query**:

```typescript
// ✅ FAST - Single query with all needed data
@Query(() => [User])
async users(@Info() info: GraphQLResolveInfo, @Args() args: FindManyUserArgs) {
  const select = transformInfoIntoPrismaArgs(info);
  return this.prisma.user.findMany({ ...args, ...select });
}
```

## Installation

```bash
npm install nestjs-prisma-graphql-generator
```

## Usage

Add the generator to your `schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

generator nestjsGraphql {
  provider = "nestjs-prisma-graphql-generator"
  output   = "../src/generated/graphql"
}

model User {
  id    String @id @default(cuid())
  email String @unique
  name  String?
  posts Post[]
}

model Post {
  id       String @id @default(cuid())
  title    String
  author   User   @relation(fields: [authorId], references: [id])
  authorId String
}
```

Run Prisma generate:

```bash
npx prisma generate
```

## Generated Output

With `groupByModel = "true"` (default), files are grouped by model:

```
src/generated/graphql/
├── models/
│   ├── User/
│   │   ├── model.ts        # @ObjectType class
│   │   ├── inputs.ts       # @InputType classes for this model
│   │   ├── args.ts         # @ArgsType classes for this model
│   │   ├── resolver.ts     # CRUD resolver (queries + mutations)
│   │   ├── aggregations.ts # Aggregate/GroupBy types and resolver
│   │   └── index.ts
│   ├── Post/
│   │   └── ...
│   └── index.ts
├── enums/                  # GraphQL enums
├── common/                 # Shared types (AffectedRows, filters)
├── helpers.ts              # Runtime helpers
└── index.ts
```

## Using Generated Code

### 1. Setup GraphQL Module

```typescript
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { PrismaService } from './prisma.service';
import {
  UserResolver,
  UserAggregateResolver,
  PostResolver,
  PostAggregateResolver,
} from './generated/graphql/models';

@Module({
  imports: [
    GraphQLModule.forRoot({
      driver: ApolloDriver,
      autoSchemaFile: true,
      context: ({ req }) => ({
        prisma: new PrismaService(), // Or inject via DI
      }),
    }),
  ],
  providers: [
    PrismaService,
    UserResolver,
    UserAggregateResolver,
    PostResolver,
    PostAggregateResolver,
  ],
})
export class AppModule {}
```

### 2. Query with Relations

```graphql
query {
  users {
    id
    name
    posts {
      id
      title
    }
  }
}
```

This generates a **single** Prisma query:

```typescript
prisma.user.findMany({
  select: {
    id: true,
    name: true,
    posts: {
      select: {
        id: true,
        title: true,
      },
    },
  },
});
```

## Configuration Options

```prisma
generator nestjsGraphql {
  provider           = "nestjs-prisma-graphql-generator"
  output             = "../src/generated/graphql"

  // Generate only specific blocks
  emitOnly           = "models,resolvers"

  // Disable resolver generation
  generateResolvers  = "true"

  // Custom Prisma client import path
  prismaClientPath   = "@prisma/client"

  // Add prefix/suffix to type names
  typePrefix         = ""
  typeSuffix         = ""

  // Use require() for relation imports (helps with circular deps in large projects)
  // Default: true
  useRequireForRelations = "true"

  // Re-export enums from Prisma client instead of generating new ones
  // This avoids duplicate enum definitions and ensures consistency
  // Default: false
  usePrismaEnums     = "false"

  // Expose `DateTime @db.Date` fields as a `LocalDate` scalar (YYYY-MM-DD) typed as
  // Temporal.PlainDate, with LocalDate* filter/update inputs (requires groupByModel)
  // Default: false
  localDate          = "false"

  // Module that exports `Temporal` (used when localDate is enabled)
  // Default: temporal-polyfill
  temporalImport     = "temporal-polyfill"

  // Custom output directories
  modelsOutput       = "models"
  inputsOutput       = "inputs"
  argsOutput         = "args"
  enumsOutput        = "enums"
  resolversOutput    = "resolvers"
}
```

## Local dates (`localDate`)

With `localDate = "true"`, every `DateTime` field with the `@db.Date` native type is generated as the
`LocalDate` GraphQL scalar (`GraphQLLocalDate` in `helpers.ts`) with TypeScript type `Temporal.PlainDate`,
in model types, aggregate/groupBy outputs and all model inputs. Filters and update operations on these
fields use `LocalDate*` counterparts of Prisma's shared `DateTime*` inputs (e.g. `LocalDateFilter`,
`NullableLocalDateFieldUpdateOperationsInput`). Timestamp columns keep using `Date`.

The scalar serializes `Temporal.PlainDate`, `Date` (UTC calendar day) and `YYYY-MM-DD` strings, and only
accepts valid `YYYY-MM-DD` strings as input.

Prisma itself still returns and expects `Date` for these columns, so install a Prisma client extension that
converts between `Date` and `Temporal.PlainDate`. The generated `local-date-fields.ts` exports
`LOCAL_DATE_FIELDS` (model -> field -> `'required' | 'optional'`) to drive it.

## Generated Operations

For each model, the following operations are generated:

### Queries

- `findMany{Model}` - List with filtering, sorting, pagination
- `findUnique{Model}` - Get single by unique field
- `findFirst{Model}` - Get first matching record
- `aggregate{Model}` - Aggregations
- `groupBy{Model}` - Group by fields
- `{model}Count` - Count records

### Mutations

- `createOne{Model}` - Create single
- `createMany{Model}` - Create multiple
- `updateOne{Model}` - Update single
- `updateMany{Model}` - Update multiple
- `upsertOne{Model}` - Create or update
- `deleteOne{Model}` - Delete single
- `deleteMany{Model}` - Delete multiple

## Requirements

- Node.js >= 18
- Prisma >= 7.0
- NestJS >= 10
- `@nestjs/graphql` >= 12

## License

MIT
