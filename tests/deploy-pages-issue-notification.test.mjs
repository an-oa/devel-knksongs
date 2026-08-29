import test from "node:test";
import assert from "node:assert/strict";
import {
    DEPLOYMENT_FAILURE_LABEL,
    DEPLOYMENT_FAILURE_MARKER,
    DEPLOYMENT_FAILURE_TITLE,
    buildFailureReport,
    classifyDeploymentState,
    createGitHubIssueClient,
    createRunMarker,
    hasRunNotification,
    isNewerWorkflowRun,
    retryOperation,
    selectManagedIssues,
    selectNewestWorkflowRun,
    updateDeploymentFailureIssue
} from "../scripts/deploy-pages-issue-notification.mjs";

const BASE_CONTEXT = {
    deploySha: "c2abca650af9fca8ff7a2ab28627ea3c3620d9b9",
    repositoryOwner: "an-oa",
    runId: "12345",
    runNumber: "100",
    runAttempt: "1",
    runUrl: "https://github.com/an-oa/knksongs/actions/runs/12345",
    results: {
        resolve: "success",
        build: "success",
        freshness: "success",
        deploy: "success"
    }
};

const CURRENT_DEPLOYMENT_METHODS = {
    async getLatestWorkflowRun() {
        return {
            runNumber: BASE_CONTEXT.runNumber,
            runAttempt: BASE_CONTEXT.runAttempt
        };
    },
    async getBranchSha() {
        return BASE_CONTEXT.deploySha;
    }
};

test("deploy issue state: classifies expected skips, failures, recovery, and cancellation", () => {
    const cases = [
        {
            name: "outdated deployment skip",
            results: {
                resolve: "success",
                build: "skipped",
                freshness: "skipped",
                deploy: "skipped"
            },
            expected: "noop"
        },
        {
            name: "resolve failure",
            results: {
                resolve: "failure",
                build: "skipped",
                freshness: "skipped",
                deploy: "skipped"
            },
            expected: "failure"
        },
        {
            name: "build failure",
            results: {
                resolve: "success",
                build: "failure",
                freshness: "skipped",
                deploy: "skipped"
            },
            expected: "failure"
        },
        {
            name: "freshness failure",
            results: {
                resolve: "success",
                build: "success",
                freshness: "failure",
                deploy: "skipped"
            },
            expected: "failure"
        },
        {
            name: "deploy failure",
            results: {
                resolve: "success",
                build: "success",
                freshness: "success",
                deploy: "failure"
            },
            expected: "failure"
        },
        {
            name: "cancelled build",
            results: {
                resolve: "success",
                build: "cancelled",
                freshness: "skipped",
                deploy: "skipped"
            },
            expected: "failure"
        },
        {
            name: "successful recovery",
            results: BASE_CONTEXT.results,
            expected: "recovery"
        }
    ];

    for (const entry of cases) {
        assert.equal(classifyDeploymentState(entry.results), entry.expected, entry.name);
    }
});

test("deploy issue state: rejects unknown job results", () => {
    assert.throws(
        () => classifyDeploymentState({
            resolve: "success",
            build: "timed_out",
            freshness: "skipped",
            deploy: "skipped"
        }),
        /Unknown build job result: timed_out/
    );
});

test("deploy issue identity: uses a dedicated label and body marker instead of the title", () => {
    const issues = [
        {
            number: 3,
            body: DEPLOYMENT_FAILURE_MARKER,
            labels: [{ name: DEPLOYMENT_FAILURE_LABEL }],
            title: "Operator-renamed incident"
        },
        {
            number: 2,
            body: DEPLOYMENT_FAILURE_MARKER,
            labels: [{ name: DEPLOYMENT_FAILURE_LABEL }],
            title: "Another managed incident"
        },
        {
            number: 1,
            body: "Manual issue",
            labels: [{ name: DEPLOYMENT_FAILURE_LABEL }],
            title: "[Workflow Failure] Deploy Pages"
        },
        {
            number: 4,
            body: DEPLOYMENT_FAILURE_MARKER,
            labels: [{ name: "workflow-failure" }],
            title: "[Workflow Failure] Deploy Pages"
        }
    ];

    assert.deepEqual(selectManagedIssues(issues).map((issue) => issue.number), [2, 3]);
});

