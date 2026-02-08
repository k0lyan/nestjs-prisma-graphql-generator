import type { GraphQLResolveInfo, SelectionSetNode } from 'graphql';
import {
  PrismaSelect,
  getPrismaFromContext,
  mergePrismaSelects,
  transformInfoIntoPrismaArgs,
} from '../../src/runtime/helpers';

import { Kind } from 'graphql';

// Mock graphql type checking functions
jest.mock('graphql', () => {
  const actual = jest.requireActual('graphql');
  return {
    ...actual,
    isObjectType: (type: any) => type && typeof type?.getFields === 'function',
    isNonNullType: (type: any) => type?.kind === 'NON_NULL',
    isListType: (type: any) => type?.kind === 'LIST',
  };
});

/**
 * Helper to create a mock field node, optionally with arguments
 */
function createFieldNode(name: string, selectionSet?: SelectionSetNode, args?: any[]): any {
  return {
    kind: Kind.FIELD,
    name: { value: name },
    selectionSet,
    arguments: args ?? [],
  };
}

/**
 * Helper to create a mock selection set
 */
function createSelectionSet(fields: any[]): SelectionSetNode {
  return {
    kind: Kind.SELECTION_SET,
    selections: fields,
  };
}

/**
 * Helper to create a mock GraphQL Object Type
 */
function createMockObjectType(fields: Record<string, { type: any }>): any {
  return {
    getFields: () => fields,
  };
}

