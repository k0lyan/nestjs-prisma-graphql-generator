import {
  transformModel,
  transformEnum,
  extractRelations,
  generateModelMappings,
  camelCase,
  pascalCase,
  isScalarField,
  isEnumField,
  isRelationField,
  getIdFields,
  getUniqueFields,
} from '../../src/generator/dmmf/transformer';
import type { DMMF } from '@prisma/generator-helper';

describe('DMMF Transformer', () => {
  describe('transformModel', () => {
    it('should transform a basic DMMF model', () => {
      const dmmfModel: DMMF.Model = {
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
            default: { name: 'cuid', args: [] },
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
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      };

      const result = transformModel(dmmfModel);

      expect(result.name).toBe('User');
      expect(result.dbName).toBe('users');
      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]?.name).toBe('id');
      expect(result.fields[0]?.isId).toBe(true);
      expect(result.fields[1]?.name).toBe('email');
      expect(result.fields[1]?.isUnique).toBe(true);
    });

    it('should handle models with relations', () => {
      const dmmfModel: DMMF.Model = {
        name: 'Post',
        dbName: 'posts',
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
            name: 'author',
            kind: 'object',
            isList: false,
            isRequired: true,
            isUnique: false,
            isId: false,
            isReadOnly: false,
            hasDefaultValue: false,
            type: 'User',
            relationName: 'PostToUser',
            relationFromFields: ['authorId'],
            relationToFields: ['id'],
            isGenerated: false,
            isUpdatedAt: false,
          },
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      };

      const result = transformModel(dmmfModel);

      expect(result.fields[1]?.kind).toBe('object');
      expect(result.fields[1]?.relationName).toBe('PostToUser');
      expect(result.fields[1]?.relationFromFields).toEqual(['authorId']);
    });
  });

  describe('transformEnum', () => {
    it('should transform a DMMF enum', () => {
      const dmmfEnum: DMMF.DatamodelEnum = {
        name: 'Role',
        values: [
          { name: 'USER', dbName: null },
          { name: 'ADMIN', dbName: null },
        ],
      };

      const result = transformEnum(dmmfEnum);

      expect(result.name).toBe('Role');
      expect(result.values).toHaveLength(2);
      expect(result.values[0]?.name).toBe('USER');
      expect(result.values[1]?.name).toBe('ADMIN');
    });

    it('should preserve documentation', () => {
      const dmmfEnum: DMMF.DatamodelEnum = {
        name: 'Status',
        values: [
          { name: 'PENDING', dbName: null },
        ],
        documentation: 'Status of an item',
      };

      const result = transformEnum(dmmfEnum);

      expect(result.documentation).toBe('Status of an item');
    });
  });

  describe('extractRelations', () => {
    it('should extract one-to-many relations', () => {
      const models = [
        {
          name: 'User',
          dbName: null,
          fields: [
            {
              name: 'id',
              type: 'String',
              kind: 'scalar' as const,
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: true,
              isReadOnly: false,
              isGenerated: false,
              isUpdatedAt: false,
              hasDefaultValue: true,
            },
            {
              name: 'posts',
              type: 'Post',
              kind: 'object' as const,
              isList: true,
              isRequired: false,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              isGenerated: false,
              isUpdatedAt: false,
              hasDefaultValue: false,
              relationName: 'UserPosts',
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
        {
          name: 'Post',
          dbName: null,
          fields: [
            {
              name: 'id',
              type: 'String',
              kind: 'scalar' as const,
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: true,
              isReadOnly: false,
              isGenerated: false,
              isUpdatedAt: false,
              hasDefaultValue: true,
            },
            {
              name: 'author',
              type: 'User',
              kind: 'object' as const,
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              isGenerated: false,
              isUpdatedAt: false,
              hasDefaultValue: false,
              relationName: 'UserPosts',
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ];

      const relations = extractRelations(models);

      expect(relations).toHaveLength(1);
      expect(relations[0]?.name).toBe('UserPosts');
      expect(relations[0]?.type).toBe('one-to-many');
    });
  });

  describe('generateModelMappings', () => {
    it('should generate correct CRUD operation mappings', () => {
      const models = [
        {
          name: 'User',
          dbName: null,
          fields: [],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ];

      const mappings = generateModelMappings(models);

      expect(mappings).toHaveLength(1);
      expect(mappings[0]?.model).toBe('User');
      expect(mappings[0]?.plural).toBe('users');
      expect(mappings[0]?.findUnique).toBe('user');
      expect(mappings[0]?.findMany).toBe('users');
      expect(mappings[0]?.create).toBe('createOneUser');
      expect(mappings[0]?.delete).toBe('deleteOneUser');
    });
  });

  describe('utility functions', () => {
    it('camelCase should convert string to camelCase', () => {
      expect(camelCase('User')).toBe('user');
      expect(camelCase('BlogPost')).toBe('blogPost');
      expect(camelCase('already')).toBe('already');
    });

    it('pascalCase should convert string to PascalCase', () => {
      expect(pascalCase('user')).toBe('User');
      expect(pascalCase('blogPost')).toBe('BlogPost');
      expect(pascalCase('Already')).toBe('Already');
    });

    it('isScalarField should identify scalar fields', () => {
      const scalarField = { kind: 'scalar' as const } as any;
      const objectField = { kind: 'object' as const } as any;

      expect(isScalarField(scalarField)).toBe(true);
      expect(isScalarField(objectField)).toBe(false);
    });

    it('isEnumField should identify enum fields', () => {
      const enumField = { kind: 'enum' as const } as any;
      const scalarField = { kind: 'scalar' as const } as any;

      expect(isEnumField(enumField)).toBe(true);
      expect(isEnumField(scalarField)).toBe(false);
    });

    it('isRelationField should identify relation fields', () => {
      const relationField = { kind: 'object' as const } as any;
      const scalarField = { kind: 'scalar' as const } as any;

      expect(isRelationField(relationField)).toBe(true);
      expect(isRelationField(scalarField)).toBe(false);
    });

    it('getIdFields should return ID fields', () => {
      const model = {
        name: 'User',
        dbName: null,
        fields: [
          { name: 'id', isId: true } as any,
          { name: 'email', isId: false } as any,
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      };

      const idFields = getIdFields(model);

      expect(idFields).toHaveLength(1);
      expect(idFields[0]?.name).toBe('id');
    });

    it('getUniqueFields should return unique non-ID fields', () => {
      const model = {
        name: 'User',
        dbName: null,
        fields: [
          { name: 'id', isId: true, isUnique: false } as any,
          { name: 'email', isId: false, isUnique: true } as any,
          { name: 'name', isId: false, isUnique: false } as any,
        ],
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
      };

      const uniqueFields = getUniqueFields(model);

      expect(uniqueFields).toHaveLength(1);
      expect(uniqueFields[0]?.name).toBe('email');
    });
  });
});
