// src/services/NangoService.ts

import {Nango} from '@nangohq/node';
import winston from 'winston';
import { CONFIG } from '../config';
import { ToolCall } from './conversation/types';

// Define the interfaces for the advanced options based on the YAML file
interface FilterCondition {
  field: string;
  operator: string;
  value?: any;
  values?: any[];
}

interface OrderByClause {
  field: string;
  direction: string;
}

interface AggregateFunction {
  function: string;
  field: string;
  alias: string;
}

interface Filters {
  conditions?: FilterCondition[];
  logic?: string;
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
  includeFields?: string[];
  excludeFields?: string[];
  timeFrame?: string;
  groupBy?: string[];
  aggregate?: AggregateFunction[];
  includeDeleted?: boolean;
}

interface BatchOptions {
  allOrNothing?: boolean;
  batchSize?: number;
}

interface EmailFilter {
  sender?: string | string[];
  recipient?: string | string[];
  subject?: {
    contains?: string[];
    startsWith?: string;
    endsWith?: string;
    exact?: string;
  };
  dateRange?: {
    after?: string;
    before?: string;
  };
  hasAttachment?: boolean;
  labels?: string[];
  includeBody?: boolean;
  excludeCategories?: string[];
  isRead?: boolean;
  isImportant?: boolean;
  includeSpam?: boolean;
  includeTrash?: boolean;
  limit?: number;
  offset?: number;
}

interface SalesforceActionOptions {
  records?: Record<string, any>[];
  checkDuplicates?: boolean;
  duplicateFilters?: Filters;
  useTemplate?: string;
  templateParams?: Record<string, any>;
  identifierType?: string;
  filters?: Filters;
  batchOptions?: BatchOptions;
  timeFrame?: string;
  format?: string;
  countOnly?: boolean;
  limit?: number;
}

// Define a response interface for Nango API responses
interface NangoResponse {
  data?: any[];
  [key: string]: any;
}

export class NangoService {
  executeTool(toolCall: ToolCall) {
    throw new Error('Method not implemented.');
  }
  private nango: Nango;
  private logger: winston.Logger;
  private connectionId: string;

