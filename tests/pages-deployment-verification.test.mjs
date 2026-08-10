import test from "node:test";
import assert from "node:assert/strict";
import {
    createVerificationUrl,
    hasExpectedDeploySha,
    verifyPagesDeployment
} from "../scripts/verify-pages-deployment.mjs";

const EXPECTED_SHA = "c2abca650af9fca8ff7a2ab28627ea3c3620d9b9";

test("pages deployment verification: recognizes matching cache busters", () => {
    const html = [
        `<link rel="stylesheet" href="styles.css?v=${EXPECTED_SHA}">`,
        `<script type="module" src="app/bootstrap.mjs?v=${EXPECTED_SHA}"></script>`
    ].join("\n");

    assert.equal(hasExpectedDeploySha(html, EXPECTED_SHA), true);
    assert.equal(hasExpectedDeploySha(html, "1111111111111111111111111111111111111111"), false);
});

test("pages deployment verification: creates a cache-bypassing URL under the Pages path", () => {
    const url = createVerificationUrl(
        "https://example.test/knksongs/",
        "run-123",
        2
    );

    assert.equal(url.href, "https://example.test/knksongs/index.html?deployment-check=run-123-2");
});

test("pages deployment verification: retries until the expected SHA is served", async () => {
    const fetchedUrls = [];
    const waitDelays = [];
    let fetchCount = 0;

    const verifiedUrl = await verifyPagesDeployment({
        pageUrl: "https://example.test/knksongs/",
        expectedSha: EXPECTED_SHA,
        verificationToken: "run-456",
        attempts: 3,
        delayMs: 25,
        fetchImpl: async (url) => {
            fetchedUrls.push(url.href);
            fetchCount++;
            const servedSha = fetchCount === 1
                ? "1111111111111111111111111111111111111111"
                : EXPECTED_SHA;
            return new Response([
                `<link rel="stylesheet" href="styles.css?v=${servedSha}">`,
                `<script type="module" src="app/bootstrap.mjs?v=${servedSha}"></script>`
            ].join("\n"));
        },
        wait: async (delayMs) => {
            waitDelays.push(delayMs);
        }
    });

    assert.deepEqual(fetchedUrls, [
        "https://example.test/knksongs/index.html?deployment-check=run-456-1",
        "https://example.test/knksongs/index.html?deployment-check=run-456-2"
    ]);
    assert.deepEqual(waitDelays, [25]);
    assert.equal(verifiedUrl.href, fetchedUrls[1]);
});

test("pages deployment verification: fails when the expected SHA never appears", async () => {
    const waitDelays = [];

    await assert.rejects(
        verifyPagesDeployment({
            pageUrl: "https://example.test/knksongs/",
            expectedSha: EXPECTED_SHA,
            attempts: 2,
            delayMs: 10,
            fetchImpl: async () => new Response("<html></html>"),
            wait: async (delayMs) => {
                waitDelays.push(delayMs);
            }
        }),
        /Pages did not serve commit c2abca6.+ after 2 attempts/
    );
    assert.deepEqual(waitDelays, [10]);
});
