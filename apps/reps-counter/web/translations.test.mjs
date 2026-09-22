import test from "node:test";
import assert from "node:assert/strict";
import { TRANSLATIONS, t, SUPPORTED_LANGUAGES } from "./translations.js";

test("translations contain en and pl with matching top-level keys", () => {
  assert.ok(TRANSLATIONS.en, "English translations should exist");
  assert.ok(TRANSLATIONS.pl, "Polish translations should exist");

  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  const plKeys = Object.keys(TRANSLATIONS.pl).sort();
  assert.deepEqual(plKeys, enKeys, "Polish should define the same top-level sections as English");
});

test("t() retrieves simple and nested keys in both languages", () => {
  assert.equal(t("exercises.pushup", {}, "en"), "Push-ups");
  assert.equal(t("exercises.pushup", {}, "pl"), "Pompki");
  assert.equal(t("exercises.squat", {}, "en"), "Squats");
  assert.equal(t("exercises.squat", {}, "pl"), "Przysiady");
});

test("t() interpolates parameters", () => {
  assert.equal(
    t("queue.findingOpponent", { exercise: "Pompki" }, "pl"),
    "Pompki: szukanie rywala…"
  );
  assert.equal(
    t("race.targetMsg", { mode: "1v1", exercise: "pompki", target: 20 }, "pl"),
    "1v1 · pompki · pierwszy do 20"
  );
});

test("t() falls back to English when a key is missing in another language", () => {
  // Test with custom key or non-existent in language
  assert.equal(t("modes.soloTitle", {}, "unknownLang"), "Solo");
});