  constructor() {
    this.connectionId = CONFIG.CONNECTION_ID;

    // Initialize Nango with the secret key
    this.nango = new Nango({ secretKey: '7addd614-fda8-48a2-9c79-5443fda50a84' });

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console(),
        // Add other transports if needed, e.g., File transport
      ],
    });
  }

  // Enhanced method to trigger Salesforce actions using Nango SDK with support for advanced options
  async triggerSalesforceAction(
    operation: string,
    entityType: string,
    identifierOrFieldsOrPayload: string | Record<string, any>,
    fields?: Record<string, any> | string[] | null,
    options?: SalesforceActionOptions
  ): Promise<NangoResponse> {
    let actionName: string;
    let payload: Record<string, any> = { operation, entityType };

    switch (operation) {
      case 'create':
        actionName = 'salesforce-create-entity';
        
        // Handle complete payload object if provided
        if (typeof identifierOrFieldsOrPayload === 'object') {
          payload.fields = identifierOrFieldsOrPayload;
        } else {
          throw new Error('Fields must be provided as an object for create operation.');
        }
        
        // Add new options for create operation
        if (options) {
          if (options.records) payload.records = options.records;
          if (options.checkDuplicates !== undefined) payload.checkDuplicates = options.checkDuplicates;
          if (options.duplicateFilters) payload.duplicateFilters = options.duplicateFilters;
          if (options.useTemplate) payload.useTemplate = options.useTemplate;
          if (options.templateParams) payload.templateParams = options.templateParams;
        }
        break;

      case 'update':
        actionName = 'salesforce-update-entity';
        
        // Handle case where we use filters instead of a direct identifier
        if (options?.filters) {
          payload.filters = options.filters;
        } else if (typeof identifierOrFieldsOrPayload === 'string') {
          payload.identifier = identifierOrFieldsOrPayload;
          if (options?.identifierType) {
            payload.identifierType = options.identifierType;
          }
        } else {
          throw new Error('Either identifier or filters must be provided for update operation.');
        }
        
        // Add fields for update operation
        if (typeof fields === 'object' && !Array.isArray(fields)) {
          payload.fields = fields;
        } else {
          throw new Error('Fields must be an object for update operation.');
        }
        
        // Add batch options if provided
        if (options?.batchOptions) {
          payload.batchOptions = options.batchOptions;
        }
        break;

      case 'fetch':
        actionName = 'salesforce-fetch-entity';
        
        // Handle case where third parameter is a complete payload object
        if (typeof identifierOrFieldsOrPayload === 'object' && !Array.isArray(identifierOrFieldsOrPayload)) {
          // Use the provided payload directly
          payload = {
            operation,
            entityType,
            ...identifierOrFieldsOrPayload
          };
        } else if (options?.filters) {
          // Use structured filters for fetching multiple records
          payload.filters = options.filters;
        } else if (typeof identifierOrFieldsOrPayload === 'string') {
          // Handle traditional string identifier
          
          // Special case for 'all' identifier - use empty filters
          if (identifierOrFieldsOrPayload === 'all') {
            payload.filters = { conditions: [] }; // Empty conditions array to fetch all records
          } else {
            // For normal identifier, add both identifier and identifierType
            payload.identifier = identifierOrFieldsOrPayload;
            payload.identifierType = options?.identifierType || 'Id'; // Default to 'Id' as the identifier type
          }
        } else {
          throw new Error('Either identifier or filters must be provided for fetch operation.');
        }
        
        // Add additional fetch options
        if (options) {
          if (options.timeFrame) payload.timeFrame = options.timeFrame;
          if (options.format) payload.format = options.format;
          if (options.countOnly !== undefined) payload.countOnly = options.countOnly;
          if (options.limit !== undefined) payload.limit = options.limit;
        }
        
        // Add fields if provided
        if (Array.isArray(fields) && fields.length > 0) {
          payload.includeFields = fields;
        } else if (fields && typeof fields === 'object') {
          // If fields is an object, it might contain additional options
          payload.includeFields = Object.keys(fields);
        }
        break;

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    this.logger.info('Triggering Salesforce action via Nango', {
      actionName,
      connectionId: this.connectionId,
      payload,
    });

    try {
      const response = await this.nango.triggerAction(
        'salesforce-2', // Provider Key as configured in Nango
        this.connectionId,
        actionName,
        payload
      ) as NangoResponse;
      
      this.logger.info('Salesforce action triggered successfully', { response });
      return response;
    } catch (error: any) {
      this.logger.error('Failed to trigger Salesforce action via Nango', {
        error: error.message || error,
        actionName,
        payload,
      });
      throw error;
    }
  }

  // Enhanced method to fetch emails with filter support
  async fetchEmails(sessionId: string, options?: { backfillPeriodMs?: number; filters?: EmailFilter }): Promise<NangoResponse> {
    const actionName = 'fetch-emails';
    const payload: Record<string, any> = {};
    
    // Add backfill period if provided
    if (options?.backfillPeriodMs) {
      payload.backfillPeriodMs = options.backfillPeriodMs;
    }
    
    // Add filters if provided
    if (options?.filters) {
      payload.filters = options.filters;
      
      // Log specific filter options for debugging
      this.logger.info('Email filters applied', { 
        filters: options.filters,
        sessionId
      });
    }
    
    this.logger.info('Fetching emails via Nango', {
      actionName,
      connectionId: this.connectionId,
      sessionId,
      payload
    });
    
    try {
      const response = await this.nango.triggerAction(
        'google-mail', // Provider Key as configured in Nango
        this.connectionId,
        actionName,
        payload
      ) as NangoResponse;
      
      const dataLength = Array.isArray(response?.data) ? response.data.length : 0;
      
      this.logger.info('Email fetch completed successfully', { 
        count: dataLength,
        sessionId 
      });
      
      return response;
    } catch (error: any) {
      this.logger.error('Failed to fetch emails via Nango', {
        error: error.message || error,
        sessionId,
        payload,
      });
      throw error;
    }
  }

  // Additional generic methods can be added here if necessary
}