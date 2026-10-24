import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ROOT_ASSET_FILES } from "../scripts/lib/site-assets.mts";

const ENGLISH_PAGE = new URL("../public/en/index.html", import.meta.url);
const SITE_URL = "https://an-oa.github.io/knksongs/";

/**
 * meta 要素の content を、property または name で読む。
 */
function readMeta(html: string, key: string): string | undefined {
    const pattern = new RegExp(`<meta (?:property|name)="${key.replace(/[.:]/g, "\\$&")}" content="([^"]*)"`);
    return pattern.exec(html)?.[1];
}

test("English OGP page: shares English text and the English image", async () => {
    const html = await readFile(ENGLISH_PAGE, "utf8");

    assert.match(html, /<html lang="en">/);
    assert.equal(readMeta(html, "og:title"), "Kaneki Caw Song Search");
    assert.equal(readMeta(html, "og:site_name"), "Kaneki Caw Song Search");
    assert.equal(readMeta(html, "og:url"), `${SITE_URL}en/`);
    assert.equal(readMeta(html, "og:locale"), "en_US");
    assert.equal(readMeta(html, "og:image"), `${SITE_URL}ogp-en.png`);
    assert.equal(readMeta(html, "twitter:image"), `${SITE_URL}ogp-en.png`);
    assert.equal(readMeta(html, "twitter:card"), "summary_large_image");
    for (const key of ["og:description", "twitter:description", "og:image:alt"]) {
        const value = readMeta(html, key);
        assert.ok(value && !/[ぁ-んァ-ヶ一-龥]/.test(value), `${key} is written in English`);
    }
    assert.equal(readMeta(html, "robots"), "noindex", "the redirect page stays out of search results");
});

test("English OGP page: sends visitors to the site in English with a CSP-allowed script", async () => {
    const html = await readFile(ENGLISH_PAGE, "utf8");
    const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    assert.ok(policy);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    const [, source] = scripts[0];
    const hash = createHash("sha256").update(source).digest("base64");
    assert.ok(policy.includes(`'sha256-${hash}'`), "update the CSP hash when changing the redirect script");
    assert.ok(!policy.includes("'unsafe-inline'"));
    assert.match(source, /location\.replace\("\.\.\/\?lang=en"\)/);
    assert.match(html, /<a href="\.\.\/\?lang=en">/, "visitors without JavaScript can follow a link");
});

test("English OGP page: the page and its image are published with the site", () => {
    assert.ok(ROOT_ASSET_FILES.includes("en/index.html"));
    assert.ok(ROOT_ASSET_FILES.includes("ogp-en.png"));
});
