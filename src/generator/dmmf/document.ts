import type { Enum, InputType, Model, ModelMapping, OutputType, Relation } from './types';
import {
  extractRelations,
  generateModelMappings,
  transformEnum,
  transformInputType,
  transformModel,
} from './transformer';

import type { DMMF } from '@prisma/generator-helper';
import type { GeneratorConfig } from '../../cli/options-parser';

/**
 * Processed DMMF Document that provides easy access to transformed schema data
 */
export class DMMFDocument {
  private readonly _dmmf: DMMF.Document;
  private readonly _config: GeneratorConfig;

  private _models: Model[] | null = null;
  private _enums: Enum[] | null = null;
  private _relations: Relation[] | null = null;
  private _modelMappings: ModelMapping[] | null = null;
  private _inputTypes: Map<string, InputType> | null = null;
  private _outputTypes: Map<string, OutputType> | null = null;

  constructor(dmmf: DMMF.Document, config: GeneratorConfig) {
    this._dmmf = dmmf;
    this._config = config;
  }

  /**
   * Get raw DMMF document
   */
  get raw(): DMMF.Document {
    return this._dmmf;
  }

  /**
   * Get generator config
   */
  get config(): GeneratorConfig {
    return this._config;
  }

  /**
   * Get all transformed models
   */
  get models(): Model[] {
    if (!this._models) {
      this._models = this._dmmf.datamodel.models.map(transformModel);
    }
    return this._models;
  }

  /**
   * Get all transformed enums
   */
  get enums(): Enum[] {
    if (!this._enums) {
      this._enums = this._dmmf.datamodel.enums.map(transformEnum);
    }
    return this._enums;
  }

  /**
   * Get all relations between models
   */
  get relations(): Relation[] {
    if (!this._relations) {
      this._relations = extractRelations(this.models);
    }
    return this._relations;
  }

  /**
   * Get CRUD operation mappings for all models
   */
  get modelMappings(): ModelMapping[] {
    if (!this._modelMappings) {
      this._modelMappings = generateModelMappings(this.models);
    }
    return this._modelMappings;
  }

  /**
   * Get input types map
   */
  get inputTypes(): Map<string, InputType> {
    if (!this._inputTypes) {
      this._inputTypes = new Map();

      // Process prisma namespace input types
      const prismaInputTypes = this._dmmf.schema.inputObjectTypes.prisma ?? [];
      for (const inputType of prismaInputTypes) {
        this._inputTypes.set(inputType.name, transformInputType(inputType));
      }

      // Process model namespace input types
      const modelInputTypes = this._dmmf.schema.inputObjectTypes.model ?? [];
      for (const inputType of modelInputTypes) {
        this._inputTypes.set(inputType.name, transformInputType(inputType));
      }
    }
    return this._inputTypes;
  }

  /**
   * Get output types map
   */
  get outputTypes(): Map<string, OutputType> {
    if (!this._outputTypes) {
      this._outputTypes = new Map();

      // Process prisma namespace output types
      const prismaOutputTypes = this._dmmf.schema.outputObjectTypes.prisma ?? [];
      for (const outputType of prismaOutputTypes) {
        this._outputTypes.set(outputType.name, {
          name: outputType.name,
          fields: outputType.fields.map(f => ({
            name: f.name,
            type: String(f.outputType.type),
            isList: f.outputType.isList as boolean,
            isNullable: f.isNullable ?? false,
            args: f.args.map(a => ({
              name: a.name,
              type: String(a.inputTypes[0]?.type ?? 'unknown'),
              isList: a.inputTypes.some(t => t.isList),
              isRequired: a.isRequired,
              isNullable: a.isNullable,
              inputTypes: a.inputTypes.map(t => ({
                type: String(t.type),
                isList: t.isList as boolean,
                location: t.location as
                  | 'scalar'
                  | 'enumTypes'
                  | 'inputObjectTypes'
                  | 'outputObjectTypes',
                namespace: t.namespace as 'prisma' | 'model' | undefined,
              })),
            })),
          })),
        });
      }

      // Process model namespace output types
      const modelOutputTypes = this._dmmf.schema.outputObjectTypes.model ?? [];
      for (const outputType of modelOutputTypes) {
        this._outputTypes.set(outputType.name, {
          name: outputType.name,
          fields: outputType.fields.map(f => ({
            name: f.name,
            type: String(f.outputType.type),
            isList: f.outputType.isList as boolean,
            isNullable: f.isNullable ?? false,
            args: f.args.map(a => ({
              name: a.name,
              type: String(a.inputTypes[0]?.type ?? 'unknown'),
              isList: a.inputTypes.some(t => t.isList),
              isRequired: a.isRequired,
              isNullable: a.isNullable,
              inputTypes: a.inputTypes.map(t => ({
                type: String(t.type),
                isList: t.isList as boolean,
                location: t.location as
                  | 'scalar'
                  | 'enumTypes'
                  | 'inputObjectTypes'
                  | 'outputObjectTypes',
                namespace: t.namespace as 'prisma' | 'model' | undefined,
              })),
            })),
          })),
        });
      }
    }
    return this._outputTypes;
  }

  /**
   * Get a model by name
   */
  getModel(name: string): Model | undefined {
    return this.models.find(m => m.name === name);
  }

  /**
   * Get an enum by name
   */
  getEnum(name: string): Enum | undefined {
    return this.enums.find(e => e.name === name);
  }

  /**
   * Get model mapping by model name
   */
  getModelMapping(modelName: string): ModelMapping | undefined {
    return this.modelMappings.find(m => m.model === modelName);
  }

  /**
   * Get relations for a specific model
   */
  getRelationsForModel(modelName: string): Relation[] {
    return this.relations.filter(r => r.fromModel === modelName || r.toModel === modelName);
  }

  /**
   * Get input type by name
   */
  getInputType(name: string): InputType | undefined {
    return this.inputTypes.get(name);
  }

  /**
   * Get output type by name
   */
  getOutputType(name: string): OutputType | undefined {
    return this.outputTypes.get(name);
  }

  /**
   * Check if a type is an enum
   */
  isEnum(typeName: string): boolean {
    return this.enums.some(e => e.name === typeName);
  }

  /**
   * Check if a type is a model
   */
  isModel(typeName: string): boolean {
    return this.models.some(m => m.name === typeName);
  }

  /**
   * Get all input types that match a pattern
   */
  getInputTypesByPattern(pattern: RegExp): InputType[] {
    const result: InputType[] = [];
    for (const [name, inputType] of this.inputTypes) {
      if (pattern.test(name)) {
        result.push(inputType);
      }
    }
    return result;
  }

  /**
   * Get input types for a specific model
   */
  getModelInputTypes(modelName: string): {
    whereInput?: InputType;
    whereUniqueInput?: InputType;
    createInput?: InputType;
    updateInput?: InputType;
    orderByInput?: InputType;
  } {
    return {
      whereInput: this.getInputType(`${modelName}WhereInput`),
      whereUniqueInput: this.getInputType(`${modelName}WhereUniqueInput`),
      createInput: this.getInputType(`${modelName}CreateInput`),
      updateInput: this.getInputType(`${modelName}UpdateInput`),
      orderByInput: this.getInputType(`${modelName}OrderByWithRelationInput`),
    };
  }
}
