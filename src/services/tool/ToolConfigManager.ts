import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { z } from 'zod';
import { ToolConfig, ProviderConfig, EntityType,  } from './tool.types'

interface FieldValidation {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
}

interface FieldMetadata {
    required?: boolean;
    hint?: string;
    validValues?: string[];
}

interface EntityField {
    type: string;
    prompt: string;
    hint: string;
    metadata?: {
        entityTypeSpecific?: Record<string, FieldMetadata>;
        validation?: FieldValidation;
    };
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'ToolConfigManager' },
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: 'combined.log',
            maxsize: 1024 * 1024 * 10 // 10MB
        })
    ],
    rejectionHandlers: [
        new winston.transports.File({ filename: 'rejections.log' })
    ]
});

export class ToolConfigManager {
  [x: string]: any;
  static getAllRequiredParams() {
    throw new Error('Method not implemented.');
  }
  private configFilePath: string;
  private tools: Record<string, ToolConfig>;
  private providers: Record<string, ProviderConfig>;
  private objects: Record<string, string[]>;
  private toolDescriptionCache: Array<{
      type: 'function';
      function: {
          name: string;
          description: string;
          parameters: any;
      };
  }> | null = null;

  constructor(configFilePath: string) {
      this.configFilePath = './src/config/tool-config.json'; // or use an absolute path
      this.tools = {};
      this.providers = {};
      this.objects = {};
      this.loadConfig();
  }

  private loadConfig() {
    try {
        logger.info(`Loading configuration from ${this.configFilePath}`);
        const configData = JSON.parse(fs.readFileSync(path.resolve(this.configFilePath), 'utf-8'));

        // Validate config structure
        if (!configData || !configData.tools || !configData.providers) {
            throw new Error('Invalid configuration structure: tools or providers are missing.');
        }

        logger.info('Successfully loaded configuration file', { config: configData });

        configData.tools.forEach((tool: ToolConfig) => {
            this.tools[tool.name] = tool;
        });

        Object.entries(configData.providers).forEach(([providerName, providerData]: [string, any]) => {
            this.providers[providerName] = providerData as ProviderConfig;
            this.objects[providerName] = providerData.objects;
        });
    } catch (error: any) {
        logger.error(`Error loading configuration: ${error.message}`, { error });
        throw new Error(`Error loading configuration: ${error.message}`);
    }
}










public validateToolArgs(toolName: string, args: Record<string, any>): Record<string, any> {
  logger.info(`Validating arguments for tool ${toolName}`, { args });
  const toolConfig = this.getToolConfig(toolName);
  
  try {
      // Create dynamic schema based on tool parameters
      const schema = this.createZodSchema(toolConfig.parameters);
      const validated = schema.parse(args);

      // Specific validations for entity operations
      if (toolName.includes('entity') && 'entityType' in args) {
          this.validateEntityType(args.entityType);
      }

      logger.info(`Validation successful for ${toolName}`, { validated });
      return validated;
  } catch (error: any) {
      logger.error(`Validation failed for ${toolName}`, { error });
      throw new Error(`Invalid arguments for tool '${toolName}': ${error.message}`);
  }
}

private validateEntityType(entityType: string) {
  if (!Object.values(EntityType).includes(entityType as EntityType)) {
      throw new Error(`Invalid entity type: ${entityType}`);
  }
}


private createZodSchema(parameters: any): z.ZodObject<any> {
  const schemaShape: Record<string, any> = {};

  Object.entries(parameters.properties).forEach(([key, prop]: [string, any]) => {
      let fieldSchema: z.ZodTypeAny;

      switch (prop.type) {
          case 'string':
              fieldSchema = z.string();
              if (prop.enum) {
                  fieldSchema = z.enum(prop.enum as [string, ...string[]]);
              }
              break;
          case 'integer':
              fieldSchema = z.number().int();
              break;
          case 'number':
              fieldSchema = z.number();
              break;
          case 'boolean':
              fieldSchema = z.boolean();
              break;
          case 'object':
              fieldSchema = z.record(z.any());
              break;
          case 'array':
              fieldSchema = z.array(z.any());
              break;
          default:
              fieldSchema = z.any();
      }

      if (!parameters.required?.includes(key)) {
          fieldSchema = fieldSchema.optional();
      }

      schemaShape[key] = fieldSchema;
  });

  return z.object(schemaShape);
}




