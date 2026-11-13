import * as graphql from 'graphql';
import * as temporal from '@js-temporal/polyfill';
import * as ts from 'typescript';

import { DMMFDocument } from '../../src/generator/dmmf/document';
import type { GeneratedFile } from '../../src/generator/dmmf/types';
import type { GeneratorConfig } from '../../src/cli/options-parser';
import { createHash } from 'crypto';
import fs from 'fs';
import { generateCode } from '../../src/generator/generate';
import { generateCodeGrouped } from '../../src/generator/generate-grouped-fast';
import { getDMMF } from '@prisma/internals';
import { parseGeneratorConfig } from '../../src/cli/options-parser';
import path from 'path';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf8');

const baseConfig: GeneratorConfig = {
  generateResolvers: true,
  prismaClientPath: '@prisma/client',
  groupByModel: true,
  usePrismaEnums: false,
};

async function generate(schema: string, config: GeneratorConfig): Promise<Map<string, string>> {
  const dmmf = await getDMMF({ datamodel: schema });
  const files = await generateCodeGrouped(new DMMFDocument(dmmf, config), config);
  return new Map(files.map(f => [f.path, f.content]));
}

function hashFiles(files: Map<string, string>): string {
  const h = createHash('sha256');
  const sorted: GeneratedFile[] = [...files]
    .map(([p, content]) => ({ path: p, content }))
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sorted) h.update(f.path + '\0' + f.content + '\0');
  return h.digest('hex');
}

