import {
  PrismaSelect,
  getPrismaFromContext,
  mergePrismaSelects,
  transformInfoIntoPrismaArgs,
} from '../../src/runtime/helpers';
import {
  parseResolveInfo,
  simplifyParsedResolveInfoFragmentWithType,
} from 'graphql-parse-resolve-info';

import type { GraphQLResolveInfo } from 'graphql';

// Mock graphql-parse-resolve-info
jest.mock('graphql-parse-resolve-info', () => ({
  parseResolveInfo: jest.fn(),
  simplifyParsedResolveInfoFragmentWithType: jest.fn(),
}));

const mockParseResolveInfo = parseResolveInfo as jest.Mock;
const mockSimplifyParsedResolveInfo = simplifyParsedResolveInfoFragmentWithType as jest.Mock;

describe('Runtime Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('transformInfoIntoPrismaArgs', () => {
    it('should return empty object when parse returns null', () => {
      mockParseResolveInfo.mockReturnValue(null);

      const mockInfo = {} as GraphQLResolveInfo;
      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({});
    });

    it('should transform simple scalar fields', () => {
      mockParseResolveInfo.mockReturnValue({ name: 'users' });
      mockSimplifyParsedResolveInfo.mockReturnValue({
        fields: {
          id: { fieldsByTypeName: {} },
          name: { fieldsByTypeName: {} },
          email: { fieldsByTypeName: {} },
        },
      });

      const mockInfo = { returnType: {} } as GraphQLResolveInfo;
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
      mockParseResolveInfo.mockReturnValue({ name: 'users' });
      mockSimplifyParsedResolveInfo.mockReturnValue({
        fields: {
          id: { fieldsByTypeName: {} },
          posts: {
            fieldsByTypeName: {
              Post: {
                id: { fieldsByTypeName: {} },
                title: { fieldsByTypeName: {} },
              },
            },
          },
        },
      });

      const mockInfo = { returnType: {} } as GraphQLResolveInfo;
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
      mockParseResolveInfo.mockReturnValue({ name: 'users' });
      mockSimplifyParsedResolveInfo.mockReturnValue({
        fields: {
          __typename: { fieldsByTypeName: {} },
          id: { fieldsByTypeName: {} },
        },
      });

      const mockInfo = { returnType: {} } as GraphQLResolveInfo;
      const result = transformInfoIntoPrismaArgs(mockInfo);

      expect(result).toEqual({
        select: {
          id: true,
        },
      });
    });

    it('should exclude aggregation fields (_count, _avg, etc.)', () => {
      mockParseResolveInfo.mockReturnValue({ name: 'users' });
      mockSimplifyParsedResolveInfo.mockReturnValue({
        fields: {
          id: { fieldsByTypeName: {} },
          _count: { fieldsByTypeName: {} },
          _avg: { fieldsByTypeName: {} },
        },
      });

      const mockInfo = { returnType: {} } as GraphQLResolveInfo;
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