  // Tool-related methods
  public getToolConfig(toolName: string): ToolConfig {
      const tool = this.tools[toolName];
      if (!tool) {
          throw new Error(`Tool '${toolName}' not found in configuration`);
      }
      return tool;
  }

  public getToolNames(): string[] {
      return Object.keys(this.tools);
  }

  public getToolParameters(toolName: string): any {
      return this.getToolConfig(toolName).parameters;
  }

  public isValidTool(toolName: string): boolean {
      return toolName in this.tools;
  }

  public getToolRequiredParams(toolName: string): string[] {
      const tool = this.getToolConfig(toolName);
      const requiredParams: string[] = [];

      if (tool.input?.fields?.required) {
          requiredParams.push(...tool.input.fields.required);
      }

      if (tool.input?.entityType?.enum) {
          requiredParams.push('entityType');
      }

      return requiredParams;
  }

  // NEW: Returns an array of all tool configurations.
  public getAllTools(): ToolConfig[] {
      return Object.values(this.tools);
  }

  // NEW: Returns a mapping of each tool's name to its required parameters.
  public getAllRequiredParams(): { [toolName: string]: string[] } {
  const result: { [toolName: string]: string[] } = {};
  Object.entries(this.tools).forEach(([toolName, tool]) => {
    let requiredParams: string[] = [];
    if (tool.input?.fields?.required) {
      requiredParams = [...tool.input.fields.required]; // clone array
    }
    if (tool.input?.entityType?.enum) {
      requiredParams.push('entityType');
    }
    result[toolName] = requiredParams;
  });
  return result;
}


  public getFieldConfig(entityType: string, fieldName: string): EntityField | undefined {
      const toolConfig = Object.values(this.tools).find((tool) => 
          tool.input?.entityType?.enum.includes(entityType)
      );
      return toolConfig?.input?.fields?.properties[fieldName];
  }

  public getRequiredFields(entityType: string): string[] {
      const toolConfig = Object.values(this.tools).find((tool) => 
          tool.input?.entityType?.enum.includes(entityType)
      );
      return toolConfig?.input?.fields?.required || [];
  }

  public getEntityTypeConfig(toolName: string) {
      return this.getToolConfig(toolName)?.input?.entityType;
  }

  // Provider-related methods
  public getProviderConfig(providerName: string): ProviderConfig {
      const provider = this.providers[providerName];
      if (!provider) {
          throw new Error(`Provider '${providerName}' not found in configuration`);
      }
      return provider;
  }



  public getProviderEndpoint(providerName: string): string {
      return this.getProviderConfig(providerName).endpoint;
  }

  public getProviderConfigKey(providerName: string): string {
      return this.getProviderConfig(providerName).provider_config_key;
  }

  

  public getConnectionId(providerName: string): string {
      return this.getProviderConfig(providerName).connection_id;
  }

  public getProviderObjects(provider: string): string[] {
      return this.objects[provider] || [];
  }

  public getAllProviders(): string[] {
      return Object.keys(this.providers);
  }

  public getProviders(): Record<string, ProviderConfig> {
      return this.providers;
  }

  // Tool description methods
  public getToolDescriptions(): Array<{
      type: 'function';
      function: {
          name: string;
          description: string;
          parameters: any;
      };
  }> {
      if (this.toolDescriptionCache) {
          return this.toolDescriptionCache;
      }

      this.toolDescriptionCache = Object.values(this.tools).map(tool => ({
          type: 'function',
          function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
          },
      }));

      return this.toolDescriptionCache;
  }

  // Utility methods
  public refreshConfig(): void {
      this.toolDescriptionCache = null;
      this.loadConfig();
  }

  public getParameterPrompt(toolName: string, paramPath: string): string {
      const tool = this.getToolConfig(toolName);
      const param = this.resolveParam(tool.parameters, paramPath);
      return param?.prompt || `Please provide ${paramPath.split('.').pop()}`;
  }

  public getParameterHint(toolName: string, paramPath: string): string {
      const tool = this.getToolConfig(toolName);
      const param = this.resolveParam(tool.parameters, paramPath);
      return param?.hint || 'Enter value';
  }

  private resolveParam(schema: any, path: string): any {
      return path.split('.').reduce((obj, key) => obj?.properties?.[key], schema);
  }
}
