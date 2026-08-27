-- Every renderer under src/components/renderers/ paints `fields.body`, but the original seed
-- shipped the base types without that field: Página had an empty field_schema, and Post and
-- Portfolio only declared their secondary fields. The backoffice therefore offered nothing to
-- edit beyond title/slug/SEO, and the rendered pages came out blank.
--
-- Appends a richtext "body" field to any system content type that is missing it. Existing
-- fields keep their order and their stored values, and the guard makes this safe to re-run.

UPDATE content_types
SET field_schema = json_insert(
      CASE
        WHEN field_schema IS NULL OR trim(field_schema) = '' THEN '[]'
        ELSE field_schema
      END,
      '$[#]',
      json('{"key":"body","label":"Contenido","type":"richtext"}')
    )
WHERE is_system = 1
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(
      CASE
        WHEN content_types.field_schema IS NULL OR trim(content_types.field_schema) = '' THEN '[]'
        ELSE content_types.field_schema
      END
    )
    WHERE json_extract(value, '$.key') = 'body'
  );