test("deploy issue report: records the run marker, attempt, and all job results", () => {
    const report = buildFailureReport(
        {
            ...BASE_CONTEXT,
            results: {
                ...BASE_CONTEXT.results,
                deploy: "failure"
            }
        },
        new Date("2026-08-28T01:02:03.456Z")
    );

    assert.match(report, /knksongs:deploy-pages-notification:failure:12345:1/);
    assert.match(report, /- Attempt: 1/);
    assert.match(report, /- Deploy: failure/);
    assert.match(report, /- Detected at: 2026-08-28T01:02:03Z/);
});

test("deploy issue comments: treat another attempt of the same run as already recorded", () => {
    const comments = [{ body: createRunMarker("recovery", "12345", "1") }];

    assert.equal(hasRunNotification("", comments, "recovery", "12345"), true);
    assert.equal(hasRunNotification("", comments, "recovery", "67890"), false);
});

test("deploy issue ordering: compares new runs before attempts of the same run", () => {
    assert.equal(
        isNewerWorkflowRun(
            { runNumber: "101", runAttempt: "1" },
            { runNumber: "100", runAttempt: "20" }
        ),
        true
    );
    assert.equal(
        isNewerWorkflowRun(
            { runNumber: "100", runAttempt: "2" },
            { runNumber: "100", runAttempt: "1" }
        ),
        true
    );
    assert.equal(
        isNewerWorkflowRun(
            { runNumber: "100", runAttempt: "1" },
            { runNumber: "100", runAttempt: "1" }
        ),
        false
    );
    assert.deepEqual(
        selectNewestWorkflowRun([
            { runNumber: "100", runAttempt: "3" },
            { runNumber: "101", runAttempt: "1" },
            { runNumber: "101", runAttempt: "2" }
        ]),
        { runNumber: "101", runAttempt: "2" }
    );
});

test("deploy issue API: retries temporary failures with exponential delays", async () => {
    /** @type {number[]} */
    const waitDelays = [];
    let calls = 0;

    const result = await retryOperation(
        "Temporary API operation",
        async () => {
            calls++;
            if (calls < 3) throw new Error("temporary failure");
            return "ok";
        },
        {
            attempts: 3,
            delayMs: 10,
            wait: async (delayMs) => {
                waitDelays.push(delayMs);
            }
        }
    );

    assert.equal(result, "ok");
    assert.equal(calls, 3);
    assert.deepEqual(waitDelays, [10, 20]);
});

