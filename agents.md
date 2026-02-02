# NestJS Prisma GraphQL Generator - Agent Guidelines

## Project Overview

This is a Prisma generator that produces optimized NestJS 11 GraphQL code from Prisma schemas. The key innovation is generating resolvers that use **query selection analysis** instead of slow field resolvers for relations, eliminating N+1 query problems.

### Core Concept

Traditional GraphQL implementations use `@ResolveField()` decorators for relations, which causes N+1 queries:

```typescript
// ❌ SLOW - N+1 problem
@ResolveField()
async posts(@Parent() user: User) {
  return prisma.post.findMany({ where: { authorId: user.id } });
}
```

Our generator produces resolvers that analyze the GraphQL query and build a single optimized Prisma query:

```typescript
// ✅ FAST - Single query with all needed relations
@Query(() => [User])
async users(@Info() info: GraphQLResolveInfo) {
  const select = transformInfoIntoPrismaArgs(info);
  return prisma.user.findMany({
    ...args,
    ...select, // { select: { id: true, name: true, posts: { select: { title: true } } } }
  });
}
```

## Project Structure

```
nestjs-prisma-graphql-generator/
├── src/
│   ├── cli/                          # CLI entry point for Prisma generator
│   │   ├── generator.ts              # generatorHandler registration
│   │   ├── prisma-generator.ts       # Main generate function
│   │   └── options-parser.ts         # Parse generator config options
│   │
│   ├── generator/                    # Code generation logic
│   │   ├── dmmf/                     # DMMF processing
│   │   │   ├── document.ts           # DMMFDocument wrapper class
│   │   │   ├── transformer.ts        # Transform Prisma DMMF to internal types
│   │   │   └── types.ts              # Internal type definitions
│   │   │
│   │   ├── templates/                # Code generation templates
│   │   │   ├── enum.ts               # Generate @registerEnumType
│   │   │   ├── model.ts              # Generate @ObjectType classes
│   │   │   ├── input.ts              # Generate @InputType classes
│   │   │   ├── args.ts               # Generate @ArgsType classes
│   │   │   └── resolver.ts           # Generate CRUD resolvers
│   │   │
│   │   ├── writers/                  # File output
│   │   │   └── file-writer.ts        # Write generated files to disk
│   │   │
│   │   ├── generate.ts               # Main orchestration
│   │   ├── common.ts                 # Common types (AffectedRows)
│   │   └── helpers-generator.ts      # Generate runtime helpers
│   │
│   ├── runtime/                      # Runtime helpers (published with package)
│   │   └── helpers.ts                # transformInfoIntoPrismaArgs, etc.
│   │
│   └── index.ts                      # Package exports
│
├── tests/
│   ├── fixtures/
│   │   └── schema.prisma             # Sample schema for testing
│   ├── unit/                         # Unit tests
│   └── integration/                  # Integration tests
│
├── package.json
├── tsconfig.json
├── jest.config.js
└── agents.md                         # This file
```

## Generated Output Structure

When users run `prisma generate`, this generator produces:

```
@generated/nestjs-graphql/
├── enums/                            # GraphQL enums
│   ├── Role.ts
│   └── index.ts
├── models/                           # @ObjectType classes
│   ├── User.ts
│   ├── Post.ts
│   └── index.ts
├── inputs/                           # @InputType classes
│   ├── UserWhereInput.ts
│   ├── UserCreateInput.ts
│   └── index.ts
├── args/                             # @ArgsType classes
│   ├── FindManyUserArgs.ts
│   ├── CreateUserArgs.ts
│   └── index.ts
├── resolvers/                        # CRUD resolvers
│   ├── UserResolver.ts
│   ├── PostResolver.ts
│   └── index.ts
├── common/                           # Shared types
│   ├── AffectedRows.ts
│   └── index.ts
├── helpers.ts                        # Runtime helpers
└── index.ts                          # Re-exports everything
```

## Key Components

### 1. DMMF Processing (`src/generator/dmmf/`)

The DMMF (Data Model Meta Format) is Prisma's internal representation of the schema. We transform it into our internal types for easier processing:

- **DMMFDocument**: Main wrapper class with lazy-loaded accessors
- **transformer.ts**: Functions to convert DMMF types to internal types
- **types.ts**: Internal type definitions (Model, Field, Enum, Relation)

### 2. Template Generators (`src/generator/templates/`)

Each template generator produces specific types of files:

- **enum.ts**: Generates enums with `registerEnumType()`
- **model.ts**: Generates `@ObjectType` classes from Prisma models
- **input.ts**: Generates `@InputType` classes for mutations
- **args.ts**: Generates `@ArgsType` classes for query arguments
- **resolver.ts**: Generates full CRUD resolvers

### 3. Runtime Helpers (`src/runtime/helpers.ts`)

These helpers are included in the generated output and used at runtime:

- **transformInfoIntoPrismaArgs()**: Converts GraphQL `ResolveInfo` to Prisma `select`/`include`
- **getPrismaFromContext()**: Extracts Prisma client from GraphQL context
- **mergePrismaSelects()**: Merges multiple select objects

