import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and } from "drizzle-orm";
import { contentTypes } from "@db/schema";
import { generateId } from "@lib/id";
import type { FieldDefinition } from "@db/schema";

const FieldSchema: z.ZodType<FieldDefinition> = z.lazy(() =>
  z.object({
    key: z.string().min(1).regex(/^[a-z_][a-z0-9_]*$/, "Only lowercase letters, numbers and underscores"),
    label: z.string().min(1),
    type: z.enum(["text", "textarea", "richtext", "image", "gallery", "date", "number", "select", "relation", "repeater"]),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    relatedContentType: z.string().optional(),
    subfields: z.array(FieldSchema).optional(),
  })
);

export const contentTypeActions = {
  list: defineAction({
    handler: async (_input, context) => {
      const siteId = context.locals.siteId;
      if (!context.locals.user) throw new Error("Unauthorized");
      return context.locals.db.query.contentTypes.findMany({
        where: eq(contentTypes.siteId, siteId),
        orderBy: (ct, { asc }) => [asc(ct.label)],
      });
    },
  }),

  create: defineAction({
    input: z.object({
      key: z.string().min(1).regex(/^[a-z_][a-z0-9_]*$/),
      label: z.string().min(1),
      icon: z.string().optional(),
      hasArchive: z.boolean().default(false),
      supportsChildren: z.boolean().default(false),
      translatable: z.boolean().default(true),
      fieldSchema: z.array(FieldSchema).default([]),
    }),
    handler: async (input, context) => {
      const siteId = context.locals.siteId;
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const existing = await db.query.contentTypes.findFirst({
        where: and(
          eq(contentTypes.siteId, siteId),
          eq(contentTypes.key, input.key)
        ),
      });
      if (existing) throw new Error(`Content type key "${input.key}" already exists`);

      const id = generateId("ct");
      await db.insert(contentTypes).values({
        id,
        siteId,
        key: input.key,
        label: input.label,
        icon: input.icon,
        hasArchive: input.hasArchive,
        supportsChildren: input.supportsChildren,
        translatable: input.translatable,
        isSystem: false,
        fieldSchema: input.fieldSchema,
      });

      return { id };
    },
  }),

  update: defineAction({
    input: z.object({
      id: z.string(),
      label: z.string().min(1).optional(),
      icon: z.string().optional(),
      hasArchive: z.boolean().optional(),
      supportsChildren: z.boolean().optional(),
      translatable: z.boolean().optional(),
      fieldSchema: z.array(FieldSchema).optional(),
    }),
    handler: async (input, context) => {
      const siteId = context.locals.siteId;
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const ct = await db.query.contentTypes.findFirst({
        where: and(eq(contentTypes.id, input.id), eq(contentTypes.siteId, siteId)),
      });
      if (!ct) throw new Error("Content type not found");

      const updates: Record<string, unknown> = {};
      if (input.label !== undefined) updates.label = input.label;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.hasArchive !== undefined) updates.hasArchive = input.hasArchive;
      if (input.supportsChildren !== undefined) updates.supportsChildren = input.supportsChildren;
      if (input.translatable !== undefined) updates.translatable = input.translatable;
      if (input.fieldSchema !== undefined) updates.fieldSchema = input.fieldSchema;

      await db.update(contentTypes).set(updates).where(eq(contentTypes.id, input.id));
      return { id: input.id };
    },
  }),

  delete: defineAction({
    input: z.object({ id: z.string() }),
    handler: async (input, context) => {
      const siteId = context.locals.siteId;
      if (!context.locals.user) throw new Error("Unauthorized");
      const db = context.locals.db;

      const ct = await db.query.contentTypes.findFirst({
        where: and(eq(contentTypes.id, input.id), eq(contentTypes.siteId, siteId)),
      });
      if (!ct) throw new Error("Content type not found");
      if (ct.isSystem) throw new Error("System content types cannot be deleted");

      await db.delete(contentTypes).where(eq(contentTypes.id, input.id));
      return { id: input.id };
    },
  }),
};
