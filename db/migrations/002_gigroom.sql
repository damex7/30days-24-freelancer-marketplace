-- 002: the marketplace. Profiles, jobs, proposals, contracts, messaging, reviews.
--
-- ON DELETE policy (one rule for the whole schema):
-- Real users are never deleted; an admin suspends them instead. The only rows
-- that are ever deleted are demo users older than 24 hours. So every foreign key
-- that points at users CASCADEs, which lets one "DELETE FROM users WHERE is_demo"
-- clean up a demo visitor's whole world (jobs, proposals, chats, reviews) in a
-- single statement. There is no "delete user" button anywhere in the app.

-- ── Skills ───────────────────────────────────────────────────────────────────
-- A table, not a text[] column, so a typo can't create a new skill, the filter
-- list comes from one place, and "jobs needing React" is an indexed join.
CREATE TABLE skills (
  id    serial PRIMARY KEY,
  slug  text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name  text NOT NULL UNIQUE
);

-- ── Freelancer profiles ──────────────────────────────────────────────────────
-- One row per freelancer, keyed by the user id (a 1-to-1 relationship).
CREATE TABLE freelancer_profiles (
  user_id           uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  headline          text NOT NULL CHECK (length(headline) BETWEEN 10 AND 100),
  bio               text NOT NULL CHECK (length(bio) BETWEEN 50 AND 2000),
  -- Money is always integer kobo in a bigint. ₦15,000/hr = 1500000.
  hourly_rate_kobo  bigint NOT NULL CHECK (hourly_rate_kobo BETWEEN 50000 AND 10000000000),
  state             text NOT NULL,
  city              text NOT NULL,
  years_experience  integer NOT NULL CHECK (years_experience BETWEEN 0 AND 50),
  availability      text NOT NULL DEFAULT 'available'
                    CHECK (availability IN ('available', 'busy', 'away')),
  -- A generated column: Postgres keeps it in sync on every write, so search can
  -- never be out of date. Weight A (headline) ranks above weight B (bio).
  search            tsvector GENERATED ALWAYS AS (
                      setweight(to_tsvector('english', headline), 'A') ||
                      setweight(to_tsvector('english', bio), 'B')
                    ) STORED,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX freelancer_profiles_search_idx ON freelancer_profiles USING gin (search);
-- Keyset pagination for the two sorts on /freelancers.
CREATE INDEX freelancer_profiles_newest_idx ON freelancer_profiles (created_at DESC, user_id DESC);
CREATE INDEX freelancer_profiles_rate_idx   ON freelancer_profiles (hourly_rate_kobo, user_id);
CREATE TRIGGER freelancer_profiles_touch BEFORE UPDATE ON freelancer_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE freelancer_skills (
  freelancer_id  uuid    NOT NULL REFERENCES freelancer_profiles (user_id) ON DELETE CASCADE,
  skill_id       integer NOT NULL REFERENCES skills (id) ON DELETE RESTRICT,
  PRIMARY KEY (freelancer_id, skill_id)
);
-- "Freelancers who know X" starts from the skill, so index that direction too.
CREATE INDEX freelancer_skills_skill_idx ON freelancer_skills (skill_id, freelancer_id);

CREATE TABLE portfolio_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id  uuid NOT NULL REFERENCES freelancer_profiles (user_id) ON DELETE CASCADE,
  title          text NOT NULL CHECK (length(title) BETWEEN 3 AND 80),
  url            text NOT NULL CHECK (url ~ '^https://'),
  description    text NOT NULL DEFAULT '' CHECK (length(description) <= 300),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_items_freelancer_idx ON portfolio_items (freelancer_id, created_at);

-- ── Jobs ─────────────────────────────────────────────────────────────────────
CREATE TABLE jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title             text NOT NULL CHECK (length(title) BETWEEN 10 AND 120),
  description       text NOT NULL CHECK (length(description) BETWEEN 50 AND 5000),
  category          text NOT NULL CHECK (category IN (
                      'web-dev', 'mobile-dev', 'design', 'writing',
                      'marketing', 'video', 'data', 'admin-support')),
  budget_type       text NOT NULL CHECK (budget_type IN ('fixed', 'hourly')),
  budget_min_kobo   bigint NOT NULL CHECK (budget_min_kobo > 0),
  budget_max_kobo   bigint NOT NULL,
  experience_level  text NOT NULL CHECK (experience_level IN ('entry', 'intermediate', 'expert')),
  location_type     text NOT NULL CHECK (location_type IN ('remote', 'hybrid', 'onsite')),
  state             text,
  deadline          date,
  -- open → in_progress (a proposal was accepted) → closed. Or open → closed.
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'closed')),
  search            tsvector GENERATED ALWAYS AS (
                      setweight(to_tsvector('english', title), 'A') ||
                      setweight(to_tsvector('english', description), 'B')
                    ) STORED,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (budget_max_kobo >= budget_min_kobo),
  -- Hybrid and on-site jobs must say where; remote jobs may leave it empty.
  CHECK (location_type = 'remote' OR state IS NOT NULL),
  -- Target for composite foreign keys below: "this job, owned by this client".
  UNIQUE (id, client_id)
);
CREATE INDEX jobs_search_idx ON jobs USING gin (search);
-- Partial indexes: the public board only ever shows open jobs.
CREATE INDEX jobs_open_newest_idx ON jobs (created_at DESC, id DESC) WHERE status = 'open';
CREATE INDEX jobs_open_budget_idx ON jobs (budget_max_kobo DESC, id DESC) WHERE status = 'open';
CREATE INDEX jobs_client_idx ON jobs (client_id, created_at DESC);
CREATE TRIGGER jobs_touch BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE job_skills (
  job_id    uuid    NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  skill_id  integer NOT NULL REFERENCES skills (id) ON DELETE RESTRICT,
  PRIMARY KEY (job_id, skill_id)
);
CREATE INDEX job_skills_skill_idx ON job_skills (skill_id, job_id);