describe('Runtime Helpers', () => {
  describe('transformInfoIntoPrismaArgs', () => {
    it('should return empty object when fieldNodes is empty', () => {
      const mockInfo = {
        fieldNodes: [],
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({});
    });

    it('should return empty object when no selection set', () => {
      const mockInfo = {
        fieldNodes: [{ selectionSet: undefined }],
        returnType: createMockObjectType({}),
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({});
    });

    it('should transform simple scalar fields', () => {
      const userType = createMockObjectType({
        id: { type: {} },
        name: { type: {} },
        email: { type: {} },
      });

      const mockInfo = {
        fieldNodes: [
          createFieldNode(
            'users',
            createSelectionSet([
              createFieldNode('id'),
              createFieldNode('name'),
              createFieldNode('email'),
            ]),
          ),
        ],
        returnType: userType,
        fragments: {},
        schema: { getType: () => null },
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({
        select: {
          id: true,
          name: true,
          email: true,
        },
      });
    });

    it('should handle nested relation fields', () => {
      const postType = createMockObjectType({
        id: { type: {} },
        title: { type: {} },
      });

      const userType = createMockObjectType({
        id: { type: {} },
        posts: { type: postType },
      });

      const mockInfo = {
        fieldNodes: [
          createFieldNode(
            'users',
            createSelectionSet([
              createFieldNode('id'),
              createFieldNode(
                'posts',
                createSelectionSet([createFieldNode('id'), createFieldNode('title')]),
              ),
            ]),
          ),
        ],
        returnType: userType,
        fragments: {},
        schema: { getType: () => null },
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({
        select: {
          id: true,
          posts: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });
    });

    it('should exclude __typename field', () => {
      const userType = createMockObjectType({
        id: { type: {} },
        __typename: { type: {} },
      });

      const mockInfo = {
        fieldNodes: [
          createFieldNode(
            'users',
            createSelectionSet([createFieldNode('__typename'), createFieldNode('id')]),
          ),
        ],
        returnType: userType,
        fragments: {},
        schema: { getType: () => null },
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({
        select: {
          id: true,
        },
      });
    });

    it('should exclude aggregation fields (_count, _avg, etc.)', () => {
      const userType = createMockObjectType({
        id: { type: {} },
        _count: { type: {} },
        _avg: { type: {} },
      });

      const mockInfo = {
        fieldNodes: [
          createFieldNode(
            'users',
            createSelectionSet([
              createFieldNode('id'),
              createFieldNode('_count'),
              createFieldNode('_avg'),
            ]),
          ),
        ],
        returnType: userType,
        fragments: {},
        schema: { getType: () => null },
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({
        select: {
          id: true,
        },
      });
    });
  });

  describe('getPrismaFromContext', () => {
    it('should get prisma from context', () => {
      const mockPrisma = { user: {} };
      const mockContext = {
        prisma: mockPrisma,
      };

      const result = getPrismaFromContext(mockContext);

      expect(result).toBe(mockPrisma);
    });

    it('should throw error when prisma not found', () => {
      const mockContext = { prisma: undefined } as unknown as { prisma: unknown };

      expect(() => getPrismaFromContext(mockContext)).toThrow(
        'Unable to find Prisma Client in GraphQL context',
      );
    });
  });

  describe('mergePrismaSelects', () => {
    it('should merge multiple select objects', () => {
      const select1: PrismaSelect = {
        select: { id: true, name: true },
      };
      const select2: PrismaSelect = {
        select: { email: true },
      };

      const result = mergePrismaSelects(select1, select2);

      expect(result).toEqual({
        select: {
          id: true,
          name: true,
          email: true,
        },
      });
    });

    it('should merge include objects', () => {
      const select1: PrismaSelect = {
        include: { posts: true },
      };
      const select2: PrismaSelect = {
        include: { comments: true },
      };

      const result = mergePrismaSelects(select1, select2);

      expect(result).toEqual({
        include: {
          posts: true,
          comments: true,
        },
      });
    });

    it('should handle mixed select and include', () => {
      const select1: PrismaSelect = {
        select: { id: true },
      };
      const select2: PrismaSelect = {
        include: { posts: true },
      };

      const result = mergePrismaSelects(select1, select2);

      expect(result).toEqual({
        select: { id: true },
        include: { posts: true },
      });
    });

    it('should handle empty selects', () => {
      const result = mergePrismaSelects({}, {});

      expect(result).toEqual({});
    });
  });

  describe('relation argument forwarding', () => {
    it('should forward where argument on a relation field', () => {
      const mockInfo = {
        fieldNodes: [
          createFieldNode(
            'programs',
            createSelectionSet([
              createFieldNode('id'),
              createFieldNode(
                'extensions',
                createSelectionSet([createFieldNode('name'), createFieldNode('value')]),
                [
                  {
                    kind: 'Argument',
                    name: { value: 'where' },
                    value: {
                      kind: 'ObjectValue',
                      fields: [
                        {
                          name: { value: 'isActive' },
                          value: {
                            kind: 'ObjectValue',
                            fields: [
                              {
                                name: { value: 'equals' },
                                value: { kind: 'BooleanValue', value: true },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              ),
            ]),
          ),
        ],
        fragments: {},
        variableValues: {},
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({
        select: {
          id: true,
          extensions: {
            select: { name: true, value: true },
            where: { isActive: { equals: true } },
          },
        },
      });
    });

    it('should forward take and skip arguments on a relation field', () => {
      const mockInfo = {
        fieldNodes: [
          createFieldNode(
            'users',
            createSelectionSet([
              createFieldNode('id'),
              createFieldNode('posts', createSelectionSet([createFieldNode('title')]), [
                {
                  kind: 'Argument',
                  name: { value: 'take' },
                  value: { kind: 'IntValue', value: '10' },
                },
                {
                  kind: 'Argument',
                  name: { value: 'skip' },
                  value: { kind: 'IntValue', value: '5' },
                },
              ]),
            ]),
          ),
        ],
        fragments: {},
        variableValues: {},
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({
        select: {
          id: true,
          posts: {
            select: { title: true },
            take: 10,
            skip: 5,
          },
        },
      });
    });

    it('should forward orderBy argument on a relation field', () => {
      const mockInfo = {
        fieldNodes: [
          createFieldNode(
            'users',
            createSelectionSet([
              createFieldNode('id'),
              createFieldNode('posts', createSelectionSet([createFieldNode('title')]), [
                {
                  kind: 'Argument',
                  name: { value: 'orderBy' },
                  value: {
                    kind: 'ObjectValue',
                    fields: [
                      {
                        name: { value: 'createdAt' },
                        value: { kind: 'EnumValue', value: 'desc' },
                      },
                    ],
                  },
                },
              ]),
            ]),
          ),
        ],
        fragments: {},
        variableValues: {},
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({
        select: {
          id: true,
          posts: {
            select: { title: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    });

    it('should resolve variable references in relation arguments', () => {
      const mockInfo = {
        fieldNodes: [
          createFieldNode(
            'users',
            createSelectionSet([
              createFieldNode('id'),
              createFieldNode('posts', createSelectionSet([createFieldNode('title')]), [
                {
                  kind: 'Argument',
                  name: { value: 'where' },
                  value: { kind: 'Variable', name: { value: 'postFilter' } },
                },
              ]),
            ]),
          ),
        ],
        fragments: {},
        variableValues: {
          postFilter: { published: { equals: true } },
        },
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({
        select: {
          id: true,
          posts: {
            select: { title: true },
            where: { published: { equals: true } },
          },
        },
      });
    });

    it('should ignore non-Prisma arguments on relation fields', () => {
      const mockInfo = {
        fieldNodes: [
          createFieldNode(
            'users',
            createSelectionSet([
              createFieldNode('id'),
              createFieldNode('posts', createSelectionSet([createFieldNode('title')]), [
                {
                  kind: 'Argument',
                  name: { value: 'customArg' },
                  value: { kind: 'StringValue', value: 'should-be-ignored' },
                },
                {
                  kind: 'Argument',
                  name: { value: 'take' },
                  value: { kind: 'IntValue', value: '5' },
                },
              ]),
            ]),
          ),
        ],
        fragments: {},
        variableValues: {},
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({
        select: {
          id: true,
          posts: {
            select: { title: true },
            take: 5,
          },
        },
      });
    });

    it('should handle relation with no arguments (backward compatible)', () => {
      const mockInfo = {
        fieldNodes: [
          createFieldNode(
            'users',
            createSelectionSet([
              createFieldNode('id'),
              createFieldNode('posts', createSelectionSet([createFieldNode('title')])),
            ]),
          ),
        ],
        fragments: {},
        variableValues: {},
      } as unknown as GraphQLResolveInfo;

      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({
        select: {
          id: true,
          posts: {
            select: { title: true },
          },
        },
      });
    });
  });

  describe('createFieldFilter and filterFieldsBatch', () => {
    const mockDmmf = {
      datamodel: {
        models: [
          {
            name: 'User',
            fields: [
              { name: 'id', kind: 'scalar', type: 'Int' },
              { name: 'name', kind: 'scalar', type: 'String' },
              { name: 'email', kind: 'scalar', type: 'String' },
              { name: 'posts', kind: 'object', type: 'Post' },
              { name: 'profile', kind: 'object', type: 'Profile' },
            ],
          },
        ],
      },
    };

    it('should classify scalar fields correctly', () => {
      const { getModelFields, createFieldFilter } = require('../../src/runtime/helpers');
      const modelFields = getModelFields(mockDmmf, 'User');
      const filter = createFieldFilter(modelFields);

      expect(filter('id')).toBe('scalar');
      expect(filter('name')).toBe('scalar');
      expect(filter('email')).toBe('scalar');
    });

    it('should classify relation fields correctly', () => {
      const { getModelFields, createFieldFilter } = require('../../src/runtime/helpers');
      const modelFields = getModelFields(mockDmmf, 'User');
      const filter = createFieldFilter(modelFields);

      expect(filter('posts')).toBe('relation');
      expect(filter('profile')).toBe('relation');
    });

    it('should return null for excluded and unknown fields', () => {
      const { getModelFields, createFieldFilter } = require('../../src/runtime/helpers');
      const modelFields = getModelFields(mockDmmf, 'User');
      const filter = createFieldFilter(modelFields, ['email']);

      expect(filter('__typename')).toBeNull();
      expect(filter('_count')).toBeNull();
      expect(filter('email')).toBeNull(); // excluded
      expect(filter('unknownField')).toBeNull();
    });

    it('should batch filter multiple fields efficiently', () => {
      const {
        getModelFields,
        createFieldFilter,
        filterFieldsBatch,
      } = require('../../src/runtime/helpers');
      const modelFields = getModelFields(mockDmmf, 'User');
      const filter = createFieldFilter(modelFields);

      const result = filterFieldsBatch(
        ['id', 'name', 'posts', '__typename', 'computedField', 'profile'],
        filter,
      );

      expect(result.scalars).toEqual(['id', 'name']);
      expect(result.relations).toEqual(['posts', 'profile']);
    });
  });

  describe('buildSelectFromFields', () => {
    const mockDmmf = {
      datamodel: {
        models: [
          {
            name: 'Post',
            fields: [
              { name: 'id', kind: 'scalar', type: 'Int' },
              { name: 'title', kind: 'scalar', type: 'String' },
              { name: 'content', kind: 'scalar', type: 'String' },
              { name: 'author', kind: 'object', type: 'User' },
            ],
          },
        ],
      },
    };

    it('should build select object from field names', () => {
      const {
        getModelFields,
        createFieldFilter,
        buildSelectFromFields,
      } = require('../../src/runtime/helpers');
      const modelFields = getModelFields(mockDmmf, 'Post');
      const filter = createFieldFilter(modelFields);

      const select = buildSelectFromFields(['id', 'title', '__typename', 'computedField'], filter);

      expect(select).toEqual({
        id: true,
        title: true,
      });
    });

    it('should include relation fields in select', () => {
      const {
        getModelFields,
        createFieldFilter,
        buildSelectFromFields,
      } = require('../../src/runtime/helpers');
      const modelFields = getModelFields(mockDmmf, 'Post');
      const filter = createFieldFilter(modelFields);

      const select = buildSelectFromFields(['id', 'author'], filter);

      expect(select).toEqual({
        id: true,
        author: true,
      });
    });
  });

  describe('getFieldFilter with caching', () => {
    it('should cache filter functions for same model and excludeFields', () => {
      const { getFieldFilter } = require('../../src/runtime/helpers');
      const mockDmmf = {
        datamodel: {
          models: [
            {
              name: 'CachedModel',
              fields: [{ name: 'id', kind: 'scalar', type: 'Int' }],
            },
          ],
        },
      };

      const filter1 = getFieldFilter(mockDmmf, 'CachedModel', ['exclude1']);
      const filter2 = getFieldFilter(mockDmmf, 'CachedModel', ['exclude1']);

      // Same reference means it was cached
      expect(filter1).toBe(filter2);
    });

    it('should create different filters for different excludeFields', () => {
      const { getFieldFilter } = require('../../src/runtime/helpers');
      const mockDmmf = {
        datamodel: {
          models: [
            {
              name: 'CachedModel2',
              fields: [
                { name: 'id', kind: 'scalar', type: 'Int' },
                { name: 'field1', kind: 'scalar', type: 'String' },
              ],
            },
          ],
        },
      };

      const filter1 = getFieldFilter(mockDmmf, 'CachedModel2', ['field1']);
      const filter2 = getFieldFilter(mockDmmf, 'CachedModel2');

      expect(filter1('field1')).toBeNull(); // excluded
      expect(filter2('field1')).toBe('scalar'); // not excluded
    });
  });
});
