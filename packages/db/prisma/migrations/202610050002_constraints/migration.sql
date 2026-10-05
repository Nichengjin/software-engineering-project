ALTER TABLE "Account" ADD CONSTRAINT "Account_role_person_check" CHECK (
  (role = 'STUDENT' AND "studentId" IS NOT NULL AND "professorId" IS NULL) OR
  (role = 'PROFESSOR' AND "professorId" IS NOT NULL AND "studentId" IS NULL) OR
  (role = 'REGISTRAR' AND "studentId" IS NULL AND "professorId" IS NULL)
);
ALTER TABLE "PersonIdentity" ADD CONSTRAINT "PersonIdentity_exactly_one_person" CHECK (
  ("studentId" IS NOT NULL)::int + ("professorId" IS NOT NULL)::int = 1
);
ALTER TABLE "Student" ADD CONSTRAINT "Student_version_positive" CHECK (version > 0);
ALTER TABLE "Professor" ADD CONSTRAINT "Professor_version_positive" CHECK (version > 0);
ALTER TABLE "Term" ADD CONSTRAINT "Term_version_positive" CHECK (version > 0);
ALTER TABLE "Term" ADD CONSTRAINT "Term_time_order" CHECK (
  "startsAt" < "endsAt" AND "teachingStartsAt" <= "initialStartsAt" AND
  "initialStartsAt" < "initialEndsAt" AND "initialEndsAt" <= "addDropStartsAt" AND
  "addDropStartsAt" < "addDropEndsAt"
);
ALTER TABLE "Term" ADD CONSTRAINT "Term_price_nonnegative" CHECK ("pricePerCreditYuan" >= 0);
ALTER TABLE "TeachingVersion" ADD CONSTRAINT "TeachingVersion_nonnegative" CHECK (version >= 0);
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_version_nonnegative" CHECK (version >= 0);
ALTER TABLE "CourseMirror" ADD CONSTRAINT "CourseMirror_credits_nonnegative" CHECK (credits >= 0);
ALTER TABLE "BillingOutbox" ADD CONSTRAINT "BillingOutbox_numbers_valid" CHECK (version > 0 AND attempts >= 0 AND "amountYuan" >= 0);
ALTER TABLE "TeachingHistory" ADD CONSTRAINT "TeachingHistory_time_order" CHECK ("endedAt" IS NULL OR "endedAt" >= "createdAt");

CREATE UNIQUE INDEX "Term_one_launch" ON "Term" ("isLaunchTerm") WHERE "isLaunchTerm";
CREATE UNIQUE INDEX "Registration_one_effective" ON "Registration" ("studentId", "offeringId") WHERE state IN ('ENROLLED', 'COMMITTED');
CREATE UNIQUE INDEX "TeachingHistory_one_active" ON "TeachingHistory" ("offeringId") WHERE "endedAt" IS NULL;
-- PG15 NULLS NOT DISTINCT prevents repeated prerequisite/deletion notices (no related offering).
CREATE UNIQUE INDEX "CatalogNotice_problem_key" ON "CatalogNotice" ("studentId", "termId", "offeringId", "relatedOfferingId", kind) NULLS NOT DISTINCT;

CREATE FUNCTION valid_choices(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE total integer; distinct_total integer;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object' OR
     jsonb_typeof(value->'primaryOfferingIds') IS DISTINCT FROM 'array' OR
     jsonb_typeof(value->'alternateOfferingIds') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(value)) <> 2 OR
     jsonb_array_length(value->'primaryOfferingIds') > 4 OR
     jsonb_array_length(value->'alternateOfferingIds') > 2 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements((value->'primaryOfferingIds') || (value->'alternateOfferingIds')) AS e
             WHERE jsonb_typeof(e) <> 'string' OR e #>> '{}' = '') THEN RETURN false; END IF;
  SELECT count(*), count(DISTINCT e) INTO total, distinct_total
    FROM jsonb_array_elements((value->'primaryOfferingIds') || (value->'alternateOfferingIds')) AS e;
  RETURN total = distinct_total;
END;
$$;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_choices_valid" CHECK (
  valid_choices("savedChoices") AND ("submittedChoices" IS NULL OR valid_choices("submittedChoices"))
);
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_tombstone_empty" CHECK (
  "exists" OR ("savedChoices" = '{"primaryOfferingIds":[],"alternateOfferingIds":[]}'::jsonb AND
    "submittedChoices" IS NULL AND "firstSubmittedAt" IS NULL)
);

-- Deferred checks allow person + identity creation/update in either order in ONE transaction.
-- A person cannot be committed without claiming the global SSN key, even via direct SQL.
CREATE FUNCTION check_person_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Student' THEN
    IF EXISTS (SELECT 1 FROM "Student" s WHERE s.id = NEW.id AND NOT EXISTS
      (SELECT 1 FROM "PersonIdentity" i WHERE i."studentId" = s.id AND i.ssn = s.ssn)) THEN
      RAISE EXCEPTION 'person identity consistency violation' USING ERRCODE = '23514', CONSTRAINT = 'person_identity_consistency';
    END IF;
  ELSIF TG_TABLE_NAME = 'Professor' THEN
    IF EXISTS (SELECT 1 FROM "Professor" p WHERE p.id = NEW.id AND NOT EXISTS
      (SELECT 1 FROM "PersonIdentity" i WHERE i."professorId" = p.id AND i.ssn = p.ssn)) THEN
      RAISE EXCEPTION 'person identity consistency violation' USING ERRCODE = '23514', CONSTRAINT = 'person_identity_consistency';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM "Student" s WHERE s.id IN (OLD."studentId", NEW."studentId") AND NOT EXISTS
      (SELECT 1 FROM "PersonIdentity" i WHERE i."studentId" = s.id AND i.ssn = s.ssn)) OR
       EXISTS (SELECT 1 FROM "Professor" p WHERE p.id IN (OLD."professorId", NEW."professorId") AND NOT EXISTS
      (SELECT 1 FROM "PersonIdentity" i WHERE i."professorId" = p.id AND i.ssn = p.ssn)) THEN
      RAISE EXCEPTION 'person identity consistency violation' USING ERRCODE = '23514', CONSTRAINT = 'person_identity_consistency';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Student_identity_required" AFTER INSERT OR UPDATE ON "Student" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_person_identity();
CREATE CONSTRAINT TRIGGER "Professor_identity_required" AFTER INSERT OR UPDATE ON "Professor" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_person_identity();
CREATE CONSTRAINT TRIGGER "Identity_matches_person" AFTER INSERT OR UPDATE OR DELETE ON "PersonIdentity" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_person_identity();

CREATE FUNCTION immutable_account_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account IS DISTINCT FROM OLD.account THEN
    RAISE EXCEPTION 'account number is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Account_immutable_number" BEFORE UPDATE ON "Account" FOR EACH ROW EXECUTE FUNCTION immutable_account_number();

CREATE FUNCTION immutable_billing_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."studentId", NEW."termId", NEW.version, NEW."businessId", NEW.payload, NEW."amountYuan") IS DISTINCT FROM
     ROW(OLD."studentId", OLD."termId", OLD.version, OLD."businessId", OLD.payload, OLD."amountYuan") THEN
    RAISE EXCEPTION 'billing payload is immutable; create a new version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "BillingOutbox_immutable_payload" BEFORE UPDATE ON "BillingOutbox" FOR EACH ROW EXECUTE FUNCTION immutable_billing_payload();
