import type { DMMF } from '@prisma/generator-helper';
import { DMMFDocument } from '../../src/generator/dmmf/document';
import type { GeneratorConfig } from '../../src/cli/options-parser';
import { generateCodeGrouped } from '../../src/generator/generate-grouped';

describe('Grouped Generation', () => {
  let config: GeneratorConfig;

  beforeEach(() => {
    config = {
      generateResolvers: true,
      useValidation: false,
      prismaClientPath: '@prisma/client',
      emitCompiled: false,
      groupByModel: true,
      outputDirs: {
        models: 'models',
        inputs: 'inputs',
        args: 'args',
        enums: 'enums',
        resolvers: 'resolvers',
      },
    };
  });

  it('should generate files grouped by model', async () => {
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
                isUnique: true,
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
        enums: [
          {
            name: 'Role',
            values: [
              { name: 'USER', dbName: null },
              { name: 'ADMIN', dbName: null },
            ],
          },
          {
            name: 'UserScalarFieldEnum',
            values: [
              { name: 'id', dbName: null },
              { name: 'email', dbName: null },
              { name: 'name', dbName: null },
            ],
          },
        ],
        types: [],
        indexes: [],
      },
      schema: {
        inputObjectTypes: {
          prisma: [
            {
              name: 'UserWhereInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'id',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
                {
                  name: 'email',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
              ],
            },
            {
              name: 'UserWhereUniqueInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'id',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
                {
                  name: 'email',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
              ],
            },
            {
              name: 'UserOrderByWithRelationInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'id',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'SortOrder', isList: false, location: 'enumTypes' }],
                },
              ],
            },
            {
              name: 'UserCreateInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'id',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
                {
                  name: 'email',
                  isRequired: true,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
                {
                  name: 'name',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
              ],
            },
            {
              name: 'UserCreateManyInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'email',
                  isRequired: true,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
              ],
            },
            {
              name: 'UserUpdateInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'email',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
                {
                  name: 'name',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
              ],
            },
            {
              name: 'UserUpdateManyMutationInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'email',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
              ],
            },
          ],
          model: [],
        },
        outputObjectTypes: { prisma: [], model: [] },
        enumTypes: {
          prisma: [
            {
              name: 'SortOrder',
              values: ['asc', 'desc'],
            },
          ],
          model: [],
        },
        fieldRefTypes: { prisma: [] },
      },
      mappings: {
        modelOperations: [
          {
            model: 'User',
            plural: 'Users',
            findUnique: 'findUniqueUser',
            findFirst: 'findFirstUser',
            findMany: 'findManyUser',
            create: 'createOneUser',
            createMany: 'createManyUser',
            delete: 'deleteOneUser',
            update: 'updateOneUser',
            deleteMany: 'deleteManyUser',
            updateMany: 'updateManyUser',
            upsert: 'upsertOneUser',
            aggregate: 'aggregateUser',
            groupBy: 'groupByUser',
          },
        ],
        otherOperations: { read: [], write: [] },
      },
    };

    const dmmfDoc = new DMMFDocument(mockDMMF, config);
    const files = await generateCodeGrouped(dmmfDoc, config);

    // Check file structure
    const filePaths = files.map(f => f.path);

    // Should have model folder with files
    expect(filePaths).toContain('User/model.ts');
    expect(filePaths).toContain('User/inputs.ts');
    expect(filePaths).toContain('User/args.ts');
    expect(filePaths).toContain('User/resolver.ts');
    expect(filePaths).toContain('User/index.ts');

    // Should have enums folder
    expect(filePaths).toContain('enums/Role.ts');
    expect(filePaths).toContain('enums/UserScalarFieldEnum.ts');
    expect(filePaths).toContain('enums/SortOrder.ts');
    expect(filePaths).toContain('enums/index.ts');

    // Should have common types
    expect(filePaths).toContain('common/AffectedRows.ts');
    expect(filePaths).toContain('common/index.ts');

    // Should have helpers
    expect(filePaths).toContain('helpers.ts');

    // Should have root index
    expect(filePaths).toContain('index.ts');

    // Should NOT have flat inputs/args directories
    expect(filePaths.some(p => p.startsWith('inputs/'))).toBe(false);
    expect(filePaths.some(p => p.startsWith('args/'))).toBe(false);
  });

  it('should generate model.ts with correct ObjectType', async () => {
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
                isUnique: true,
                isId: true,
                isReadOnly: false,
                hasDefaultValue: true,
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
        enums: [
          {
            name: 'UserScalarFieldEnum',
            values: [
              { name: 'id', dbName: null },
              { name: 'name', dbName: null },
            ],
          },
        ],
        types: [],
        indexes: [],
      },
      schema: {
        inputObjectTypes: {
          prisma: [
            {
              name: 'UserWhereInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'id',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
              ],
            },
            {
              name: 'UserWhereUniqueInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'id',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
              ],
            },
          ],
          model: [],
        },
        outputObjectTypes: { prisma: [], model: [] },
        enumTypes: { prisma: [], model: [] },
        fieldRefTypes: { prisma: [] },
      },
      mappings: {
        modelOperations: [
          {
            model: 'User',
            plural: 'Users',
            findUnique: 'findUniqueUser',
            findFirst: 'findFirstUser',
            findMany: 'findManyUser',
            create: 'createOneUser',
            delete: 'deleteOneUser',
            update: 'updateOneUser',
            deleteMany: 'deleteManyUser',
            updateMany: 'updateManyUser',
          },
        ],
        otherOperations: { read: [], write: [] },
      },
    };

    const dmmfDoc = new DMMFDocument(mockDMMF, config);
    const files = await generateCodeGrouped(dmmfDoc, config);

    const modelFile = files.find(f => f.path === 'User/model.ts');
    expect(modelFile).toBeDefined();

    const content = modelFile!.content;
    expect(content).toContain('@ObjectType');
    expect(content).toContain('export class User');
    expect(content).toContain('@Field(() => ID)');
    expect(content).toContain('id!: string');
    expect(content).toContain('name?: string | null');
  });

  it('should generate inputs.ts with all input types for a model', async () => {
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
                isUnique: true,
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
        enums: [
          {
            name: 'UserScalarFieldEnum',
            values: [{ name: 'id', dbName: null }],
          },
        ],
        types: [],
        indexes: [],
      },
      schema: {
        inputObjectTypes: {
          prisma: [
            {
              name: 'UserWhereInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'id',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
              ],
            },
            {
              name: 'UserWhereUniqueInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'id',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
              ],
            },
            {
              name: 'UserCreateInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'id',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
              ],
            },
          ],
          model: [],
        },
        outputObjectTypes: { prisma: [], model: [] },
        enumTypes: { prisma: [], model: [] },
        fieldRefTypes: { prisma: [] },
      },
      mappings: {
        modelOperations: [
          {
            model: 'User',
            plural: 'Users',
            findUnique: 'findUniqueUser',
            findMany: 'findManyUser',
            create: 'createOneUser',
          },
        ],
        otherOperations: { read: [], write: [] },
      },
    };

    const dmmfDoc = new DMMFDocument(mockDMMF, config);
    const files = await generateCodeGrouped(dmmfDoc, config);

    const inputsFile = files.find(f => f.path === 'User/inputs.ts');
    expect(inputsFile).toBeDefined();

    const content = inputsFile!.content;
    // All input types for User should be in one file
    expect(content).toContain('export class UserWhereInput');
    expect(content).toContain('export class UserWhereUniqueInput');
    expect(content).toContain('export class UserCreateInput');
    expect(content).toContain('@InputType');
  });
});
