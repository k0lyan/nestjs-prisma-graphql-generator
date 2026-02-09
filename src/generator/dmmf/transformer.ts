import type {
  Enum,
  InputField,
  InputType,
  Model,
  ModelField,
  ModelMapping,
  Relation,
} from './types';

import type { DMMF } from '@prisma/generator-helper';
import pluralize from 'pluralize';

/**
 * Transform DMMF Model to internal Model representation
 */
export function transformModel(dmmfModel: DMMF.Model): Model {
  return {
    name: dmmfModel.name,
    dbName: dmmfModel.dbName,
    fields: dmmfModel.fields.map(transformField),
    primaryKey: dmmfModel.primaryKey
      ? {
          name: dmmfModel.primaryKey.name,
          fields: [...dmmfModel.primaryKey.fields],
        }
      : null,
    uniqueFields: dmmfModel.uniqueFields.map(fields => [...fields]),
    uniqueIndexes: dmmfModel.uniqueIndexes.map(idx => ({
      name: idx.name,
      fields: [...idx.fields],
    })),
    documentation: dmmfModel.documentation,
    isGenerated: dmmfModel.isGenerated ?? false,
  };
}

/**
 * Transform DMMF Field to internal ModelField representation
 */
export function transformField(dmmfField: DMMF.Field): ModelField {
  return {
    name: dmmfField.name,
    type: dmmfField.type,
    kind: dmmfField.kind,
    isList: dmmfField.isList,
    isRequired: dmmfField.isRequired,
    isUnique: dmmfField.isUnique,
    isId: dmmfField.isId,
    isReadOnly: dmmfField.isReadOnly,
    isGenerated: dmmfField.isGenerated ?? false,
    isUpdatedAt: dmmfField.isUpdatedAt ?? false,
    hasDefaultValue: dmmfField.hasDefaultValue,
    default: dmmfField.default as ModelField['default'],
    relationName: dmmfField.relationName,
    relationFromFields: dmmfField.relationFromFields
      ? [...dmmfField.relationFromFields]
      : undefined,
    relationToFields: dmmfField.relationToFields ? [...dmmfField.relationToFields] : undefined,
    documentation: dmmfField.documentation,
  };
}

/**
 * Transform DMMF Enum to internal Enum representation
 */
export function transformEnum(dmmfEnum: DMMF.DatamodelEnum): Enum {
  return {
    name: dmmfEnum.name,
    values: dmmfEnum.values.map(v => ({
      name: v.name,
      dbName: v.dbName,
      documentation: (v as any).documentation,
    })),
    documentation: dmmfEnum.documentation,
  };
}

/**
 * Extract relations from models
 */
export function extractRelations(models: Model[]): Relation[] {
  const relations: Relation[] = [];
  const seenRelations = new Set<string>();

  for (const model of models) {
    for (const field of model.fields) {
      if (field.kind === 'object' && field.relationName) {
        const relationKey = [field.relationName, model.name, field.type].sort().join('_');

        if (!seenRelations.has(relationKey)) {
          seenRelations.add(relationKey);

          const targetModel = models.find(m => m.name === field.type);
          const reverseField = targetModel?.fields.find(
            f => f.relationName === field.relationName && f.type === model.name,
          );

          let relationType: Relation['type'] = 'one-to-one';
          if (field.isList && reverseField?.isList) {
            relationType = 'many-to-many';
          } else if (field.isList || reverseField?.isList) {
            relationType = 'one-to-many';
          }

          relations.push({
            name: field.relationName,
            fromModel: model.name,
            fromField: field.name,
            toModel: field.type,
            toField: reverseField?.name ?? '',
            type: relationType,
            isList: field.isList,
          });
        }
      }
    }
  }

  return relations;
}

/**
 * Generate model mappings for CRUD operations
 */
