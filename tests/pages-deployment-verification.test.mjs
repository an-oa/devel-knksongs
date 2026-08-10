import test from "node:test";
import assert from "node:assert/strict";
import {
    createVerificationUrl,
    hasExpectedDeploySha,
    verifyPagesDeployment
} from "../scripts/verify-pages-deployment.mjs";

const EXPECTED_SHA = "c2abca650af9fca8ff7a2ab28627ea3c3620d9b9";

test("pages deployment verification: recognizes matching deployment markers", () => {
    const markerJson = JSON.stringify({ sha: EXPECTED_SHA });

    assert.equal(hasExpectedDeploySha(markerJson, EXPECTED_SHA), true);
    assert.equal(
        hasExpectedDeploySha(markerJson, "1111111111111111111111111111111111111111"),
        false
    );
    assert.equal(hasExpectedDeploySha("<html></html>", EXPECTED_SHA), false);
});

test("pages deployment verification: creates a cache-bypassing URL under the Pages path", () => {
    const url = createVerificationUrl(
        "https://example.test/knksongs/",
        "run-123",
        2
    );

    assert.equal(
        url.href,
        "https://example.test/knksongs/deployment.json?deployment-check=run-123-2"
    );
});

test("pages deployment verification: retries until the expected SHA is served", async () => {
    const fetchedUrls = [];
    const waitDelays = [];
    const requestTimeouts = [];
    let fetchCount = 0;
    let currentTime = 0;

    const verifiedUrl = await verifyPagesDeployment({
        pageUrl: "https://example.test/knksongs/",
        expectedSha: EXPECTED_SHA,
        verificationToken: "run-456",
        deadlineMs: 100,
        delayMs: 25,
        requestTimeoutMs: 30,
        fetchImpl: async (url, init) => {
            fetchedUrls.push(url.href);
            assert.ok(init.signal instanceof AbortSignal);
            fetchCount++;
            const servedSha = fetchCount === 1
                ? "1111111111111111111111111111111111111111"
                : EXPECTED_SHA;
            return new Response(JSON.stringify({ sha: servedSha }));
        },
        wait: async (delayMs) => {
            waitDelays.push(delayMs);
            currentTime += delayMs;
        },
        now: () => currentTime,
        createTimeoutSignal: (timeoutMs) => {
            requestTimeouts.push(timeoutMs);
            return new AbortController().signal;
        }
    });

    assert.deepEqual(fetchedUrls, [
        "https://example.test/knksongs/deployment.json?deployment-check=run-456-1",
        "https://example.test/knksongs/deployment.json?deployment-check=run-456-2"
    ]);
    assert.deepEqual(waitDelays, [25]);
    assert.deepEqual(requestTimeouts, [30, 30]);
    assert.equal(verifiedUrl.href, fetchedUrls[1]);
});

test("pages deployment verification: stops at the deadline when the SHA never appears", async () => {
    const waitDelays = [];
    const requestTimeouts = [];
    let currentTime = 0;

    await assert.rejects(
        verifyPagesDeployment({
            pageUrl: "https://example.test/knksongs/",
            expectedSha: EXPECTED_SHA,
            deadlineMs: 25,
            delayMs: 10,
            requestTimeoutMs: 8,
            fetchImpl: async () => new Response(JSON.stringify({ sha: "1111111" })),
            wait: async (delayMs) => {
                waitDelays.push(delayMs);
                currentTime += delayMs;
            },
            now: () => currentTime,
            createTimeoutSignal: (timeoutMs) => {
                requestTimeouts.push(timeoutMs);
                return new AbortController().signal;
            }
        }),
        /Pages did not serve commit c2abca6.+ within 25 ms after 3 attempts/
    );
    assert.deepEqual(waitDelays, [10, 10, 5]);
    assert.deepEqual(requestTimeouts, [8, 8, 5]);
});
