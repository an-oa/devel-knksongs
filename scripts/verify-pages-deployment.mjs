#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_ATTEMPTS = 12;
const DEFAULT_DELAY_MS = 10_000;

/**
 * 公開HTMLが期待するcommit SHAのcache busterを参照しているか判定する。
 * @param {string} html
 * @param {string} expectedSha
 * @returns {boolean}
 */
export function hasExpectedDeploySha(html, expectedSha) {
    const encodedSha = encodeURIComponent(expectedSha);
    return html.includes(`styles.css?v=${encodedSha}`) &&
        html.includes(`app/bootstrap.mjs?v=${encodedSha}`);
}

/**
 * CDNとbrowser cacheを避けて公開HTMLを確認するURLを作る。
 * @param {string} pageUrl
 * @param {string} verificationToken
 * @param {number} attempt
 * @returns {URL}
 */
export function createVerificationUrl(pageUrl, verificationToken, attempt) {
    const baseUrl = new URL(pageUrl);
    if (!baseUrl.pathname.endsWith("/")) {
        baseUrl.pathname = `${baseUrl.pathname}/`;
    }
    const verificationUrl = new URL("index.html", baseUrl);
    verificationUrl.searchParams.set("deployment-check", `${verificationToken}-${attempt}`);
    return verificationUrl;
}

/**
 * 指定時間が経過するまで待機する。
 * @param {number} delayMs
 * @returns {Promise<void>}
 */
function waitFor(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * 正の整数として解釈できる環境変数を読み込む。
 * @param {string | undefined} value
 * @param {number} fallback
 * @param {string} label
 * @returns {number}
 */
function readPositiveInteger(value, fallback, label) {
    if (value === undefined || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${label} must be a positive integer`);
    }
    return parsed;
}

/**
 * Pagesの公開HTMLを繰り返し取得し、期待するcommit SHAの反映を確認する。
 * @param {{
 *   pageUrl: string,
 *   expectedSha: string,
 *   verificationToken?: string,
 *   attempts?: number,
 *   delayMs?: number,
 *   fetchImpl?: typeof fetch,
 *   wait?: (delayMs: number) => Promise<void>
 * }} options
 * @returns {Promise<URL>}
 */
export async function verifyPagesDeployment(options) {
    const {
        pageUrl,
        expectedSha,
        verificationToken = expectedSha,
        attempts = DEFAULT_ATTEMPTS,
        delayMs = DEFAULT_DELAY_MS,
        fetchImpl = fetch,
        wait = waitFor
    } = options;
    if (!pageUrl) throw new Error("PAGE_URL is required");
    if (!/^[0-9a-f]{7,64}$/i.test(expectedSha)) {
        throw new Error("EXPECTED_SHA must be a hexadecimal commit SHA");
    }
    if (!verificationToken) throw new Error("verificationToken is required");
    if (!Number.isSafeInteger(attempts) || attempts <= 0) {
        throw new Error("attempts must be a positive integer");
    }
    if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
        throw new Error("delayMs must be a non-negative integer");
    }

    /** @type {Error | null} */
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const verificationUrl = createVerificationUrl(pageUrl, verificationToken, attempt);
        try {
            const response = await fetchImpl(verificationUrl, {
                headers: {
                    "cache-control": "no-cache",
                    pragma: "no-cache"
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const html = await response.text();
            if (hasExpectedDeploySha(html, expectedSha)) {
                console.log(`Verified deployed commit ${expectedSha} at ${verificationUrl.href}`);
                return verificationUrl;
            }
            lastError = new Error(`response does not reference commit ${expectedSha}`);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }

        console.warn(`Deployment verification attempt ${attempt}/${attempts} failed: ${lastError.message}`);
        if (attempt < attempts) await wait(delayMs);
    }

    throw new Error(
        `Pages did not serve commit ${expectedSha} after ${attempts} attempts: ${lastError?.message || "unknown error"}`
    );
}

const entryPointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entryPointUrl) {
    try {
        await verifyPagesDeployment({
            pageUrl: process.env.PAGE_URL || "",
            expectedSha: process.env.EXPECTED_SHA || "",
            verificationToken: process.env.GITHUB_RUN_ID || process.env.EXPECTED_SHA || "",
            attempts: readPositiveInteger(
                process.env.DEPLOY_VERIFY_ATTEMPTS,
                DEFAULT_ATTEMPTS,
                "DEPLOY_VERIFY_ATTEMPTS"
            ),
            delayMs: readPositiveInteger(
                process.env.DEPLOY_VERIFY_DELAY_MS,
                DEFAULT_DELAY_MS,
                "DEPLOY_VERIFY_DELAY_MS"
            )
        });
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
