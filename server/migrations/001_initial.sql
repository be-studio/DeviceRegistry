CREATE TABLE manufacturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'manufacturer')),
  manufacturer_id uuid REFERENCES manufacturers (id),
  -- Manufacturer users belong to a manufacturer; admins do not
  CHECK ((role = 'manufacturer') = (manufacturer_id IS NOT NULL))
);

-- Only the SHA-256 of the session token is stored
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

-- Business input: a TAC is owned by exactly one manufacturer
CREATE TABLE tac_assignments (
  tac char(8) PRIMARY KEY CHECK (tac ~ '^\d{8}$'),
  manufacturer_id uuid NOT NULL REFERENCES manufacturers (id)
);

-- Public model catalogue. A row exists only after an accepted import
CREATE TABLE tac_models (
  tac char(8) PRIMARY KEY REFERENCES tac_assignments (tac),
  brand text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  imei char(15) PRIMARY KEY CHECK (imei ~ '^\d{15}$'),
  tac char(8) NOT NULL REFERENCES tac_models (tac),
  serial_number text NOT NULL,
  sku text NOT NULL,
  colour text NOT NULL,
  carton_serial text NOT NULL,
  pallet_serial text NOT NULL,
  production_date date,
  purchase_order text,
  destination_country char(2) CHECK (destination_country ~ '^[A-Z]{2}$'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  -- The first 8 digits of an IMEI are its TAC
  CHECK (left(imei, 8) = tac)
);

CREATE INDEX devices_tac_idx ON devices (tac);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
