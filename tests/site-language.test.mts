import test from "node:test";
import assert from "node:assert/strict";
import { parseSiteLanguageQuery, resolveSiteLanguage } from "../app/lib/site-language.mts";

test("resolveSiteLanguage: a saved choice wins over the browser language", () => {
    assert.equal(resolveSiteLanguage("en", ["ja-JP"]), "en");
    assert.equal(resolveSiteLanguage("ja", ["en-US"]), "ja");
});

test("resolveSiteLanguage: without a saved choice, only Japanese browsers start in Japanese", () => {
    assert.equal(resolveSiteLanguage(null, ["ja-JP", "en-US"]), "ja");
    assert.equal(resolveSiteLanguage(null, ["ja"]), "ja");
    assert.equal(resolveSiteLanguage(null, ["en-US", "ja-JP"]), "en");
    assert.equal(resolveSiteLanguage(null, ["zh-TW"]), "en");
    assert.equal(resolveSiteLanguage("EN", ["fr-FR"]), "en", "an unknown saved value falls back to the browser language");
});

test("resolveSiteLanguage: an unknown browser language keeps the Japanese of the HTML", () => {
    assert.equal(resolveSiteLanguage(null, []), "ja");
    assert.equal(resolveSiteLanguage(null, [""]), "ja");
});

test("parseSiteLanguageQuery: only Japanese and English in ?lang are used", () => {
    assert.equal(parseSiteLanguageQuery("?lang=en"), "en");
    assert.equal(parseSiteLanguageQuery("?q=1&lang=ja"), "ja");
    assert.equal(parseSiteLanguageQuery("?lang=fr"), null);
    assert.equal(parseSiteLanguageQuery(""), null);
});