test("deploy issue API client: reads unordered deployment guards and creates its label once", async () => {
    /** @type {Array<{ method: string, path: string, search: string, body: Record<string, *> | null }>} */
    const requests = [];
    let labelExists = false;
    /** @type {typeof fetch} */
    const fetchImpl = async (url, init = {}) => {
        const requestUrl = url instanceof Request ? url.url : String(url);
        const request = {
            method: init.method || "GET",
            path: new URL(requestUrl).pathname,
            search: new URL(requestUrl).search,
            body: typeof init.body === "string" ? JSON.parse(init.body) : null
        };
        requests.push(request);

        if (request.path.endsWith("/actions/workflows/deploy-pages.yml/runs")) {
            return Response.json({
                workflow_runs: [
                    { run_number: 99, run_attempt: 4 },
                    { run_number: 100, run_attempt: 1 }
                ]
            });
        }
        if (request.path.endsWith("/git/ref/heads/main")) {
            return Response.json({ object: { sha: BASE_CONTEXT.deploySha } });
        }
        if (request.path.endsWith(`/labels/${DEPLOYMENT_FAILURE_LABEL}`)) {
            return labelExists
                ? Response.json({ name: DEPLOYMENT_FAILURE_LABEL })
                : Response.json({ message: "Not Found" }, { status: 404 });
        }
        if (request.path.endsWith("/labels") && request.method === "POST") {
            labelExists = true;
            return Response.json(request.body, { status: 201 });
        }
        throw new Error(`Unexpected request: ${request.method} ${request.path}`);
    };
    const client = createGitHubIssueClient({
        apiUrl: "https://api.github.test",
        repository: "an-oa/knksongs",
        token: "test-token",
        requestTimeoutMs: 100,
        createTimeoutSignal: () => new AbortController().signal,
        fetchImpl
    });

    assert.deepEqual(await client.getLatestWorkflowRun("deploy-pages.yml"), {
        runNumber: "100",
        runAttempt: "1"
    });
    assert.equal(await client.getBranchSha("main"), BASE_CONTEXT.deploySha);
    await client.ensureLabel();
    await client.ensureLabel();

    assert.deepEqual(requests.map(({ method, path, search }) => [method, path, search]), [
        ["GET", "/repos/an-oa/knksongs/actions/workflows/deploy-pages.yml/runs", "?per_page=100"],
        ["GET", "/repos/an-oa/knksongs/git/ref/heads/main", ""],
        ["GET", `/repos/an-oa/knksongs/labels/${DEPLOYMENT_FAILURE_LABEL}`, ""],
        ["POST", "/repos/an-oa/knksongs/labels", ""],
        ["GET", `/repos/an-oa/knksongs/labels/${DEPLOYMENT_FAILURE_LABEL}`, ""]
    ]);
    assert.deepEqual(requests[3].body, {
        name: DEPLOYMENT_FAILURE_LABEL,
        color: "D73A4A",
        description: "Open while the Deploy Pages workflow is failing"
    });
});

test("deploy issue API client: uses the expected Issue paths, methods, and payloads", async () => {
    /** @type {Array<{ method: string, path: string, search: string, body: Record<string, *> | null }>} */
    const requests = [];
    /** @type {typeof fetch} */
    const fetchImpl = async (url, init = {}) => {
        const requestUrl = url instanceof Request ? url.url : String(url);
        const parsedUrl = new URL(requestUrl);
        const request = {
            method: init.method || "GET",
            path: parsedUrl.pathname,
            search: parsedUrl.search,
            body: typeof init.body === "string" ? JSON.parse(init.body) : null
        };
        requests.push(request);

        if (request.method === "GET" && request.path.endsWith("/issues")) {
            return Response.json([
                { number: 7, body: DEPLOYMENT_FAILURE_MARKER, labels: [] },
                { number: 8, pull_request: { url: "https://api.github.test/pulls/8" } }
            ]);
        }
        if (request.method === "GET" && request.path.endsWith("/comments")) {
            return Response.json([{ body: "existing comment" }]);
        }
        return Response.json({}, { status: request.method === "POST" ? 201 : 200 });
    };
    const client = createGitHubIssueClient({
        apiUrl: "https://api.github.test",
        repository: "an-oa/knksongs",
        token: "test-token",
        requestTimeoutMs: 100,
        createTimeoutSignal: () => new AbortController().signal,
        fetchImpl
    });

    assert.deepEqual(await client.listOpenIssues(), [
        { number: 7, body: DEPLOYMENT_FAILURE_MARKER, labels: [] }
    ]);
    await client.createIssue("failure report", "an-oa");
    await client.addAssignee(7, "an-oa");
    assert.deepEqual(await client.listComments(7), [{ body: "existing comment" }]);
    await client.commentIssue(7, "recovery report");
    await client.closeIssue(7);

    assert.deepEqual(requests, [
        {
            method: "GET",
            path: "/repos/an-oa/knksongs/issues",
            search: `?state=open&labels=${DEPLOYMENT_FAILURE_LABEL}&per_page=100`,
            body: null
        },
        {
            method: "POST",
            path: "/repos/an-oa/knksongs/issues",
            search: "",
            body: {
                title: DEPLOYMENT_FAILURE_TITLE,
                body: `${DEPLOYMENT_FAILURE_MARKER}\nfailure report`,
                assignees: ["an-oa"],
                labels: [DEPLOYMENT_FAILURE_LABEL]
            }
        },
        {
            method: "POST",
            path: "/repos/an-oa/knksongs/issues/7/assignees",
            search: "",
            body: { assignees: ["an-oa"] }
        },
        {
            method: "GET",
            path: "/repos/an-oa/knksongs/issues/7/comments",
            search: "?per_page=100",
            body: null
        },
        {
            method: "POST",
            path: "/repos/an-oa/knksongs/issues/7/comments",
            search: "",
            body: { body: "recovery report" }
        },
        {
            method: "PATCH",
            path: "/repos/an-oa/knksongs/issues/7",
            search: "",
            body: { state: "closed", state_reason: "completed" }
        }
    ]);
});