-- ── Proposals ────────────────────────────────────────────────────────────────
CREATE TABLE proposals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  freelancer_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  cover_letter   text NOT NULL CHECK (length(cover_letter) BETWEEN 50 AND 3000),
  bid_kobo       bigint NOT NULL CHECK (bid_kobo > 0),
  duration_days  integer NOT NULL CHECK (duration_days BETWEEN 1 AND 365),
  status         text NOT NULL DEFAULT 'submitted' CHECK (status IN (
                   'submitted', 'shortlisted', 'declined', 'withdrawn', 'accepted')),
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- One proposal per freelancer per job. A double-click can't create two:
  -- the second INSERT fails on this constraint.
  UNIQUE (job_id, freelancer_id),
  -- Target for the contract's composite foreign key.
  UNIQUE (id, job_id, freelancer_id)
);
CREATE INDEX proposals_freelancer_idx ON proposals (freelancer_id, created_at DESC);
CREATE INDEX proposals_job_status_idx ON proposals (job_id, status);
-- At most ONE accepted proposal per job, enforced by the database itself.
CREATE UNIQUE INDEX proposals_one_accepted_per_job ON proposals (job_id) WHERE status = 'accepted';
CREATE TRIGGER proposals_touch BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── Contracts ────────────────────────────────────────────────────────────────
-- Created when a client accepts a proposal. The composite foreign keys make it
-- impossible to store a contract whose client doesn't own the job, or whose
-- freelancer isn't the one who wrote the proposal, even with a hand-written INSERT.
CREATE TABLE contracts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL UNIQUE,  -- one contract per job
  proposal_id    uuid NOT NULL UNIQUE,
  client_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  freelancer_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Copied from the bid at the moment of acceptance, so later edits can't change it.
  amount_kobo    bigint NOT NULL CHECK (amount_kobo > 0),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  FOREIGN KEY (job_id, client_id) REFERENCES jobs (id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (proposal_id, job_id, freelancer_id)
    REFERENCES proposals (id, job_id, freelancer_id) ON DELETE CASCADE,
  CHECK ((status = 'active') = (ended_at IS NULL))
);
CREATE INDEX contracts_client_idx ON contracts (client_id, started_at DESC);
CREATE INDEX contracts_freelancer_idx ON contracts (freelancer_id, started_at DESC);

-- ── Reviews ──────────────────────────────────────────────────────────────────
-- Both sides can review each other once, after a contract is completed.
CREATE TABLE reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
  reviewer_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reviewee_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      text NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, reviewer_id),
  CHECK (reviewer_id <> reviewee_id)
);
-- A profile's average and count are an aggregate over this index.
CREATE INDEX reviews_reviewee_idx ON reviews (reviewee_id, created_at DESC);

-- ── Messaging ────────────────────────────────────────────────────────────────
-- One conversation per (job, freelancer). Only a client can open one, and only
-- with a freelancer who has sent a proposal for that job. The two composite
-- foreign keys turn that rule into something the database guarantees.
CREATE TABLE conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL,
  client_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  freelancer_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, freelancer_id),
  FOREIGN KEY (job_id, client_id) REFERENCES jobs (id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id, freelancer_id) REFERENCES proposals (job_id, freelancer_id) ON DELETE CASCADE
);

-- Who may read and post in a conversation, and how far each person has read.
CREATE TABLE conversation_participants (
  conversation_id       uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- A read pointer instead of a "read" flag on every message: marking a whole
  -- thread as read is one UPDATE, and unread = messages with a bigger id.
  last_read_message_id  bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
-- The inbox starts from "my conversations".
CREATE INDEX conversation_participants_user_idx ON conversation_participants (user_id, conversation_id);

CREATE TABLE messages (
  -- bigserial, not uuid: ids only ever go up, so "messages after id 1042" is how
  -- polling asks for new ones, and the read pointer above is a single number.
  id               bigserial PRIMARY KEY,
  conversation_id  uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  -- Null for system messages ("Contract started").
  sender_id        uuid,
  kind             text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'system')),
  body             text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  -- Generated in the browser for each message. If a slow network makes the
  -- browser send the same message twice, the second INSERT is ignored.
  client_nonce     uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- The sender must be a participant of THIS conversation. With MATCH SIMPLE
  -- (the default) a null sender_id skips the check, which is what system
  -- messages need.
  FOREIGN KEY (conversation_id, sender_id)
    REFERENCES conversation_participants (conversation_id, user_id) ON DELETE CASCADE,
  CHECK ((kind = 'system') = (sender_id IS NULL)),
  UNIQUE (sender_id, client_nonce)
);
-- Every thread read and every poll is "this conversation, ids above N".
CREATE INDEX messages_conversation_idx ON messages (conversation_id, id);

-- ── Admin audit log ──────────────────────────────────────────────────────────
CREATE TABLE audit_events (
  id           bigserial PRIMARY KEY,
  actor_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    text NOT NULL,
  details      jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
