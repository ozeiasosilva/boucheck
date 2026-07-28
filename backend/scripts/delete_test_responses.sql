-- =============================================================================
-- Script para apagar respostas de teste em produção
-- =============================================================================
-- INSTRUÇÕES:
-- 1. Liste as respostas que quer apagar (query abaixo para ajudar a identificar)
-- 2. Substitua os IDs no array da variável abaixo
-- 3. Execute em uma transação para poder dar ROLLBACK se algo der errado
-- =============================================================================

-- ─── PASSO 0: Identificar respostas de teste ────────────────────────────────
-- Descomente e ajuste para listar suas respostas de teste:
--
-- SELECT id, nome, empresa, email, status, created_at
-- FROM responses
-- WHERE email LIKE '%ozeias%'          -- ou qualquer critério que identifique testes
--    OR nome ILIKE '%teste%'
-- ORDER BY created_at DESC;

-- ─── PASSO 1: Apagar dados dependentes e a resposta ─────────────────────────
-- Substitua os UUIDs abaixo pelos IDs das respostas que quer remover.

BEGIN;

-- IDs das respostas a serem removidas (EDITE AQUI):
DO $$
DECLARE
  response_ids uuid[] := ARRAY[
    '3418fff5-3891-42f6-9f80-bd2b077d2e25'::uuid
    -- Adicione mais IDs separados por vírgula:
    -- ,'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid
  ];
  rid uuid;
BEGIN
  FOREACH rid IN ARRAY response_ids LOOP
    -- Tabelas filhas (sem ON DELETE CASCADE)
    DELETE FROM response_answers    WHERE response_id = rid;
    DELETE FROM response_checklist  WHERE response_id = rid;
    DELETE FROM response_events     WHERE response_id = rid;
    DELETE FROM reports             WHERE response_id = rid;

    -- Tabelas filhas (com ON DELETE CASCADE — deletam automaticamente, 
    -- mas removemos explicitamente por clareza)
    DELETE FROM interaction_histories WHERE response_id = rid;
    DELETE FROM client_insights       WHERE response_id = rid;

    -- Finalmente, a resposta em si
    DELETE FROM responses WHERE id = rid;

    RAISE NOTICE 'Deleted response: %', rid;
  END LOOP;
END $$;

-- Verifique se está tudo certo antes de confirmar:
-- SELECT count(*) FROM responses WHERE id IN ('5917db36-aa55-415f-ba9b-35dde77829a9');

COMMIT;
-- Se algo deu errado, use ROLLBACK; ao invés de COMMIT;