test("deploy issue update: ignores an older run even when it targets the same commit", async () => {
    let branchChecks = 0;
    let issueWrites = 0;
    const client = {
        ...CURRENT_DEPLOYMENT_METHODS,
        async getLatestWorkflowRun() {
            return { runNumber: "101", runAttempt: "1" };
        },
        async getBranchSha() {
            branchChecks++;
            return BASE_CONTEXT.deploySha;
        },
        async ensureLabel() { issueWrites++; },
        async listOpenIssues() { issueWrites++; return []; },
        async createIssue() { issueWrites++; },
        async addAssignee() { issueWrites++; },
        async listComments() { issueWrites++; return []; },
        async commentIssue() { issueWrites++; },
        async closeIssue() { issueWrites++; }
    };

    const state = await updateDeploymentFailureIssue(
        {
            ...BASE_CONTEXT,
            results: { ...BASE_CONTEXT.results, deploy: "failure" }
        },
        client
    );

    assert.equal(state, "noop");
    assert.equal(branchChecks, 0);
    assert.equal(issueWrites, 0);
});

test("deploy issue update: ignores a run whose commit is no longer main", async () => {
    let issueWrites = 0;
    const client = {
        ...CURRENT_DEPLOYMENT_METHODS,
        async getBranchSha() {
            return "1111111111111111111111111111111111111111";
        },
        async ensureLabel() { issueWrites++; },
        async listOpenIssues() { issueWrites++; return []; },
        async createIssue() { issueWrites++; },
        async addAssignee() { issueWrites++; },
        async listComments() { issueWrites++; return []; },
        async commentIssue() { issueWrites++; },
        async closeIssue() { issueWrites++; }
    };

    const state = await updateDeploymentFailureIssue(BASE_CONTEXT, client);

    assert.equal(state, "noop");
    assert.equal(issueWrites, 0);
});

test("deploy issue update: updates every matching issue when duplicates exist", async () => {
    const issues = [7, 8].map((number) => ({
        number,
        body: DEPLOYMENT_FAILURE_MARKER,
        labels: [{ name: DEPLOYMENT_FAILURE_LABEL }]
    }));
    /** @type {Array<[number, string]>} */
    const assigned = [];
    /** @type {Array<[number, string]>} */
    const commented = [];
    const client = {
        ...CURRENT_DEPLOYMENT_METHODS,
        async ensureLabel() {},
        async listOpenIssues() { return issues; },
        async createIssue() { throw new Error("must not create"); },
        async addAssignee(
            /** @type {number} */ issueNumber,
            /** @type {string} */ assignee
        ) { assigned.push([issueNumber, assignee]); },
        async listComments() { return []; },
        async commentIssue(
            /** @type {number} */ issueNumber,
            /** @type {string} */ body
        ) { commented.push([issueNumber, body]); },
        async closeIssue() { throw new Error("must not close"); }
    };

    const state = await updateDeploymentFailureIssue(
        {
            ...BASE_CONTEXT,
            results: { ...BASE_CONTEXT.results, deploy: "failure" }
        },
        client,
        { now: () => new Date("2026-08-28T01:02:03Z") }
    );

    assert.equal(state, "failure");
    assert.deepEqual(assigned, [[7, "an-oa"], [8, "an-oa"]]);
    assert.deepEqual(commented.map(([issueNumber]) => issueNumber), [7, 8]);
});

