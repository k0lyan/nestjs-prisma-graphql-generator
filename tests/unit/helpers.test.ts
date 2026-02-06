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
 * Helper to create a mock field node
 */
function createFieldNode(name: string, selectionSet?: SelectionSetNode): any {
  return {
    kind: Kind.FIELD,
    name: { value: name },
    selectionSet,
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
});
