DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imea_migrator') THEN CREATE ROLE imea_migrator LOGIN PASSWORD 'imea_migrator'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imea_api') THEN CREATE ROLE imea_api LOGIN PASSWORD 'imea_api'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imea_worker') THEN CREATE ROLE imea_worker LOGIN PASSWORD 'imea_worker'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'imea_projector') THEN CREATE ROLE imea_projector LOGIN PASSWORD 'imea_projector'; END IF;
END $$;

GRANT imea_owner TO imea_migrator;
GRANT CONNECT ON DATABASE imea TO imea_migrator, imea_api, imea_worker, imea_projector;
GRANT USAGE, CREATE ON SCHEMA public TO imea_migrator;
