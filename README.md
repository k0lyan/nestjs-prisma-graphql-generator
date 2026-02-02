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

```
src/generated/graphql/
├── enums/          # GraphQL enums
├── models/         # @ObjectType classes
├── inputs/         # @InputType classes
├── args/           # @ArgsType classes
├── resolvers/      # CRUD resolvers
├── common/         # Shared types
├── helpers.ts      # Runtime helpers
└── index.ts
```

## Using Generated Code

### 1. Setup GraphQL Module

```typescript
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { PrismaService } from './prisma.service';
import { UserResolver, PostResolver } from './generated/graphql';

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
  providers: [PrismaService, UserResolver, PostResolver],
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

  // Custom output directories
  modelsOutput       = "models"
  inputsOutput       = "inputs"
  argsOutput         = "args"
  enumsOutput        = "enums"
  resolversOutput    = "resolvers"
}
```

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
