-- RAG improvements migration
-- Adds fields for full-text search and metadata

-- Add pg_trgm extension for fuzzy search (if not already added)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add new columns to rag_document_chunks table
ALTER TABLE rag_document_chunks 
ADD COLUMN IF NOT EXISTS chunk_text_search TEXT;

ALTER TABLE rag_document_chunks 
ADD COLUMN IF NOT EXISTS point_number TEXT;

ALTER TABLE rag_document_chunks 
ADD COLUMN IF NOT EXISTS section_title TEXT;

-- Create GIN index for full-text search using Russian configuration
CREATE INDEX CONCURRENTLY IF NOT EXISTS rag_document_chunks_text_search_gin 
ON rag_document_chunks USING GIN (to_tsvector('russian', chunk_text_search));

-- Create GIN index for fuzzy trigram search
CREATE INDEX CONCURRENTLY IF NOT EXISTS rag_document_chunks_trgm_gin 
ON rag_document_chunks USING GIN (chunk_text gin_trgm_ops);

-- Create index for point number search
CREATE INDEX CONCURRENTLY IF NOT EXISTS rag_document_chunks_point_number_idx 
ON rag_document_chunks (point_number) WHERE point_number IS NOT NULL;

-- Create index for section title search
CREATE INDEX CONCURRENTLY IF NOT EXISTS rag_document_chunks_section_title_idx 
ON rag_document_chunks (section_title) WHERE section_title IS NOT NULL;

-- Update existing chunks with new fields
-- This runs once when applying the migration
DO $$
DECLARE
    chunk_record RECORD;
    v_point_number TEXT;
    v_section_title TEXT;
    v_text_search TEXT;
BEGIN
    -- Iterate through all chunks
    FOR chunk_record IN 
        SELECT id, chunk_text 
        FROM rag_document_chunks 
        WHERE chunk_text_search IS NULL
    LOOP
        -- Extract point number from text
        v_point_number := NULL;
        IF chunk_record.chunk_text ~ '^(\d{1,3})\.\s' THEN
            v_point_number := substring(chunk_record.chunk_text from '^(\d{1,3})');
        ELSIF chunk_record.chunk_text ~ '^(\d{1,3})\)\s' THEN
            v_point_number := substring(chunk_record.chunk_text from '^(\d{1,3})');
        ELSIF chunk_record.chunk_text ~ '^\((\d{1,3})\)\s' THEN
            v_point_number := substring(chunk_record.chunk_text from '^\((\d{1,3})\)');
        END IF;

        -- Extract section title
        v_section_title := NULL;
        IF chunk_record.chunk_text ~ '^[IVXLCDM]+\.\s.+$' THEN
            v_section_title := substring(chunk_record.chunk_text from '^([IVXLCDM]+\.\s.+)$');
        ELSIF chunk_record.chunk_text ~ '^[A-Z][A-Z\s]{3,}:?$' THEN
            v_section_title := trim(trailing ':' from chunk_record.chunk_text);
        END IF;

        -- Create text for full-text search
        v_text_search := lower(
            regexp_replace(
                regexp_replace(chunk_record.chunk_text, '[.,;:!?()""''\-–—]', ' ', 'g'),
                '\s+', ' ', 'g'
            )
        );

        -- Update record
        UPDATE rag_document_chunks 
        SET 
            chunk_text_search = v_text_search,
            point_number = v_point_number,
            section_title = v_section_title
        WHERE id = chunk_record.id;
    END LOOP;
END $$;