-- The food catalogue the Food tab shows. It used to be a JSON snapshot bundled with the
-- app, so administrators could not touch it. Here it becomes data: an admin can edit a
-- dish, hide it or delete it, and the app reads the catalogue from the API and keeps the
-- bundled snapshot only as the offline fallback.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
CREATE TABLE food_stores (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 60),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  area text NOT NULL DEFAULT '' CHECK (char_length(area) <= 120),
  specialty text NOT NULL DEFAULT '' CHECK (char_length(specialty) <= 200),
  source_url text NOT NULL DEFAULT '' CHECK (char_length(source_url) <= 500),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE food_items (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 80),
  store_id text NOT NULL REFERENCES food_stores ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  category text NOT NULL DEFAULT '' CHECK (char_length(category) <= 60),
  image_url text CHECK (char_length(image_url) <= 800),
  source_url text NOT NULL DEFAULT '' CHECK (char_length(source_url) <= 800),
  price_label text CHECK (char_length(price_label) <= 40),
  calories integer CHECK (calories BETWEEN 0 AND 10000),
  protein_grams integer CHECK (protein_grams BETWEEN 0 AND 1000),
  nutrition_basis text CHECK (char_length(nutrition_basis) <= 120),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX food_items_store_idx ON food_items (store_id);
