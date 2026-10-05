-- Allocation must not depend on row counts. Exhaustion is explicit, not lpad truncation.
CREATE SEQUENCE student_number_seq MINVALUE 1 MAXVALUE 999999;
CREATE SEQUENCE professor_number_seq MINVALUE 1 MAXVALUE 999999;
