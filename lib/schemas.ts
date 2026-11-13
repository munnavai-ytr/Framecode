import { Type, Schema } from '@google/genai';

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['chat', 'video', 'image'],
    },
    reply: { type: 'string' },
    videoConfig: {
      type: 'object',
      properties: {
        width: { type: 'integer' },
        height: { type: 'integer' },
        fps: { type: 'integer' },
        durationInFrames: { type: 'integer' },
      },
      required: ['width', 'height', 'fps', 'durationInFrames'],
    },
    storyboard: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sceneIndex: { type: 'integer' },
          title: { type: 'string' },
          durationInFrames: { type: 'integer' },
          onScreenText: { type: 'string' },
          motionIdea: { type: 'string' },
          stockQuery: { type: 'string' },
        },
        required: ['sceneIndex', 'title', 'durationInFrames', 'onScreenText', 'motionIdea'],
      },
    },
    imagePrompt: { type: 'string' },
    aspectRatio: {
      type: 'string',
      enum: ['1:1', '9:16', '16:9', '4:5', '3:4', '4:3'],
    },
    memoryOps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add', 'update', 'delete'] },
          id: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['op'],
      },
    },
  },
  required: ['intent', 'reply'],
};

export const CODE_SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'Complete TSX code for the Composition' },
    videoConfig: {
      type: 'object',
      properties: {
        width: { type: 'integer' },
        height: { type: 'integer' },
        fps: { type: 'integer' },
        durationInFrames: { type: 'integer' },
      },
      required: ['width', 'height', 'fps', 'durationInFrames'],
    },
  },
  required: ['code', 'videoConfig'],
};

export const FIX_SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string', description: 'Full corrected TSX code' },
    fixSummary: { type: 'string', description: 'One sentence explaining what was fixed' },
  },
  required: ['code', 'fixSummary'],
};

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    issues: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['ok', 'issues'],
};

// Converter from standard JSON schema to @google/genai Schema object
export function jsonSchemaToGeminiSchema(jsonSchema: Record<string, unknown>): Schema {
  const schemaType = jsonSchema.type as string;
  let typeEnum = Type.STRING;

  switch (schemaType) {
    case 'object':
      typeEnum = Type.OBJECT;
      break;
    case 'array':
      typeEnum = Type.ARRAY;
      break;
    case 'string':
      typeEnum = Type.STRING;
      break;
    case 'integer':
      typeEnum = Type.INTEGER;
      break;
    case 'number':
      typeEnum = Type.NUMBER;
      break;
    case 'boolean':
      typeEnum = Type.BOOLEAN;
      break;
  }

  const result: Schema = {
    type: typeEnum,
  };

  if (jsonSchema.description && typeof jsonSchema.description === 'string') {
    result.description = jsonSchema.description;
  }

  if (Array.isArray(jsonSchema.enum)) {
    result.enum = jsonSchema.enum as string[];
  }

  if (jsonSchema.properties && typeof jsonSchema.properties === 'object') {
    const props = jsonSchema.properties as Record<string, Record<string, unknown>>;
    result.properties = {};
    for (const [key, val] of Object.entries(props)) {
      result.properties[key] = jsonSchemaToGeminiSchema(val);
    }
  }

  if (jsonSchema.items && typeof jsonSchema.items === 'object') {
    result.items = jsonSchemaToGeminiSchema(jsonSchema.items as Record<string, unknown>);
  }

  if (Array.isArray(jsonSchema.required)) {
    result.required = jsonSchema.required as string[];
  }

  return result;
}
