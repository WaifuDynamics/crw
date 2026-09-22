-- Real menus do not fit the first guess: one price label lists three variants in 52
-- characters, and protein is quoted with a half gram. The columns follow the data.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
ALTER TABLE food_items DROP CONSTRAINT IF EXISTS food_items_price_label_check;
ALTER TABLE food_items ADD CONSTRAINT food_items_price_label_check CHECK (char_length(price_label) <= 200);
ALTER TABLE food_items ALTER COLUMN protein_grams TYPE numeric(6,1);
ALTER TABLE food_items DROP CONSTRAINT IF EXISTS food_items_protein_grams_check;
ALTER TABLE food_items ADD CONSTRAINT food_items_protein_grams_check CHECK (protein_grams BETWEEN 0 AND 1000);