export function generateModelMappings(models: Model[]): ModelMapping[] {
  return models.map(model => {
    const lowerName = camelCase(model.name);
    const pluralName = pluralize(lowerName);

    return {
      model: model.name,
      plural: pluralName,
      findUnique: `${lowerName}`,
      findFirst: `findFirst${model.name}`,
      findMany: pluralName,
      create: `createOne${model.name}`,
      createMany: `createMany${model.name}`,
      update: `updateOne${model.name}`,
      updateMany: `updateMany${model.name}`,
      upsert: `upsertOne${model.name}`,
      delete: `deleteOne${model.name}`,
      deleteMany: `deleteMany${model.name}`,
      aggregate: `aggregate${model.name}`,
      groupBy: `groupBy${model.name}`,
      count: `${lowerName}Count`,
    };
  });
}

/**
 * Transform DMMF InputType to internal InputType representation
 */
export function transformInputType(dmmfInputType: DMMF.InputType): InputType {
  return {
    name: dmmfInputType.name,
    fields: dmmfInputType.fields.map(transformInputField),
    constraints: {
      maxNumFields: dmmfInputType.constraints.maxNumFields,
      minNumFields: dmmfInputType.constraints.minNumFields,
    },
  };
}

/**
 * Transform DMMF SchemaArg to internal InputField representation
 */
export function transformInputField(dmmfArg: DMMF.SchemaArg): InputField {
  const { type, isList } = getMainInputTypeWithListInfo(dmmfArg.inputTypes);
  return {
    name: dmmfArg.name,
    type,
    isList,
    isRequired: dmmfArg.isRequired,
    isNullable: dmmfArg.isNullable,
    inputTypes: dmmfArg.inputTypes.map(t => ({
      type: String(t.type),
      isList: t.isList as boolean,
      location: t.location as 'scalar' | 'enumTypes' | 'inputObjectTypes' | 'outputObjectTypes',
      namespace: t.namespace as 'prisma' | 'model' | undefined,
    })),
  };
}

/**
 * Get the main input type from a list of input types
 * Prefers non-null, non-list, object types
 * Returns both the type name and its isList property
 */
function getMainInputTypeWithListInfo(
  inputTypes: readonly {
    type: string | DMMF.InputType | DMMF.SchemaEnum;
    location: string;
    isList: boolean;
  }[],
): { type: string; isList: boolean } {
  // Prefer input object types
  const objectType = inputTypes.find(t => t.location === 'inputObjectTypes');
  if (objectType) {
    return { type: String(objectType.type), isList: objectType.isList };
  }

  // Then enums
  const enumType = inputTypes.find(t => t.location === 'enumTypes');
  if (enumType) {
    return { type: String(enumType.type), isList: enumType.isList };
  }

  // Then scalars
  const scalarType = inputTypes.find(t => t.location === 'scalar');
  if (scalarType) {
    return { type: String(scalarType.type), isList: scalarType.isList };
  }

  // Fallback to first type
  const firstType = inputTypes[0];
  return { type: String(firstType?.type ?? 'unknown'), isList: firstType?.isList ?? false };
}

/**
 * Convert string to camelCase
 */
export function camelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Convert string to PascalCase
 */
export function pascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Check if a field is a scalar field
 */
export function isScalarField(field: ModelField): boolean {
  return field.kind === 'scalar';
}

/**
 * Check if a field is an enum field
 */
export function isEnumField(field: ModelField): boolean {
  return field.kind === 'enum';
}

/**
 * Check if a field is a relation field
 */
export function isRelationField(field: ModelField): boolean {
  return field.kind === 'object';
}

/**
 * Get ID fields from a model
 */
export function getIdFields(model: Model): ModelField[] {
  // First check for compound primary key
  if (model.primaryKey) {
    return model.fields.filter(f => model.primaryKey!.fields.includes(f.name));
  }

  // Fall back to @id field
  const idField = model.fields.find(f => f.isId);
  return idField ? [idField] : [];
}

/**
 * Get unique fields from a model (excluding ID)
 */
export function getUniqueFields(model: Model): ModelField[] {
  return model.fields.filter(f => f.isUnique && !f.isId);
}
