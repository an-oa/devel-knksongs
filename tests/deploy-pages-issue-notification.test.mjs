import test from "node:test";
import assert from "node:assert/strict";
import {
    DEPLOYMENT_FAILURE_LABEL,
    DEPLOYMENT_FAILURE_MARKER,
    buildFailureReport,
    classifyDeploymentState,
    createGitHubIssueClient,
    createRunMarker,
    hasRunNotification,
    retryOperation,
    selectManagedIssues,
    updateDeploymentFailureIssue
} from "../scripts/deploy-pages-issue-notification.mjs";

const BASE_CONTEXT = {
    deploySha: "c2abca650af9fca8ff7a2ab28627ea3c3620d9b9",
    repositoryOwner: "an-oa",
    runId: "12345",
    runAttempt: "1",
    runUrl: "https://github.com/an-oa/knksongs/actions/runs/12345",
    results: {
        resolve: "success",
        build: "success",
        freshness: "success",
        deploy: "success"
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

test("deploy issue API: retries temporary failures with exponential delays", async () => {
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
            wait: async (delayMs) => waitDelays.push(delayMs)
        }
    );

    assert.equal(result, "ok");
    assert.equal(calls, 3);
    assert.deepEqual(waitDelays, [10, 20]);
});

test("deploy issue API client: creates its dedicated label without overwriting it", async () => {
    const requests = [];
    let labelExists = false;
    const client = createGitHubIssueClient({
        apiUrl: "https://api.github.test",
        repository: "an-oa/knksongs",
        token: "test-token",
        requestTimeoutMs: 100,
        createTimeoutSignal: () => new AbortController().signal,
        fetchImpl: async (url, init) => {
            const request = {
                method: init.method,
                path: new URL(url).pathname,
                body: init.body ? JSON.parse(init.body) : null
            };
            requests.push(request);

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
        }
    });

    await client.ensureLabel();
    await client.ensureLabel();

    assert.deepEqual(requests.map(({ method, path }) => [method, path]), [
        ["GET", `/repos/an-oa/knksongs/labels/${DEPLOYMENT_FAILURE_LABEL}`],
        ["POST", "/repos/an-oa/knksongs/labels"],
        ["GET", `/repos/an-oa/knksongs/labels/${DEPLOYMENT_FAILURE_LABEL}`]
    ]);
    assert.deepEqual(requests[1].body, {
        name: DEPLOYMENT_FAILURE_LABEL,
        color: "D73A4A",
        description: "Open while the Deploy Pages workflow is failing"
    });
});

test("deploy issue update: updates every matching issue when duplicates exist", async () => {
    const issues = [7, 8].map((number) => ({
        number,
        body: DEPLOYMENT_FAILURE_MARKER,
        labels: [{ name: DEPLOYMENT_FAILURE_LABEL }]
    }));
    const assigned = [];
    const commented = [];
    const client = {
        async ensureLabel() {},
        async listOpenIssues() { return issues; },
        async createIssue() { throw new Error("must not create"); },
        async addAssignee(issueNumber, assignee) { assigned.push([issueNumber, assignee]); },
        async listComments() { return []; },
        async commentIssue(issueNumber, body) { commented.push([issueNumber, body]); },
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
    let issues = [];
    let createCalls = 0;
    let commentCalls = 0;
    const client = {
        async ensureLabel() {},
        async listOpenIssues() { return issues; },
        async createIssue(body) {
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
    const waitDelays = [];
    let closeCalls = 0;
    let commentCalls = 0;
    const client = {
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
                wait: async (delayMs) => waitDelays.push(delayMs)
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
