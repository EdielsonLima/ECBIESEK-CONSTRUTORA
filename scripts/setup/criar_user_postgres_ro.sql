-- Cria user Postgres somente-leitura para o agente BI
-- Rodar 1x via `railway connect postgres` no projeto do dashboard BI

CREATE USER bi_agente_ro WITH PASSWORD :'senha';
GRANT CONNECT ON DATABASE railway TO bi_agente_ro;
GRANT USAGE ON SCHEMA public TO bi_agente_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bi_agente_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO bi_agente_ro;

-- Verificar
\du bi_agente_ro
SELECT COUNT(*) FROM information_schema.table_privileges
WHERE grantee = 'bi_agente_ro' AND privilege_type = 'SELECT';
