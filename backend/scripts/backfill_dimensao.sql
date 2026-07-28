-- Backfill dimensao for existing AI-generated questions (survey with questions id 58-78)
-- Based on the thematic content of each question, grouped into logical pillars.
--
-- Dimensões:
--   • Infraestrutura & Nuvem      — questions about infrastructure, cloud providers, ERP/CRM
--   • Continuidade de Negócios     — BCP/PCN, DRP, RTO, RPO, SLA
--   • Backup & Recuperação         — backup frequency, testing, storage
--   • Alta Disponibilidade         — HA technologies, failover tests, monitoring
--   • Segurança & Governança       — access security, support contracts, risks
--   • Estratégia & Melhoria        — gaps, ongoing projects, challenges

BEGIN;

-- Infraestrutura & Nuvem
UPDATE questions SET dimensao = 'Infraestrutura & Nuvem' WHERE id = 58; -- ERP/CRM utilizado
UPDATE questions SET dimensao = 'Infraestrutura & Nuvem' WHERE id = 59; -- Infraestrutura predominante
UPDATE questions SET dimensao = 'Infraestrutura & Nuvem' WHERE id = 60; -- Provedores de nuvem
UPDATE questions SET dimensao = 'Infraestrutura & Nuvem' WHERE id = 78; -- Serviço de gestão de e-mails

-- Continuidade de Negócios
UPDATE questions SET dimensao = 'Continuidade de Negócios' WHERE id = 61; -- PCN/BCP documentado
UPDATE questions SET dimensao = 'Continuidade de Negócios' WHERE id = 62; -- DRP definido
UPDATE questions SET dimensao = 'Continuidade de Negócios' WHERE id = 63; -- RTO tolerável
UPDATE questions SET dimensao = 'Continuidade de Negócios' WHERE id = 64; -- RPO aceitável
UPDATE questions SET dimensao = 'Continuidade de Negócios' WHERE id = 69; -- SLA de disponibilidade

-- Backup & Recuperação
UPDATE questions SET dimensao = 'Backup & Recuperação' WHERE id = 65; -- Frequência de backups
UPDATE questions SET dimensao = 'Backup & Recuperação' WHERE id = 66; -- Backups testados
UPDATE questions SET dimensao = 'Backup & Recuperação' WHERE id = 67; -- Onde backups são armazenados

-- Alta Disponibilidade
UPDATE questions SET dimensao = 'Alta Disponibilidade' WHERE id = 68; -- Tecnologias de HA
UPDATE questions SET dimensao = 'Alta Disponibilidade' WHERE id = 70; -- Sistemas mais críticos
UPDATE questions SET dimensao = 'Alta Disponibilidade' WHERE id = 71; -- Testes de failover
UPDATE questions SET dimensao = 'Alta Disponibilidade' WHERE id = 73; -- Monitoramento contínuo

-- Segurança & Governança
UPDATE questions SET dimensao = 'Segurança & Governança' WHERE id = 72; -- Riscos de indisponibilidade
UPDATE questions SET dimensao = 'Segurança & Governança' WHERE id = 74; -- Segurança de acesso
UPDATE questions SET dimensao = 'Segurança & Governança' WHERE id = 75; -- Contratos de suporte com SLA

-- Estratégia & Melhoria
UPDATE questions SET dimensao = 'Estratégia & Melhoria' WHERE id = 76; -- Iniciativas em andamento
UPDATE questions SET dimensao = 'Estratégia & Melhoria' WHERE id = 77; -- Maior desafio/lacuna

COMMIT;
