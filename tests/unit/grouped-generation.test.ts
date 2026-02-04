import type { DMMF } from '@prisma/generator-helper';
import { DMMFDocument } from '../../src/generator/dmmf/document';
import type { GeneratorConfig } from '../../src/cli/options-parser';
import { generateCodeGrouped } from '../../src/generator/generate-grouped-fast';

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

    // Should have models folder with model files
    expect(filePaths).toContain('models/User/model.ts');
    expect(filePaths).toContain('models/index.ts');

    // Should have model folder with inputs, args, resolvers
    expect(filePaths).toContain('models/User/inputs.ts');
    expect(filePaths).toContain('models/User/args.ts');
    expect(filePaths).toContain('models/User/resolver.ts');
    expect(filePaths).toContain('models/User/aggregations.ts');
    expect(filePaths).toContain('models/User/index.ts');

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

    const modelFile = files.find(f => f.path === 'models/User/model.ts');
    expect(modelFile).toBeDefined();

    const content = modelFile!.content;
    expect(content).toContain('@ObjectType');
    // Base class with scalars only
    expect(content).toContain('export class User');
    // String id field should use String type, not ID (ID type conversion was removed)
    expect(content).toContain('@Field(() => String)');
    expect(content).toContain('id!: string');
    expect(content).toContain('name?: string | null');
    // WithRelations type alias (no relations in this test model)
    expect(content).toContain('export { User as UserWithRelations }');
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

    const inputsFile = files.find(f => f.path === 'models/User/inputs.ts');
    expect(inputsFile).toBeDefined();

    const content = inputsFile!.content;
    // All input types for User should be in one file
    expect(content).toContain('export class UserWhereInput');
    expect(content).toContain('export class UserWhereUniqueInput');
    expect(content).toContain('export class UserCreateInput');
    expect(content).toContain('@InputType');
  });

  it('should correctly handle model names that are prefixes of other models (e.g., City vs CityType)', async () => {
    const mockDMMF: DMMF.Document = {
      datamodel: {
        models: [
          {
            name: 'City',
            dbName: null,
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
                isRequired: true,
                isUnique: false,
                isId: false,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'String',
                isGenerated: false,
                isUpdatedAt: false,
              },
              {
                name: 'cityType',
                kind: 'object',
                isList: false,
                isRequired: true,
                isUnique: false,
                isId: false,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'CityType',
                isGenerated: false,
                isUpdatedAt: false,
                relationName: 'CityToCityType',
              },
            ],
            primaryKey: null,
            uniqueFields: [],
            uniqueIndexes: [],
            isGenerated: false,
          },
          {
            name: 'CityType',
            dbName: null,
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
                isRequired: true,
                isUnique: false,
                isId: false,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'String',
                isGenerated: false,
                isUpdatedAt: false,
              },
              {
                name: 'cities',
                kind: 'object',
                isList: true,
                isRequired: true,
                isUnique: false,
                isId: false,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'City',
                isGenerated: false,
                isUpdatedAt: false,
                relationName: 'CityToCityType',
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
            name: 'CityScalarFieldEnum',
            values: [
              { name: 'id', dbName: null },
              { name: 'name', dbName: null },
            ],
          },
          {
            name: 'CityTypeScalarFieldEnum',
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
              name: 'CityWhereInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'id',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
                {
                  name: 'cityType',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [
                    {
                      type: 'CityTypeScalarRelationFilter',
                      isList: false,
                      location: 'inputObjectTypes',
                    },
                  ],
                },
              ],
            },
            {
              name: 'CityWhereUniqueInput',
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
              name: 'CityTypeWhereInput',
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
              name: 'CityTypeWhereUniqueInput',
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
              name: 'CityTypeScalarRelationFilter',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'is',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [
                    { type: 'CityTypeWhereInput', isList: false, location: 'inputObjectTypes' },
                  ],
                },
                {
                  name: 'isNot',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [
                    { type: 'CityTypeWhereInput', isList: false, location: 'inputObjectTypes' },
                  ],
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
            model: 'City',
            plural: 'Cities',
            findUnique: 'findUniqueCity',
            findMany: 'findManyCity',
            create: 'createOneCity',
          },
          {
            model: 'CityType',
            plural: 'CityTypes',
            findUnique: 'findUniqueCityType',
            findMany: 'findManyCityType',
            create: 'createOneCityType',
          },
        ],
        otherOperations: { read: [], write: [] },
      },
    };

    const dmmfDoc = new DMMFDocument(mockDMMF, config);
    const files = await generateCodeGrouped(dmmfDoc, config);

    // Check City inputs file
    const cityInputsFile = files.find(f => f.path === 'models/City/inputs.ts');
    expect(cityInputsFile).toBeDefined();
    const cityInputsContent = cityInputsFile!.content;

    // City's inputs should reference CityType's inputs via import
    expect(cityInputsContent).toContain('export class CityWhereInput');
    // CityTypeScalarRelationFilter should be imported from CityType folder, not defined here
    expect(cityInputsContent).not.toContain('export class CityTypeScalarRelationFilter');
    // Should have an import for CityTypeScalarRelationFilter from CityType model
    expect(cityInputsContent).toContain(
      "import { CityTypeScalarRelationFilter } from '../CityType/inputs'",
    );

    // Check CityType inputs file
    const cityTypeInputsFile = files.find(f => f.path === 'models/CityType/inputs.ts');
    expect(cityTypeInputsFile).toBeDefined();
    const cityTypeInputsContent = cityTypeInputsFile!.content;

    // CityType's inputs should contain CityTypeScalarRelationFilter
    expect(cityTypeInputsContent).toContain('export class CityTypeScalarRelationFilter');
    expect(cityTypeInputsContent).toContain('export class CityTypeWhereInput');
  });

  it('should generate shared input types (IntFilter, StringFilter, etc.) in common/inputs.ts', async () => {
    const mockDMMF: DMMF.Document = {
      datamodel: {
        models: [
          {
            name: 'User',
            dbName: null,
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
                type: 'Int',
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
                  inputTypes: [{ type: 'IntFilter', isList: false, location: 'inputObjectTypes' }],
                },
                {
                  name: 'name',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [
                    { type: 'StringNullableFilter', isList: false, location: 'inputObjectTypes' },
                  ],
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
                  inputTypes: [{ type: 'Int', isList: false, location: 'scalar' }],
                },
              ],
            },
            // Shared filter types (don't belong to any model)
            {
              name: 'IntFilter',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'equals',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'Int', isList: false, location: 'scalar' }],
                },
                {
                  name: 'in',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'Int', isList: true, location: 'scalar' }],
                },
                {
                  name: 'not',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [
                    { type: 'NestedIntFilter', isList: false, location: 'inputObjectTypes' },
                  ],
                },
              ],
            },
            {
              name: 'NestedIntFilter',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'equals',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'Int', isList: false, location: 'scalar' }],
                },
              ],
            },
            {
              name: 'StringNullableFilter',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'equals',
                  isRequired: false,
                  isNullable: true,
                  inputTypes: [{ type: 'String', isList: false, location: 'scalar' }],
                },
                {
                  name: 'contains',
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

    // Check that common/inputs.ts is generated with shared filter types
    const commonInputsFile = files.find(f => f.path === 'common/inputs.ts');
    expect(commonInputsFile).toBeDefined();
    const commonInputsContent = commonInputsFile!.content;

    // Shared filter types should be in common/inputs.ts
    expect(commonInputsContent).toContain('export class IntFilter');
    expect(commonInputsContent).toContain('export class StringNullableFilter');
    expect(commonInputsContent).toContain('export class NestedIntFilter');
    expect(commonInputsContent).toContain('@InputType()');

    // Check that User inputs file references common filter types
    const userInputsFile = files.find(f => f.path === 'models/User/inputs.ts');
    expect(userInputsFile).toBeDefined();
    const userInputsContent = userInputsFile!.content;

    // User's WhereInput should import shared filter types
    expect(userInputsContent).toContain(
      "import { IntFilter, StringNullableFilter } from '../../common/inputs'",
    );

    // Shared filter types should NOT be defined in User's inputs.ts
    expect(userInputsContent).not.toContain('export class IntFilter');
    expect(userInputsContent).not.toContain('export class StringNullableFilter');

    // Check common/index.ts exports inputs
    const commonIndexFile = files.find(f => f.path === 'common/index.ts');
    expect(commonIndexFile).toBeDefined();
    expect(commonIndexFile!.content).toContain("export * from './inputs'");
  });

  it('should generate aggregations.ts with aggregate types and resolver', async () => {
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
                type: 'Int',
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
              {
                name: 'age',
                kind: 'scalar',
                isList: false,
                isRequired: false,
                isUnique: false,
                isId: false,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'Int',
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
              { name: 'age', dbName: null },
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
                  inputTypes: [{ type: 'Int', isList: false, location: 'scalar' }],
                },
              ],
            },
            {
              name: 'UserScalarWhereWithAggregatesInput',
              constraints: { maxNumFields: null, minNumFields: null },
              fields: [
                {
                  name: 'id',
                  isRequired: false,
                  isNullable: false,
                  inputTypes: [{ type: 'Int', isList: false, location: 'scalar' }],
                },
              ],
            },
          ],
          model: [],
        },
        outputObjectTypes: { prisma: [], model: [] },
        enumTypes: {
          prisma: [],
          model: [],
        },
        fieldRefTypes: { prisma: [] },
      },
      mappings: {
        modelOperations: [
          {
            model: 'User',
            plural: 'Users',
            aggregate: 'aggregateUser',
            groupBy: 'groupByUser',
          },
        ],
        otherOperations: { read: [], write: [] },
      },
    };

    const dmmfDoc = new DMMFDocument(mockDMMF, config);
    const files = await generateCodeGrouped(dmmfDoc, config);

    // Check aggregations.ts is generated
    const aggregationsFile = files.find(f => f.path === 'models/User/aggregations.ts');
    expect(aggregationsFile).toBeDefined();

    const content = aggregationsFile!.content;

    // Should have aggregate output types
    expect(content).toContain('export class UserCountAggregate');
    expect(content).toContain('export class UserAvgAggregate');
    expect(content).toContain('export class UserSumAggregate');
    expect(content).toContain('export class UserMinAggregate');
    expect(content).toContain('export class UserMaxAggregate');
    expect(content).toContain('export class AggregateUser');
    expect(content).toContain('export class UserGroupBy');

    // Should have aggregate resolver
    expect(content).toContain('export class UserAggregateResolver');
    expect(content).toContain('async aggregateUser');
    expect(content).toContain('async groupByUser');
    expect(content).toContain('async userCount');

    // Should have proper decorators
    expect(content).toContain('@ObjectType()');
    expect(content).toContain('@Resolver()');
    expect(content).toContain('@Query');

    // Should import args
    expect(content).toContain("import { AggregateUserArgs, GroupByUserArgs } from './args'");
  });
});