function getClass(content: string, name: string): string {
  const match = content.match(new RegExp(`export class ${name} \\{[\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`class ${name} not found`);
  return match[0];
}

function fieldDecl(classSource: string, field: string): string {
  const match = classSource.match(new RegExp(`@Field\\(([^\\n]*)\\)\\n\\s+${field}[!?]: ([^;]+);`));
  if (!match) throw new Error(`field ${field} not found`);
  return `${match[1]} :: ${match[2]}`;
}

describe('localDate option', () => {
  const localConfig: GeneratorConfig = {
    ...baseConfig,
    localDate: true,
    temporalImport: '@js-temporal/polyfill',
  };
  let files: Map<string, string>;

  beforeAll(async () => {
    files = await generate(fixture('schema-local-date.prisma'), localConfig);
  });

  describe('options', () => {
    it('defaults to off with temporal-polyfill', () => {
      const config = parseGeneratorConfig({});
      expect(config.localDate).toBe(false);
      expect(config.temporalImport).toBe('temporal-polyfill');
    });

    it('parses localDate and temporalImport', () => {
      const config = parseGeneratorConfig({ localDate: 'true', temporalImport: 'x-temporal' });
      expect(config.localDate).toBe(true);
      expect(config.temporalImport).toBe('x-temporal');
    });

    it('rejects the non-grouped generator path', async () => {
      const dmmf = await getDMMF({ datamodel: fixture('schema-local-date.prisma') });
      const config = { ...localConfig, groupByModel: false };
      await expect(generateCode(new DMMFDocument(dmmf, config), config)).rejects.toThrow(
        /groupByModel/,
      );
    });
  });

  describe('output is unchanged when disabled', () => {
    // Hashes of the output produced by v0.9.0 before the localDate option existed.
    it.each([
      [
        'schema-local-date.prisma',
        'e074073fc554d3a5682a347fec29583692acc85f3fc03aecd50f6d05f5f804b6',
      ],
      ['schema-grouped.prisma', 'a60560d8e765cae8aaf9815ac123cb19ecb805350e5c0b18d24b13febb6721fb'],
    ])('%s', async (name, expected) => {
      expect(hashFiles(await generate(fixture(name), baseConfig))).toBe(expected);
      expect(hashFiles(await generate(fixture(name), { ...baseConfig, localDate: false }))).toBe(
        expected,
      );
    });
  });

  describe('model output types', () => {
    it('maps @db.Date fields to GraphQLLocalDate and keeps timestamps as Date', () => {
      const model = files.get('models/Company/model.ts')!;
      expect(model).toContain(`import { GraphQLLocalDate } from '../../helpers';`);
      expect(model).toContain(`import { Temporal } from '@js-temporal/polyfill';`);
      const cls = getClass(model, 'Company');
      expect(fieldDecl(cls, 'startDate')).toBe('() => GraphQLLocalDate :: Temporal.PlainDate');
      expect(fieldDecl(cls, 'endDate')).toBe(
        '() => GraphQLLocalDate, { nullable: true } :: Temporal.PlainDate | null',
      );
      expect(fieldDecl(cls, 'createdAt')).toBe('() => Date :: Date');
    });

    it('maps aggregate and groupBy outputs', () => {
      const agg = files.get('models/Company/aggregations.ts')!;
      expect(agg).toContain(`import { Temporal } from '@js-temporal/polyfill';`);
      for (const cls of ['CompanyMinAggregate', 'CompanyMaxAggregate']) {
        expect(fieldDecl(getClass(agg, cls), 'startDate')).toBe(
          '() => GraphQLLocalDate, { nullable: true } :: Temporal.PlainDate',
        );
        expect(fieldDecl(getClass(agg, cls), 'createdAt')).toBe(
          '() => Date, { nullable: true } :: Date',
        );
      }
      expect(fieldDecl(getClass(agg, 'CompanyGroupBy'), 'endDate')).toBe(
        '() => GraphQLLocalDate, { nullable: true } :: Temporal.PlainDate | null',
      );
    });

    it('leaves models without date fields untouched', () => {
      expect(files.get('models/AuditLog/model.ts')).not.toContain('Temporal');
      expect(files.get('models/AuditLog/inputs.ts')).not.toContain('LocalDate');
    });
  });

  describe('input types', () => {
    it('generates LocalDate counterparts of the needed DateTime inputs', () => {
      const common = files.get('common/inputs.ts')!;
      const names = [...common.matchAll(/export class (\w*LocalDate\w*)/g)].map(m => m[1]).sort();
      expect(names).toEqual([
        'LocalDateFieldUpdateOperationsInput',
        'LocalDateFilter',
        'LocalDateNullableFilter',
        'LocalDateNullableWithAggregatesFilter',
        'LocalDateWithAggregatesFilter',
        'NestedLocalDateFilter',
        'NestedLocalDateNullableFilter',
        'NestedLocalDateNullableWithAggregatesFilter',
        'NestedLocalDateWithAggregatesFilter',
        'NullableLocalDateFieldUpdateOperationsInput',
      ]);
      expect(common).toContain('export class DateTimeFilter');

      const filter = getClass(common, 'LocalDateFilter');
      expect(fieldDecl(filter, 'equals')).toBe(
        '() => GraphQLLocalDate, { nullable: true } :: Temporal.PlainDate | undefined',
      );
      expect(fieldDecl(filter, 'in')).toBe(
        '() => [GraphQLLocalDate], { nullable: true } :: Temporal.PlainDate[] | undefined',
      );
      expect(fieldDecl(filter, 'not')).toBe(
        '() => NestedLocalDateFilter, { nullable: true } :: any | undefined',
      );

      const withAgg = getClass(common, 'LocalDateWithAggregatesFilter');
      expect(fieldDecl(withAgg, '_min')).toBe(
        '() => NestedLocalDateFilter, { nullable: true } :: any | undefined',
      );
      expect(fieldDecl(withAgg, '_count')).toBe(
        '() => NestedIntFilter, { nullable: true } :: any | undefined',
      );

      const update = getClass(common, 'NullableLocalDateFieldUpdateOperationsInput');
      expect(fieldDecl(update, 'set')).toBe(
        '() => GraphQLLocalDate, { nullable: true } :: Temporal.PlainDate | undefined',
      );
    });

    it('substitutes local-date fields in model-scoped inputs', () => {
      const inputs = files.get('models/Company/inputs.ts')!;
      const expectations: Array<[string, string, string]> = [
        ['CompanyWhereInput', 'startDate', 'LocalDateFilter'],
        ['CompanyWhereInput', 'endDate', 'LocalDateNullableFilter'],
        ['CompanyWhereInput', 'createdAt', 'DateTimeFilter'],
        ['CompanyScalarWhereWithAggregatesInput', 'startDate', 'LocalDateWithAggregatesFilter'],
        ['CompanyCreateInput', 'startDate', 'GraphQLLocalDate'],
        ['CompanyCreateInput', 'createdAt', 'Date'],
        ['CompanyUpdateInput', 'startDate', 'LocalDateFieldUpdateOperationsInput'],
        ['CompanyUpdateInput', 'endDate', 'NullableLocalDateFieldUpdateOperationsInput'],
        ['CompanyUpdateInput', 'updatedAt', 'NullableDateTimeFieldUpdateOperationsInput'],
        ['CompanyUpdateManyMutationInput', 'startDate', 'LocalDateFieldUpdateOperationsInput'],
        ['CompanyCreateWithoutContractsInput', 'startDate', 'GraphQLLocalDate'],
        ['CompanyOrderByWithRelationInput', 'startDate', 'SortOrder'],
      ];
      for (const [cls, field, type] of expectations) {
        const gqlType = fieldDecl(getClass(inputs, cls), field).match(/^\(\) => (\w+)/)?.[1];
        expect([cls, field, gqlType]).toEqual([cls, field, type]);
      }
      expect(fieldDecl(getClass(inputs, 'CompanyCreateInput'), 'startDate')).toBe(
        '() => GraphQLLocalDate :: Temporal.PlainDate',
      );
      expect(inputs).toContain(`import { Temporal } from '@js-temporal/polyfill';`);
    });

    it('substitutes relation and compound unique inputs of the owning model', () => {
      const inputs = files.get('models/Contract/inputs.ts')!;
      expect(fieldDecl(getClass(inputs, 'ContractCreateWithoutCompanyInput'), 'signedOn')).toBe(
        '() => GraphQLLocalDate, { nullable: true } :: Temporal.PlainDate | undefined',
      );
      expect(fieldDecl(getClass(inputs, 'ContractCreateWithoutCompanyInput'), 'signedAt')).toBe(
        '() => Date, { nullable: true } :: Date | undefined',
      );
      expect(fieldDecl(getClass(inputs, 'ContractScalarWhereInput'), 'signedOn')).toBe(
        '() => LocalDateNullableFilter, { nullable: true } :: any | undefined',
      );
      expect(
        fieldDecl(getClass(inputs, 'ContractCompanyIdSignedOnCompoundUniqueInput'), 'signedOn'),
      ).toBe('() => GraphQLLocalDate :: Temporal.PlainDate');
    });
  });

  describe('LOCAL_DATE_FIELDS', () => {
    it('lists local-date fields per model and is exported from the root index', () => {
      expect(files.get('local-date-fields.ts')).toContain(`export const LOCAL_DATE_FIELDS = {
  Company: { startDate: 'required', endDate: 'optional' },
  Contract: { signedOn: 'optional' },
} as const;`);
      expect(files.get('index.ts')).toContain(`export * from './local-date-fields';`);
    });

    it('is emitted empty when there are no local-date fields', async () => {
      const out = await generate(fixture('schema-grouped.prisma'), localConfig);
      expect(out.get('local-date-fields.ts')).toContain(
        'export const LOCAL_DATE_FIELDS = {} as const;',
      );
    });
  });

  describe('GraphQLLocalDate scalar', () => {
    let scalar: graphql.GraphQLScalarType;
    const { Temporal } = temporal;

    beforeAll(() => {
      const { outputText } = ts.transpileModule(files.get('helpers.ts')!, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      });
      const modules: Record<string, unknown> = {
        graphql,
        '@js-temporal/polyfill': temporal,
        '@prisma/client': { Prisma: {} },
      };
      const mod = { exports: {} as Record<string, unknown> };
      new Function('require', 'module', 'exports', outputText)(
        (id: string) => modules[id],
        mod,
        mod.exports,
      );
      scalar = mod.exports['GraphQLLocalDate'] as graphql.GraphQLScalarType;
    });

    it('is named LocalDate', () => {
      expect(scalar.name).toBe('LocalDate');
      expect(scalar.description).toContain('YYYY-MM-DD');
    });

    it('serializes PlainDate, Date (UTC) and date strings', () => {
      expect(scalar.serialize(Temporal.PlainDate.from('2025-03-01'))).toBe('2025-03-01');
      expect(scalar.serialize(new Date('2025-03-01T00:00:00.000Z'))).toBe('2025-03-01');
      expect(scalar.serialize(new Date('2025-03-01T23:30:00.000Z'))).toBe('2025-03-01');
      expect(scalar.serialize('2025-03-01')).toBe('2025-03-01');
    });

    it('rejects other values on serialize', () => {
      for (const value of ['2025-03-01T00:00:00Z', 20250301, null, new Date('invalid'), {}]) {
        expect(() => scalar.serialize(value)).toThrow(graphql.GraphQLError);
      }
    });

    it('parses valid dates into PlainDate', () => {
      const value = scalar.parseValue('2024-02-29');
      expect(value).toBeInstanceOf(Temporal.PlainDate);
      expect(String(value)).toBe('2024-02-29');
      const literal = scalar.parseLiteral(graphql.parseValue('"2025-12-31"'));
      expect(String(literal)).toBe('2025-12-31');
    });

    it('rejects invalid dates and datetime strings', () => {
      for (const value of [
        '2025-02-30',
        '2025-13-01',
        '2025-01-01T00:00:00Z',
        '2025-1-1',
        '',
        0,
        null,
      ]) {
        expect(() => scalar.parseValue(value)).toThrow(graphql.GraphQLError);
      }
      for (const literal of ['"2025-02-30"', '"2025-01-01T00:00:00Z"', '20250101']) {
        expect(() => scalar.parseLiteral(graphql.parseValue(literal))).toThrow(
          graphql.GraphQLError,
        );
      }
    });
  });
});