test("deploy issue creation: locates an issue created before a transient response failure", async () => {
    /** @type {Array<{ number: number, body: string, labels: Array<{ name: string }> }>} */
    let issues = [];
    let createCalls = 0;
    let commentCalls = 0;
    const client = {
        ...CURRENT_DEPLOYMENT_METHODS,
        async ensureLabel() {},
        async listOpenIssues() { return issues; },
        async createIssue(/** @type {string} */ body) {
            createCalls++;
            issues = [{
                number: 10,
                body: `${DEPLOYMENT_FAILURE_MARKER}\n${body}`,
                labels: [{ name: DEPLOYMENT_FAILURE_LABEL }]
            }];
            throw new Error("response lost after create");
        },
        async addAssignee() {},
        async listComments() { return []; },
        async commentIssue() { commentCalls++; },
        async closeIssue() { throw new Error("must not close"); }
    };

    const state = await updateDeploymentFailureIssue(
        {
            ...BASE_CONTEXT,
            results: { ...BASE_CONTEXT.results, deploy: "failure" }
        },
        client,
        {
            now: () => new Date("2026-08-28T01:02:03Z"),
            retry: { attempts: 2, delayMs: 0, wait: async () => {} }
        }
    );

    assert.equal(state, "failure");
    assert.equal(createCalls, 1);
    assert.equal(commentCalls, 0);
});

test("deploy issue recovery: retries close and avoids duplicate comments across reruns", async () => {
    const recoveryMarker = createRunMarker("recovery", BASE_CONTEXT.runId, "1");
    const issue = {
        number: 9,
        body: DEPLOYMENT_FAILURE_MARKER,
        labels: [{ name: DEPLOYMENT_FAILURE_LABEL }]
    };
    /** @type {number[]} */
    const waitDelays = [];
    let closeCalls = 0;
    let commentCalls = 0;
    const client = {
        ...CURRENT_DEPLOYMENT_METHODS,
        async ensureLabel() {},
        async listOpenIssues() { return [issue]; },
        async createIssue() { throw new Error("must not create"); },
        async addAssignee() { throw new Error("must not assign"); },
        async listComments() { return [{ body: recoveryMarker }]; },
        async commentIssue() { commentCalls++; },
        async closeIssue() {
            closeCalls++;
            if (closeCalls < 3) throw new Error("temporary close failure");
        }
    };

    const state = await updateDeploymentFailureIssue(
        { ...BASE_CONTEXT, runAttempt: "2" },
        client,
        {
            now: () => new Date("2026-08-28T01:02:03Z"),
            retry: {
                attempts: 3,
                delayMs: 10,
                wait: async (delayMs) => {
                    waitDelays.push(delayMs);
                }
            }
        }
    );

    assert.equal(state, "recovery");
    assert.equal(commentCalls, 0);
    assert.equal(closeCalls, 3);
    assert.deepEqual(waitDelays, [10, 20]);
});

test("deploy issue recovery: fails when closing the issue never succeeds", async () => {
    const issue = {
        number: 11,
        body: DEPLOYMENT_FAILURE_MARKER,
        labels: [{ name: DEPLOYMENT_FAILURE_LABEL }]
    };
    const client = {
        ...CURRENT_DEPLOYMENT_METHODS,
        async ensureLabel() {},
        async listOpenIssues() { return [issue]; },
        async createIssue() { throw new Error("must not create"); },
        async addAssignee() { throw new Error("must not assign"); },
        async listComments() { return []; },
        async commentIssue() {},
        async closeIssue() { throw new Error("permanent close failure"); }
    };

    await assert.rejects(
        updateDeploymentFailureIssue(
            BASE_CONTEXT,
            client,
            {
                retry: { attempts: 2, delayMs: 0, wait: async () => {} }
            }
        ),
        /Close recovered deployment failure issue #11 failed after 2 attempts/
    );
});
