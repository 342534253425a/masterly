-- Database-per-service: у каждого сервиса своя БД и своя роль с минимальными правами.
-- В проде — отдельные кластеры Yandex Managed PostgreSQL (см. infra/terraform/postgres.tf).

DO $$
DECLARE
  svc text;
BEGIN
  FOREACH svc IN ARRAY ARRAY['identity', 'catalog', 'leads', 'reviews', 'messaging', 'notifications', 'media', 'trust']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = svc) THEN
      EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', svc, svc);
    END IF;
  END LOOP;
END $$;

CREATE DATABASE identity OWNER identity;
CREATE DATABASE catalog OWNER catalog;
CREATE DATABASE leads OWNER leads;
CREATE DATABASE reviews OWNER reviews;
CREATE DATABASE messaging OWNER messaging;
CREATE DATABASE notifications OWNER notifications;
CREATE DATABASE media OWNER media;
CREATE DATABASE trust OWNER trust;

-- Расширения ставятся суперпользователем, миграции сервисов их только используют
\c catalog
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

\c leads
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

\c reviews
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

\c trust
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS postgis;

\c identity
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
