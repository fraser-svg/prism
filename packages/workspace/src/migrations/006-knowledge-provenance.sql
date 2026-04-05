-- Add source_quote column to extracted_knowledge for provenance tracking
-- Stores the verbatim excerpt from the source document that supports each fact
ALTER TABLE extracted_knowledge ADD COLUMN source_quote TEXT;
