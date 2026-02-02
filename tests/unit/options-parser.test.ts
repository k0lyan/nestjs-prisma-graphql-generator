import { parseGeneratorConfig } from '../../src/cli/options-parser';

describe('Options Parser', () => {
  describe('parseGeneratorConfig', () => {
    it('should return default config when no options provided', () => {
      const config = parseGeneratorConfig({});

      expect(config.generateResolvers).toBe(true);
      expect(config.useValidation).toBe(false);
      expect(config.prismaClientPath).toBe('@prisma/client');
      expect(config.emitCompiled).toBe(false);
      expect(config.outputDirs?.models).toBe('models');
      expect(config.outputDirs?.inputs).toBe('inputs');
      expect(config.outputDirs?.args).toBe('args');
      expect(config.outputDirs?.enums).toBe('enums');
      expect(config.outputDirs?.resolvers).toBe('resolvers');
    });

    it('should parse emitOnly option', () => {
      const config = parseGeneratorConfig({
        emitOnly: 'models,resolvers',
      });

      expect(config.emitOnly).toEqual(['models', 'resolvers']);
    });

    it('should parse generateResolvers option', () => {
      const configTrue = parseGeneratorConfig({ generateResolvers: 'true' });
      const configFalse = parseGeneratorConfig({ generateResolvers: 'false' });

      expect(configTrue.generateResolvers).toBe(true);
      expect(configFalse.generateResolvers).toBe(false);
    });

    it('should parse useValidation option', () => {
      const config = parseGeneratorConfig({ useValidation: 'true' });

      expect(config.useValidation).toBe(true);
    });

    it('should parse prismaClientPath option', () => {
      const config = parseGeneratorConfig({
        prismaClientPath: './generated/prisma',
      });

      expect(config.prismaClientPath).toBe('./generated/prisma');
    });

    it('should parse custom output directories', () => {
      const config = parseGeneratorConfig({
        modelsOutput: 'types/models',
        inputsOutput: 'types/inputs',
        argsOutput: 'types/args',
        enumsOutput: 'types/enums',
        resolversOutput: 'graphql/resolvers',
      });

      expect(config.outputDirs?.models).toBe('types/models');
      expect(config.outputDirs?.inputs).toBe('types/inputs');
      expect(config.outputDirs?.args).toBe('types/args');
      expect(config.outputDirs?.enums).toBe('types/enums');
      expect(config.outputDirs?.resolvers).toBe('graphql/resolvers');
    });

    it('should parse type prefix and suffix', () => {
      const config = parseGeneratorConfig({
        typePrefix: 'GQL',
        typeSuffix: 'Type',
      });

      expect(config.typePrefix).toBe('GQL');
      expect(config.typeSuffix).toBe('Type');
    });

    it('should parse emitCompiled option', () => {
      const config = parseGeneratorConfig({ emitCompiled: 'true' });

      expect(config.emitCompiled).toBe(true);
    });
  });
});
