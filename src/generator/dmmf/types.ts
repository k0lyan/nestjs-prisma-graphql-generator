import type { DMMF } from '@prisma/generator-helper';

/**
 * Scalar type mapping from Prisma to TypeScript/GraphQL
 */
export type ScalarType =
  | 'String'
  | 'Int'
  | 'Float'
  | 'Boolean'
  | 'DateTime'
  | 'Json'
  | 'Bytes'
  | 'BigInt'
  | 'Decimal';

/**
 * Mapping of Prisma scalar types to GraphQL scalar types
 */
export const PRISMA_TO_GRAPHQL_SCALAR: Record<string, string> = {
  String: 'String',
  Int: 'Int',
  Float: 'Float',
  Boolean: 'Boolean',
  DateTime: 'Date',
  Json: 'GraphQLJSON',
  Bytes: 'String', // Base64 encoded
  BigInt: 'GraphQLBigInt',
  Decimal: 'GraphQLDecimal',
};

/**
 * Mapping of Prisma scalar types to TypeScript types
 */
export const PRISMA_TO_TS_TYPE: Record<string, string> = {
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  DateTime: 'Date',
  Json: 'any',
  Bytes: 'Buffer',
  BigInt: 'bigint',
  Decimal: 'Prisma.Decimal',
};

/**
 * Internal representation of a model field
 */
export interface ModelField {
  name: string;
  type: string;
  kind: DMMF.FieldKind;
  isList: boolean;
  isRequired: boolean;
  isUnique: boolean;
  isId: boolean;
  isReadOnly: boolean;
  isGenerated: boolean;
  isUpdatedAt: boolean;
  hasDefaultValue: boolean;
  default?: DMMF.FieldDefault | DMMF.FieldDefaultScalar | DMMF.FieldDefaultScalar[];
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
  documentation?: string;
}

/**
 * Internal representation of a model
 */
export interface Model {
  name: string;
  dbName: string | null;
  fields: ModelField[];
  primaryKey: PrimaryKey | null;
  uniqueFields: string[][];
  uniqueIndexes: UniqueIndex[];
  documentation?: string;
  isGenerated: boolean;
}

/**
 * Primary key definition
 */
export interface PrimaryKey {
  name: string | null;
  fields: string[];
}

/**
 * Unique index definition
 */
export interface UniqueIndex {
  name: string | null;
  fields: string[];
}

/**
 * Internal representation of an enum
 */
export interface Enum {
  name: string;
  values: EnumValue[];
  documentation?: string;
}

/**
 * Enum value definition
 */
export interface EnumValue {
  name: string;
  dbName?: string | null;
  documentation?: string;
}

/**
 * Relation information between models
 */
export interface Relation {
  name: string;
  fromModel: string;
  fromField: string;
  toModel: string;
  toField: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  isList: boolean;
}

/**
 * CRUD operation types
 */
export type CrudOperation =
  | 'findUnique'
  | 'findFirst'
  | 'findMany'
  | 'create'
  | 'createMany'
  | 'update'
  | 'updateMany'
  | 'upsert'
  | 'delete'
  | 'deleteMany'
  | 'aggregate'
  | 'groupBy'
  | 'count';

/**
 * Model mapping for CRUD operations
 */
export interface ModelMapping {
  model: string;
  plural: string;
  findUnique?: string;
  findFirst?: string;
  findMany?: string;
  create?: string;
  createMany?: string;
  update?: string;
  updateMany?: string;
  upsert?: string;
  delete?: string;
  deleteMany?: string;
  aggregate?: string;
  groupBy?: string;
  count?: string;
}

/**
 * Generated file representation
 */
export interface GeneratedFile {
  path: string;
  content: string;
}

/**
 * Input type field
 */
export interface InputField {
  name: string;
  type: string;
  isList: boolean;
  isRequired: boolean;
  isNullable: boolean;
  inputTypes: InputTypeRef[];
}

/**
 * Reference to an input type
 */
export interface InputTypeRef {
  type: string;
  isList: boolean;
  location: 'scalar' | 'enumTypes' | 'inputObjectTypes' | 'outputObjectTypes';
  namespace?: 'prisma' | 'model';
}

/**
 * Input type definition
 */
export interface InputType {
  name: string;
  fields: InputField[];
  constraints: {
    maxNumFields?: number | null;
    minNumFields?: number | null;
  };
}

/**
 * Output type field
 */
export interface OutputField {
  name: string;
  type: string;
  isList: boolean;
  isNullable: boolean;
  args: InputField[];
}

/**
 * Output type definition
 */
export interface OutputType {
  name: string;
  fields: OutputField[];
}
