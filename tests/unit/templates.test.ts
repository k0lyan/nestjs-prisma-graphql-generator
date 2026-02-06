import type { DMMF } from '@prisma/generator-helper';
import { DMMFDocument } from '../../src/generator/dmmf/document';
import type { GeneratorConfig } from '../../src/cli/options-parser';
import { Project } from 'ts-morph';
import { generateEnums } from '../../src/generator/templates/enum';
import { generateModels } from '../../src/generator/templates/model';
import { generateResolvers } from '../../src/generator/templates/resolver';

describe('Template Generators', () => {
  let project: Project;
  let config: GeneratorConfig;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
    });
    config = {
      generateResolvers: true,
      useValidation: false,
      prismaClientPath: '@prisma/client',
      emitCompiled: false,
      outputDirs: {
        models: 'models',
        inputs: 'inputs',
        args: 'args',
        enums: 'enums',
        resolvers: 'resolvers',
      },
    };
  });

  describe('generateEnums', () => {
    it('should generate enum files', () => {
      const mockDMMF: DMMF.Document = {
        datamodel: {
          models: [],
          enums: [
            {
              name: 'Role',
              values: [
                { name: 'USER', dbName: null },
                { name: 'ADMIN', dbName: null },
              ],
            },
          ],
          types: [],
          indexes: [],
        },
        schema: {
          inputObjectTypes: { prisma: [], model: [] },
          outputObjectTypes: { prisma: [], model: [] },
          enumTypes: { prisma: [], model: [] },
          fieldRefTypes: { prisma: [] },
        },
        mappings: {
          modelOperations: [],
          otherOperations: { read: [], write: [] },
        },
      };

      const dmmfDoc = new DMMFDocument(mockDMMF, config);
      const files = generateEnums(project, dmmfDoc, config);

      expect(files.size).toBe(2); // Role.ts + index.ts
      expect(files.has('enums/Role.ts')).toBe(true);
      expect(files.has('enums/index.ts')).toBe(true);

      const roleFile = files.get('enums/Role.ts');
      const content = roleFile?.getFullText() ?? '';

      expect(content).toContain('registerEnumType');
      expect(content).toContain('@nestjs/graphql');
      expect(content).toContain('export enum Role');
      expect(content).toContain('USER = "USER"');
      expect(content).toContain('ADMIN = "ADMIN"');
      expect(content).toContain('registerEnumType(Role');
    });

    it('should re-export Prisma enums when usePrismaEnums is enabled', () => {
      const mockDMMF: DMMF.Document = {
        datamodel: {
          models: [],
          enums: [
            {
              name: 'Status',
              values: [
                { name: 'ACTIVE', dbName: null },
                { name: 'INACTIVE', dbName: null },
              ],
            },
          ],
          types: [],
          indexes: [],
        },
        schema: {
          inputObjectTypes: { prisma: [], model: [] },
          outputObjectTypes: { prisma: [], model: [] },
          enumTypes: { prisma: [], model: [] },
          fieldRefTypes: { prisma: [] },
        },
        mappings: {
          modelOperations: [],
          otherOperations: { read: [], write: [] },
        },
      };

      const prismaEnumConfig = { ...config, usePrismaEnums: true };
      const dmmfDoc = new DMMFDocument(mockDMMF, prismaEnumConfig);
      const files = generateEnums(project, dmmfDoc, prismaEnumConfig);

      expect(files.size).toBe(2);
      expect(files.has('enums/Status.ts')).toBe(true);

      const statusFile = files.get('enums/Status.ts');
      const content = statusFile?.getFullText() ?? '';

      // Should import and re-export from Prisma client
      expect(content).toContain('import { Status } from "@prisma/client"');
      expect(content).toContain('export { Status } from "@prisma/client"');
      // Should NOT generate enum definition
      expect(content).not.toContain('export enum Status');
      // Should still register for GraphQL
      expect(content).toContain('registerEnumType(Status');
    });

    it('should use custom prismaClientPath when re-exporting Prisma enums', () => {
      const mockDMMF: DMMF.Document = {
        datamodel: {
          models: [],
          enums: [
            {
              name: 'Priority',
              values: [
                { name: 'LOW', dbName: null },
                { name: 'HIGH', dbName: null },
              ],
            },
          ],
          types: [],
          indexes: [],
        },
        schema: {
          inputObjectTypes: { prisma: [], model: [] },
          outputObjectTypes: { prisma: [], model: [] },
          enumTypes: { prisma: [], model: [] },
          fieldRefTypes: { prisma: [] },
        },
        mappings: {
          modelOperations: [],
          otherOperations: { read: [], write: [] },
        },
      };

      const customConfig = {
        ...config,
        usePrismaEnums: true,
        prismaClientPath: './generated/prisma',
      };
      const dmmfDoc = new DMMFDocument(mockDMMF, customConfig);
      const files = generateEnums(project, dmmfDoc, customConfig);

      const priorityFile = files.get('enums/Priority.ts');
      const content = priorityFile?.getFullText() ?? '';

      expect(content).toContain('import { Priority } from "./generated/prisma"');
      expect(content).toContain('export { Priority } from "./generated/prisma"');
    });
  });

  describe('generateModels', () => {
    it('should generate model files with @ObjectType decorator', () => {
      const mockDMMF: DMMF.Document = {
        datamodel: {
          models: [
            {
              name: 'User',
              dbName: 'users',
              schema: null,
              fields: [
                {
                  name: 'id',
                  kind: 'scalar',
                  isList: false,
                  isRequired: true,
                  isUnique: false,
                  isId: true,
                  isReadOnly: false,
                  hasDefaultValue: true,
                  type: 'String',
                  isGenerated: false,
                  isUpdatedAt: false,
                },
                {
                  name: 'email',
                  kind: 'scalar',
                  isList: false,
                  isRequired: true,
                  isUnique: true,
                  isId: false,
                  isReadOnly: false,
                  hasDefaultValue: false,
                  type: 'String',
                  isGenerated: false,
                  isUpdatedAt: false,
                },
                {
                  name: 'name',
                  kind: 'scalar',
                  isList: false,
                  isRequired: false,
                  isUnique: false,
                  isId: false,
                  isReadOnly: false,
                  hasDefaultValue: false,
                  type: 'String',
                  isGenerated: false,
                  isUpdatedAt: false,
                },
              ],
              primaryKey: null,
              uniqueFields: [],
              uniqueIndexes: [],
              isGenerated: false,
            },
          ],
          enums: [],
          types: [],
          indexes: [],
        },
        schema: {
          inputObjectTypes: { prisma: [], model: [] },
          outputObjectTypes: { prisma: [], model: [] },
          enumTypes: { prisma: [], model: [] },
          fieldRefTypes: { prisma: [] },
        },
        mappings: {
          modelOperations: [],
          otherOperations: { read: [], write: [] },
        },
      };

      const dmmfDoc = new DMMFDocument(mockDMMF, config);
      const files = generateModels(project, dmmfDoc, config);

      expect(files.size).toBe(2); // User.ts + index.ts
      expect(files.has('models/User.ts')).toBe(true);

      const userFile = files.get('models/User.ts');
      const content = userFile?.getFullText() ?? '';

      expect(content).toContain('import { ObjectType, Field, ID');
      expect(content).toContain('@ObjectType');
      expect(content).toContain('export class User');
      // String id field should use String type, not ID (ID type conversion was removed)
      expect(content).toContain('@Field(() => String)');
      expect(content).toContain('id!: string');
      expect(content).toContain('email!: string');
      expect(content).toContain('{ nullable: true }');
      expect(content).toContain('name?: string | null');
    });
  });

  describe('generateResolvers', () => {
    it('should generate resolver files with CRUD operations', () => {
      const mockDMMF: DMMF.Document = {
        datamodel: {
          models: [
            {
              name: 'User',
              dbName: 'users',
              schema: null,
              fields: [
                {
                  name: 'id',
                  kind: 'scalar',
                  isList: false,
                  isRequired: true,
                  isUnique: false,
                  isId: true,
                  isReadOnly: false,
                  hasDefaultValue: true,
                  type: 'String',
                  isGenerated: false,
                  isUpdatedAt: false,
                },
              ],
              primaryKey: null,
              uniqueFields: [],
              uniqueIndexes: [],
              isGenerated: false,
            },
          ],
          enums: [],
          types: [],
          indexes: [],
        },
        schema: {
          inputObjectTypes: {
            prisma: [
              {
                name: 'UserWhereInput',
                constraints: { maxNumFields: null, minNumFields: null },
                fields: [],
              },
              {
                name: 'UserWhereUniqueInput',
                constraints: { maxNumFields: null, minNumFields: null },
                fields: [],
              },
              {
                name: 'UserCreateInput',
                constraints: { maxNumFields: null, minNumFields: null },
                fields: [],
              },
              {
                name: 'UserCreateManyInput',
                constraints: { maxNumFields: null, minNumFields: null },
                fields: [],
              },
              {
                name: 'UserUpdateInput',
                constraints: { maxNumFields: null, minNumFields: null },
                fields: [],
              },
            ],
            model: [],
          },
          outputObjectTypes: { prisma: [], model: [] },
          enumTypes: { prisma: [], model: [] },
          fieldRefTypes: { prisma: [] },
        },
        mappings: {
          modelOperations: [],
          otherOperations: { read: [], write: [] },
        },
      };

      const dmmfDoc = new DMMFDocument(mockDMMF, config);
      const files = generateResolvers(project, dmmfDoc, config);

      expect(files.size).toBe(2); // UserResolver.ts + index.ts
      expect(files.has('resolvers/UserResolver.ts')).toBe(true);

      const resolverFile = files.get('resolvers/UserResolver.ts');
      const content = resolverFile?.getFullText() ?? '';

      // Check imports
      expect(content).toContain('Resolver');
      expect(content).toContain('Query');
      expect(content).toContain('Mutation');
      expect(content).toContain('Args');
      expect(content).toContain('Info');
      expect(content).toContain('import { GraphQLResolveInfo }');
      expect(content).toContain('import { transformInfoIntoPrismaArgs');

      // Check class and decorator
      expect(content).toContain('@Resolver(() => User)');
      expect(content).toContain('export class UserResolver');

      // Check CRUD operations
      expect(content).toContain('@Query(() => [User]');
      expect(content).toContain('async users(');
      expect(content).toContain('@Query(() => User');
      expect(content).toContain('async user(');
      expect(content).toContain('@Mutation(() => User');
      expect(content).toContain('async createOneUser(');
      expect(content).toContain('async updateOneUser(');
      expect(content).toContain('async deleteOneUser(');
      expect(content).toContain('async upsertOneUser(');

      // Check that transformInfoIntoPrismaArgs is used
      expect(content).toContain('transformInfoIntoPrismaArgs(info)');
      // Check that transformInfoIntoPrismaAggregateArgs is imported and used for aggregate/groupBy
      expect(content).toContain('transformInfoIntoPrismaAggregateArgs');
      expect(content).toContain('aggregateArgs = transformInfoIntoPrismaAggregateArgs(info)');
      // Check that Context decorator is used and prisma is accessed from ctx
      expect(content).toContain('@Context() ctx: GraphQLContext<PrismaClient>');
      expect(content).toContain('ctx.prisma.');
    });

    it('should not generate resolvers when generateResolvers is false', () => {
      const configNoResolvers: GeneratorConfig = {
        ...config,
        generateResolvers: false,
      };

      const mockDMMF: DMMF.Document = {
        datamodel: {
          models: [
            {
              name: 'User',
              dbName: 'users',
              schema: null,
              fields: [],
              primaryKey: null,
              uniqueFields: [],
              uniqueIndexes: [],
              isGenerated: false,
            },
          ],
          enums: [],
          types: [],
          indexes: [],
        },
        schema: {
          inputObjectTypes: { prisma: [], model: [] },
          outputObjectTypes: { prisma: [], model: [] },
          enumTypes: { prisma: [], model: [] },
          fieldRefTypes: { prisma: [] },
        },
        mappings: {
          modelOperations: [],
          otherOperations: { read: [], write: [] },
        },
      };

      const dmmfDoc = new DMMFDocument(mockDMMF, configNoResolvers);
      const files = generateResolvers(project, dmmfDoc, configNoResolvers);

      expect(files.size).toBe(0);
    });
  });
});
