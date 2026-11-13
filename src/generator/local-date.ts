import type { InputField, InputType, Model, ModelField } from './dmmf/types';

import { findOwningModel } from './dmmf/transformer';

// '$' cannot appear in a Prisma identifier, so this never collides with a real type name.
export const LOCAL_DATE_SCALAR = '$LocalDate';

export const LOCAL_DATE_GRAPHQL_TYPE = 'GraphQLLocalDate';
export const LOCAL_DATE_TS_TYPE = 'Temporal.PlainDate';

export function isLocalDateField(field: ModelField): boolean {
  return field.kind === 'scalar' && field.type === 'DateTime' && field.nativeType?.[0] === 'Date';
}

/**
 * Model name -> (field name -> field) for every `DateTime @db.Date` field
 */
export function getLocalDateFields(models: Model[]): Map<string, Map<string, ModelField>> {
  const result = new Map<string, Map<string, ModelField>>();
  for (const model of models) {
    const fields = model.fields.filter(isLocalDateField);
    if (fields.length > 0) {
      result.set(model.name, new Map(fields.map(f => [f.name, f])));
    }
  }
  return result;
}

export function toLocalDateTypeName(dateTimeTypeName: string): string {
  return dateTimeTypeName.replace(/DateTime/g, 'LocalDate');
}

/**
 * Rewrites input types so that local-date fields of model-scoped inputs reference
 * `LocalDate*` counterparts of the shared `DateTime*` inputs, and adds those counterparts
 * (right after their originals) for every one that ends up referenced.
 */
export function applyLocalDateToInputTypes(
  inputTypes: Map<string, InputType>,
  models: Model[],
): Map<string, InputType> {
  const localDateFields = getLocalDateFields(models);
  const modelNames = new Set(models.map(m => m.name));

  // Prisma also sets meta.grouping on shared types (e.g. DateTimeFieldUpdateOperationsInput gets
  // the first model that used it), so the name decides whether a type is model-scoped and
  // meta.grouping only picks the model (it is right where the name is ambiguous, e.g. compound
  // unique inputs like ProgramLimitGroupIdMedicalServiceIdCompoundUniqueInput).
  const getOwner = (inputType: InputType): string | null => {
    const nameOwner = findOwningModel(inputType.name, modelNames);
    if (!nameOwner) return null;
    const grouping = inputType.meta?.grouping;
    return grouping && modelNames.has(grouping) ? grouping : nameOwner;
  };

  const isSharedDateTimeInput = (name: string): boolean => {
    const it = inputTypes.get(name);
    return !!it && name.includes('DateTime') && !findOwningModel(name, modelNames);
  };

  const needed = new Set<string>();
  const queue: string[] = [];
  const requireCounterpart = (name: string): string => {
    if (!needed.has(name)) {
      needed.add(name);
      queue.push(name);
    }
    return toLocalDateTypeName(name);
  };

  const rewriteField = (field: InputField): InputField => {
    let type = field.type;
    if (type === 'DateTime') type = LOCAL_DATE_SCALAR;
    else if (isSharedDateTimeInput(type)) type = requireCounterpart(type);
    else return field;

    return {
      ...field,
      type,
      inputTypes: field.inputTypes.map(ref => {
        if (ref.location === 'scalar' && ref.type === 'DateTime') {
          return { ...ref, type: LOCAL_DATE_SCALAR };
        }
        if (ref.location === 'inputObjectTypes' && isSharedDateTimeInput(ref.type)) {
          return { ...ref, type: requireCounterpart(ref.type) };
        }
        return ref;
      }),
    };
  };

  const rewritten = new Map<string, InputType>();
  for (const [name, inputType] of inputTypes) {
    const owner = getOwner(inputType);
    const fields = owner ? localDateFields.get(owner) : undefined;
    if (!fields) continue;
    if (!inputType.fields.some(f => fields.has(f.name))) continue;
    rewritten.set(name, {
      ...inputType,
      fields: inputType.fields.map(f => (fields.has(f.name) ? rewriteField(f) : f)),
    });
  }

  const counterparts = new Map<string, InputType>();
  while (queue.length > 0) {
    const name = queue.shift()!;
    const original = inputTypes.get(name)!;
    counterparts.set(name, {
      name: toLocalDateTypeName(name),
      fields: original.fields.map(rewriteField),
      constraints: { ...original.constraints },
    });
  }

  const result = new Map<string, InputType>();
  for (const [name, inputType] of inputTypes) {
    result.set(name, rewritten.get(name) ?? inputType);
    const counterpart = counterparts.get(name);
    if (counterpart) result.set(counterpart.name, counterpart);
  }
  return result;
}

export function generateLocalDateFieldsFile(models: Model[]): string {
  const entries: string[] = [];
  for (const [modelName, fields] of getLocalDateFields(models)) {
    const props = [...fields.values()]
      .map(f => `${f.name}: '${f.isRequired ? 'required' : 'optional'}'`)
      .join(', ');
    entries.push(`  ${modelName}: { ${props} },`);
  }
  const body = entries.length > 0 ? `{\n${entries.join('\n')}\n}` : '{}';
  return `/**
 * Prisma models and their \`DateTime @db.Date\` fields, exposed as the LocalDate scalar.
 */
export const LOCAL_DATE_FIELDS = ${body} as const;

export type LocalDateFieldsMap = typeof LOCAL_DATE_FIELDS;
`;
}

export function generateLocalDateScalar(): string {
  return `
const LOCAL_DATE_PATTERN = /^\\d{4}-\\d{2}-\\d{2}$/;

function isPlainDate(value: unknown): value is Temporal.PlainDate {
  // Brand check instead of instanceof: values may come from a different Temporal implementation.
  return Object.prototype.toString.call(value) === '[object Temporal.PlainDate]';
}

function parseLocalDate(value: unknown): Temporal.PlainDate {
  if (typeof value === 'string' && LOCAL_DATE_PATTERN.test(value)) {
    try {
      return Temporal.PlainDate.from(value, { overflow: 'reject' });
    } catch {
      // fall through to the error below
    }
  }
  throw new GraphQLError(
    \`LocalDate must be a valid calendar date in YYYY-MM-DD format, got: \${JSON.stringify(value)}\`,
  );
}

export type LocalDate = Temporal.PlainDate;

/**
 * GraphQL Scalar for calendar dates without time or time zone (Prisma \`DateTime @db.Date\`)
 */
export const GraphQLLocalDate = new GraphQLScalarType<Temporal.PlainDate, string>({
  name: 'LocalDate',
  description: 'A calendar date without time or time zone, as an ISO 8601 string (YYYY-MM-DD).',
  serialize: (value: unknown) => {
    if (isPlainDate(value)) {
      return value.toString();
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return Temporal.PlainDate.from({
        year: value.getUTCFullYear(),
        month: value.getUTCMonth() + 1,
        day: value.getUTCDate(),
      }).toString();
    }
    if (typeof value === 'string' && LOCAL_DATE_PATTERN.test(value)) {
      return value;
    }
    throw new GraphQLError(\`LocalDate cannot serialize value: \${String(value)}\`);
  },
  parseValue: parseLocalDate,
  parseLiteral: ast => {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError(\`LocalDate must be a string in YYYY-MM-DD format, got: \${ast.kind}\`, {
        nodes: ast,
      });
    }
    return parseLocalDate(ast.value);
  },
});
`;
}
