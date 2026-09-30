import test from "node:test";
import assert from "node:assert/strict";
import { createGitHubIssueClient } from "../scripts/lib/deploy-pages-issue-client.mts";

const REFERENCE_RUN = { runNumber: "100", runAttempt: "1" };
const NEWER_RUN = { id: 101, run_number: 101, run_attempt: 1, status: "completed" };

/** fetch入力をURLへ揃え、page番号付きのmock応答を作れるようにする。 */
function requestUrl(input: Parameters<typeof fetch>[0]): URL {
    return new URL(input instanceof Request ? input.url : String(input));
}

/** 次pageへのLinkを持つAPI応答を作る。 */
function pageResponse(data: unknown, url: URL, nextPage?: number): Response {
    if (nextPage === undefined) return Response.json(data);
    const nextUrl = new URL(url);
    nextUrl.searchParams.set("page", String(nextPage));
    return Response.json(data, {
        headers: { link: `<${nextUrl.href}>; rel="next"` }
    });
}

/** 外部通信を使わず、注入したfetchでAPIクライアントを作る。 */
function createClient(fetchImpl: typeof fetch) {
    return createGitHubIssueClient({
        apiUrl: "https://api.github.test",
        repository: "an-oa/knksongs",
        token: "test-token",
        createTimeoutSignal: () => new AbortController().signal,
        fetchImpl
    });
}

for (const kind of ["issues", "comments"] as const) {
    test(`deploy issue pagination: collects all ${kind} pages in order`, async () => {
        const pages: number[] = [];
        const first = kind === "issues" ? { number: 7 } : { body: "first" };
        const second = kind === "issues" ? { number: 9 } : { body: "second" };
        const client = createClient(async (input) => {
            const url = requestUrl(input);
            const page = Number(url.searchParams.get("page") || "1");
            pages.push(page);
            if (page === 1) {
                const data = kind === "issues"
                    ? [first, { number: 8, pull_request: {} }]
                    : [first];
                return pageResponse(data, url, 2);
            }
            assert.equal(page, 2);
            return pageResponse([second], url);
        });

        const result = kind === "issues" ? await client.listOpenIssues() : await client.listComments(7);
        assert.deepEqual(result, [first, second]);
        assert.deepEqual(pages, [1, 2]);
    });
}

test("deploy issue pagination: combines job pages across an empty page before judging notification state", async () => {
    const pages: number[] = [];
    const client = createClient(async (input) => {
        const url = requestUrl(input);
        if (url.pathname.endsWith("/runs")) return Response.json({ workflow_runs: [NEWER_RUN] });
        assert.ok(url.pathname.endsWith("/actions/runs/101/jobs"));
        assert.equal(url.searchParams.get("filter"), "latest");
        const page = Number(url.searchParams.get("page") || "1");
        pages.push(page);
        if (page === 1) {
            return pageResponse({ jobs: [
                { name: "resolve", conclusion: "success" },
                { name: "build", conclusion: "success" }
            ] }, url, 2);
        }
        if (page === 2) return pageResponse({ jobs: [] }, url, 3);
        assert.equal(page, 3);
        return pageResponse({ jobs: [
            { name: "freshness", conclusion: "success" },
            { name: "deploy", conclusion: "success" },
            { name: "notify", conclusion: "success" }
        ] }, url);
    });

    assert.deepEqual(await client.getNewestSupersedingWorkflowRun("deploy-pages.yml", REFERENCE_RUN), {
        runId: "101", runNumber: "101", runAttempt: "1", status: "completed"
    });
    assert.deepEqual(pages, [1, 2, 3]);
});

for (const kind of ["issues", "runs", "jobs"] as const) {
    test(`deploy issue pagination: rejects an invalid ${kind} response on a later page`, async () => {
        const pages: number[] = [];
        const client = createClient(async (input) => {
            const url = requestUrl(input);
            if (kind === "jobs" && url.pathname.endsWith("/runs")) {
                return Response.json({ workflow_runs: [NEWER_RUN] });
            }
            const page = Number(url.searchParams.get("page") || "1");
            pages.push(page);
            if (page === 1) {
                const data = kind === "issues" ? [] : kind === "runs" ? { workflow_runs: [] } : { jobs: [] };
                return pageResponse(data, url, 2);
            }
            assert.equal(page, 2);
            const data = kind === "issues" ? {} : kind === "runs" ? { workflow_runs: null } : { jobs: {} };
            return pageResponse(data, url);
        });
        const message = kind === "issues"
            ? "GitHub API list response was not an array"
            : `GitHub API workflow ${kind} response was invalid`;

        await assert.rejects(
            kind === "issues"
                ? client.listOpenIssues()
                : client.getNewestSupersedingWorkflowRun("deploy-pages.yml", REFERENCE_RUN),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.ok(error.message.startsWith(message));
                assert.match(error.message, /page=2/);
                return true;
            }
        );
        assert.deepEqual(pages, [1, 2]);
    });
}

test("deploy issue pagination: propagates a later page HTTP failure instead of returning partial results", async () => {
    const client = createClient(async (input) => {
        const url = requestUrl(input);
        if (!url.searchParams.has("page")) return pageResponse([{ number: 7 }], url, 2);
        return Response.json({ message: "temporarily unavailable" }, { status: 503 });
    });

    await assert.rejects(client.listOpenIssues(), /returned 503: temporarily unavailable/);
});