### 4. Generator Configuration

Users configure the generator in their `schema.prisma`:

```prisma
generator nestjsGraphql {
  provider           = "nestjs-prisma-graphql-generator"
  output             = "../src/generated/graphql"
  generateResolvers  = "true"
  prismaClientPath   = "@prisma/client"
}
```

## CRUD Operations Generated

For each model, we generate these operations:

### Queries

- `findMany{Model}` - List with filtering, sorting, pagination
- `findUnique{Model}` - Single by unique field
- `findFirst{Model}` - First matching record
- `aggregate{Model}` - Aggregations (count, avg, sum, etc.)
- `groupBy{Model}` - Group by fields
- `{model}Count` - Count records

### Mutations

- `createOne{Model}` - Create single record
- `createMany{Model}` - Create multiple records
- `updateOne{Model}` - Update single record
- `updateMany{Model}` - Update multiple records
- `upsertOne{Model}` - Create or update
- `deleteOne{Model}` - Delete single record
- `deleteMany{Model}` - Delete multiple records

## Development Guidelines

### Adding New Features

1. **New Input Types**: Add to `src/generator/templates/input.ts`
2. **New Args Types**: Add to `src/generator/templates/args.ts`
3. **New Resolver Methods**: Add to `src/generator/templates/resolver.ts`
4. **New Configuration Options**: Add to `src/cli/options-parser.ts`

### Code Generation with ts-morph

We use `ts-morph` for AST-based code generation. Key patterns:

```typescript
// Create a class with decorators
sourceFile.addClass({
  name: 'UserResolver',
  isExported: true,
  decorators: [{ name: 'Resolver', arguments: ['() => User'] }],
});

// Add a method with decorators
classDecl.addMethod({
  name: 'users',
  isAsync: true,
  decorators: [{ name: 'Query', arguments: ['() => [User]'] }],
  parameters: [{ name: 'info', type: 'GraphQLResolveInfo', decorators: [{ name: 'Info' }] }],
  returnType: 'Promise<User[]>',
  statements: ['return prisma.user.findMany();'],
});
```

### Testing Strategy

1. **Unit Tests**: Test individual functions in isolation
   - DMMF transformers
   - Options parser
   - Runtime helpers

2. **Template Tests**: Test generated code structure
   - Verify decorators are correct
   - Verify imports are present
   - Verify types are correct

3. **Integration Tests**: Test full generation pipeline
   - Parse real Prisma schema
   - Generate all files
   - Verify output structure

### Important Patterns

#### Avoiding N+1 Queries

The core pattern for optimized queries:

```typescript
@Query(() => [User])
async users(
  @Args() args: FindManyUserArgs,
  @Info() info: GraphQLResolveInfo,
) {
  // 1. Parse GraphQL selection
  const select = transformInfoIntoPrismaArgs(info);

  // 2. Get Prisma from context
  const prisma = getPrismaFromContext(info);

  // 3. Execute single optimized query
  return prisma.user.findMany({
    ...args,
    ...select,
  });
}
```

#### Handling Relations

Relations are included in the `select` object automatically:

```graphql
query {
  users {
    id
    name
    posts {
      # This becomes: posts: { select: { title: true } }
      title
    }
  }
}
```

Transforms to:

```typescript
prisma.user.findMany({
  select: {
    id: true,
    name: true,
    posts: {
      select: {
        title: true,
      },
    },
  },
});
```

## Common Tasks

### Running Tests

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
```

### Building

```bash
npm run build            # Compile TypeScript
npm run build:watch      # Watch mode
```

### Testing Generator Locally

1. Link the package:

   ```bash
   npm link
   ```

2. In a test project:
   ```bash
   npm link nestjs-prisma-graphql-generator
   npx prisma generate
   ```

## Dependencies

### Runtime Dependencies

- `@prisma/generator-helper` - Prisma generator protocol
- `@prisma/internals` - Prisma internal utilities
- `ts-morph` - TypeScript AST manipulation
- `graphql-parse-resolve-info` - Parse GraphQL selections
- `pluralize` - Pluralize model names

### Peer Dependencies (user must install)

- `@nestjs/common` - NestJS core
- `@nestjs/graphql` - NestJS GraphQL module
- `@prisma/client` - Prisma client
- `graphql` - GraphQL core

## Future Enhancements

1. **DataLoader Support**: Optional DataLoader integration for edge cases
2. **Custom Scalars**: Support for custom GraphQL scalars
3. **Subscriptions**: Generate GraphQL subscriptions
4. **Caching**: Integration with caching strategies
5. **Authorization**: Built-in authorization decorators
6. **Validation**: class-validator integration

## References

- [Prisma Generator Guide](https://www.prisma.io/docs/concepts/components/prisma-schema/generators)
- [NestJS GraphQL](https://docs.nestjs.com/graphql/quick-start)
- [graphql-parse-resolve-info](https://github.com/graphile/graphile-engine/tree/master/packages/graphql-parse-resolve-info)
- [ts-morph Documentation](https://ts-morph.com/)
