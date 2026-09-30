#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_DEADLINE_MS = 10 * 60 * 1_000;
const DEFAULT_DELAY_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/**
 * 公開markerが期待するcommit SHAを示しているか判定する。
 */
export function hasExpectedDeploySha(markerJson: string, expectedSha: string): boolean {
    try {
        const marker = JSON.parse(markerJson);
        return marker !== null &&
            typeof marker === "object" &&
            !Array.isArray(marker) &&
            marker.sha === expectedSha;
    } catch {
        return false;
    }
}

/**
 * CDNとbrowser cacheを避けて公開markerを確認するURLを作る。
 */
export function createVerificationUrl(pageUrl: string, verificationToken: string, attempt: number): URL {
    const baseUrl = new URL(pageUrl);
    if (!baseUrl.pathname.endsWith("/")) {
        baseUrl.pathname = `${baseUrl.pathname}/`;
    }
    const verificationUrl = new URL("deployment.json", baseUrl);
    verificationUrl.searchParams.set("deployment-check", `${verificationToken}-${attempt}`);
    return verificationUrl;
}

/**
 * 指定時間が経過するまで待機する。
 */
function waitFor(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * 正の整数として解釈できる環境変数を読み込む。
 */
function readPositiveInteger(value: string | undefined, fallback: number, label: string): number {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${label} must be a positive integer`);
    }
    return parsed;
}

/**
 * Pagesの公開markerを期限まで繰り返し取得し、期待するcommit SHAの反映を確認する。
 */
export async function verifyPagesDeployment(options: {
    pageUrl: string,
    expectedSha: string,
    verificationToken?: string,
    deadlineMs?: number,
    delayMs?: number,
    requestTimeoutMs?: number,
    fetchImpl?: typeof fetch,
    wait?: (delayMs: number) => Promise<void>,
    now?: () => number,
    createTimeoutSignal?: (timeoutMs: number) => AbortSignal
}): Promise<URL> {
    const {
        pageUrl,
        expectedSha,
        verificationToken = expectedSha,
        deadlineMs = DEFAULT_DEADLINE_MS,
        delayMs = DEFAULT_DELAY_MS,
        requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
        fetchImpl = fetch,
        wait = waitFor,
        now = Date.now,
        createTimeoutSignal = (timeoutMs) => AbortSignal.timeout(timeoutMs)
    } = options;
    if (!pageUrl) throw new Error("PAGE_URL is required");
    if (!/^[0-9a-f]{7,64}$/i.test(expectedSha)) {
        throw new Error("EXPECTED_SHA must be a hexadecimal commit SHA");
    }
    if (!verificationToken) throw new Error("verificationToken is required");
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) {
        throw new Error("deadlineMs must be a positive integer");
    }
    if (!Number.isSafeInteger(delayMs) || delayMs <= 0) {
        throw new Error("delayMs must be a positive integer");
    }
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
        throw new Error("requestTimeoutMs must be a positive integer");
    }

    const startedAt = now();
    let attempt = 0;
    let lastError: Error | null = null;

    while (true) {
        const elapsedMs = now() - startedAt;
        if (elapsedMs >= deadlineMs) break;
        attempt++;
        const remainingMs = deadlineMs - elapsedMs;
        const verificationUrl = createVerificationUrl(pageUrl, verificationToken, attempt);
        try {
            const response = await fetchImpl(verificationUrl, {
                headers: {
                    "cache-control": "no-cache",
                    pragma: "no-cache"
                },
                signal: createTimeoutSignal(Math.min(requestTimeoutMs, remainingMs))
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const markerJson = await response.text();
            if (hasExpectedDeploySha(markerJson, expectedSha)) {
                console.log(`Verified deployed commit ${expectedSha} at ${verificationUrl.href}`);
                return verificationUrl;
            }
            lastError = new Error(`deployment marker does not identify commit ${expectedSha}`);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }

        console.warn(`Deployment verification attempt ${attempt} failed: ${lastError.message}`);
        const remainingAfterAttemptMs = deadlineMs - (now() - startedAt);
        if (remainingAfterAttemptMs > 0) {
            await wait(Math.min(delayMs, remainingAfterAttemptMs));
        }
    }

    throw new Error(
        `Pages did not serve commit ${expectedSha} within ${deadlineMs} ms ` +
        `after ${attempt} attempts: ${lastError?.message || "unknown error"}`
    );
}

const entryPointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entryPointUrl) {
    try {
        await verifyPagesDeployment({
            pageUrl: process.env.PAGE_URL || "",
            expectedSha: process.env.EXPECTED_SHA || "",
            verificationToken: process.env.GITHUB_RUN_ID || process.env.EXPECTED_SHA || "",
            deadlineMs: readPositiveInteger(
                process.env.DEPLOY_VERIFY_DEADLINE_MS,
                DEFAULT_DEADLINE_MS,
                "DEPLOY_VERIFY_DEADLINE_MS"
            ),
            delayMs: readPositiveInteger(
                process.env.DEPLOY_VERIFY_DELAY_MS,
                DEFAULT_DELAY_MS,
                "DEPLOY_VERIFY_DELAY_MS"
            ),
            requestTimeoutMs: readPositiveInteger(
                process.env.DEPLOY_VERIFY_REQUEST_TIMEOUT_MS,
                DEFAULT_REQUEST_TIMEOUT_MS,
                "DEPLOY_VERIFY_REQUEST_TIMEOUT_MS"
            )
        });
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
