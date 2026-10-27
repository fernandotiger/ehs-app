-- Immutable audit trail
-- Acknowledgements and audit log entries are append-only. Any UPDATE or DELETE
-- is rejected by the database itself, regardless of which application or user
-- issues the statement.

CREATE OR REPLACE FUNCTION prevent_mutation_of_immutable_rows()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table "%" is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_acknowledgements_immutable ON "document_acknowledgements";
CREATE TRIGGER document_acknowledgements_immutable
  BEFORE UPDATE OR DELETE ON "document_acknowledgements"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation_of_immutable_rows();

DROP TRIGGER IF EXISTS audit_logs_immutable ON "audit_logs";
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation_of_immutable_rows();

-- TRUNCATE bypasses row triggers, so block it with a statement-level trigger.
DROP TRIGGER IF EXISTS document_acknowledgements_no_truncate ON "document_acknowledgements";
CREATE TRIGGER document_acknowledgements_no_truncate
  BEFORE TRUNCATE ON "document_acknowledgements"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_mutation_of_immutable_rows();

DROP TRIGGER IF EXISTS audit_logs_no_truncate ON "audit_logs";
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_mutation_of_immutable_rows();
