#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const DEPLOYMENT_FAILURE_LABEL = "deploy-pages-failure";
export const DEPLOYMENT_FAILURE_MARKER = "<!-- knksongs:deploy-pages-failure -->";
export const DEPLOYMENT_FAILURE_TITLE = "[Workflow Failure] Deploy Pages";

/** @typedef {{ resolve: string, build: string, freshness: string, deploy: string }} DeploymentJobResults */
/** @typedef {{ runNumber: string, runAttempt: string }} WorkflowRunOrder */
/** @typedef {{ number: number, body?: string | null, labels?: Array<string | { name?: string }> }} ManagedIssue */

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 2_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const WORKFLOW_RUN_PAGE_SIZE = 100;
/** @type {Array<keyof DeploymentJobResults>} */
const JOB_NAMES = ["resolve", "build", "freshness", "deploy"];
const JOB_RESULTS = new Set(["success", "failure", "cancelled", "skipped"]);

/**
 * 指定時間が経過するまで待機する。
 * @param {number} delayMs
 * @returns {Promise<void>}
 */
function waitFor(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * 不明なthrow値をErrorへ正規化する。
 * @param {unknown} error
 * @returns {Error}
 */
function normalizeError(error) {
    return error instanceof Error ? error : new Error(String(error));
}

/**
 * GitHub API操作を短いbackoff付きで再試行する。
 * 境界条件を単体テストするためexportしている。
 * @template T
 * @param {string} label
 * @param {() => Promise<T>} operation
 * @param {{ attempts?: number, delayMs?: number, wait?: (delayMs: number) => Promise<void> }} [options]
 * @returns {Promise<T>}
 */
export async function retryOperation(label, operation, options = {}) {
    const {
        attempts = DEFAULT_RETRY_ATTEMPTS,
        delayMs = DEFAULT_RETRY_DELAY_MS,
        wait = waitFor
    } = options;
    if (!Number.isSafeInteger(attempts) || attempts <= 0) {
        throw new Error("Retry attempts must be a positive integer");
    }
    if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
        throw new Error("Retry delay must be a non-negative integer");
    }

    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = normalizeError(error);
            if (attempt === attempts) break;
            const nextDelayMs = delayMs * (2 ** (attempt - 1));
            console.warn(
                `${label} failed on attempt ${attempt}/${attempts}: ${lastError.message}. ` +
                `Retrying in ${nextDelayMs} ms.`
            );
            await wait(nextDelayMs);
        }
    }

    throw new Error(
        `${label} failed after ${attempts} attempts: ${lastError?.message || "unknown error"}`,
        { cause: lastError }
    );
}

/**
 * job結果からIssueへ反映する状態遷移を決める。
 * 古いdeploy対象によるskipは無視し、cancelは未完了としてfailure扱いにする。
 * @param {DeploymentJobResults} results
 * @returns {"failure" | "recovery" | "noop"}
 */
export function classifyDeploymentState(results) {
    for (const jobName of JOB_NAMES) {
        const result = results[jobName];
        if (!JOB_RESULTS.has(result)) {
            throw new Error(`Unknown ${jobName} job result: ${result || "(empty)"}`);
        }
    }

    const resultValues = JOB_NAMES.map((jobName) => results[jobName]);
    if (resultValues.some((result) => result === "failure" || result === "cancelled")) {
        return "failure";
    }
    if (results.deploy === "success") return "recovery";
    return "noop";
}

/**
 * workflow run単位の冪等性markerを作る。
 * attemptは記録するが、同じrunの再実行はmarker prefixで同一通知として扱う。
 * @param {"failure" | "recovery"} kind
 * @param {string} runId
 * @param {string} runAttempt
 * @returns {string}
 */
export function createRunMarker(kind, runId, runAttempt) {
    if (!/^[1-9][0-9]*$/.test(runId)) throw new Error("runId must be a positive integer");
    if (!/^[1-9][0-9]*$/.test(runAttempt)) {
        throw new Error("runAttempt must be a positive integer");
    }
    return `<!-- knksongs:deploy-pages-notification:${kind}:${runId}:${runAttempt} -->`;
}

/**
 * workflow runの連番と再実行回数を比較する。
 * run_numberは新規runごと、run_attemptは同じrunの再実行ごとに増加する。
 * @param {WorkflowRunOrder} candidate
 * @param {WorkflowRunOrder} reference
 * @returns {boolean}
 */
export function isNewerWorkflowRun(candidate, reference) {
    for (const value of [
        candidate.runNumber,
        candidate.runAttempt,
        reference.runNumber,
        reference.runAttempt
    ]) {
        if (!/^[1-9][0-9]*$/.test(value)) {
            throw new Error(`Workflow run order must be a positive integer: ${value || "(empty)"}`);
        }
    }
    const candidateRunNumber = BigInt(candidate.runNumber);
    const referenceRunNumber = BigInt(reference.runNumber);
    if (candidateRunNumber !== referenceRunNumber) {
        return candidateRunNumber > referenceRunNumber;
    }
    return BigInt(candidate.runAttempt) > BigInt(reference.runAttempt);
}

/**
 * APIの配列順序に依存せず、run番号とattemptが最大のworkflow runを選ぶ。
 * 境界条件を単体テストするためexportしている。
 * @param {WorkflowRunOrder[]} workflowRuns
 * @returns {WorkflowRunOrder}
 */
export function selectNewestWorkflowRun(workflowRuns) {
    if (workflowRuns.length === 0) throw new Error("No workflow runs found");
    return workflowRuns.slice(1).reduce(
        (newest, candidate) => isNewerWorkflowRun(candidate, newest) ? candidate : newest,
        workflowRuns[0]
    );
}

/**
 * 同じworkflow runの通知を識別するmarker prefixを作る。
 * @param {"failure" | "recovery"} kind
 * @param {string} runId
 * @returns {string}
 */
function createRunMarkerPrefix(kind, runId) {
    if (!/^[1-9][0-9]*$/.test(runId)) throw new Error("runId must be a positive integer");
    return `<!-- knksongs:deploy-pages-notification:${kind}:${runId}:`;
}

/**
 * ISO timestampからミリ秒を除き、Issue向けのUTC表記に揃える。
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * deploy失敗のIssue本文または追記コメントを作る。
 * 境界条件を単体テストするためexportしている。
 * @param {{
 *   deploySha: string,
 *   runId: string,
 *   runAttempt: string,
 *   runUrl: string,
 *   results: DeploymentJobResults
 * }} context
 * @param {Date} [detectedAt]
 * @returns {string}
 */
export function buildFailureReport(context, detectedAt = new Date()) {
    return [
        createRunMarker("failure", context.runId, context.runAttempt),
        "",
        "### Deployment workflow failure",
        "",
        `- Commit: ${context.deploySha}`,
        `- Run: ${context.runUrl}`,
        `- Attempt: ${context.runAttempt}`,
        `- Resolve: ${context.results.resolve}`,
        `- Build: ${context.results.build}`,
        `- Freshness: ${context.results.freshness}`,
        `- Deploy: ${context.results.deploy}`,
        `- Detected at: ${formatTimestamp(detectedAt)}`,
        ""
    ].join("\n");
}

/**
 * deploy復旧のIssueコメントを作る。
 * 境界条件を単体テストするためexportしている。
 * @param {{ deploySha: string, runId: string, runAttempt: string, runUrl: string }} context
 * @param {Date} [recoveredAt]
 * @returns {string}
 */
export function buildRecoveryReport(context, recoveredAt = new Date()) {
    return [
        createRunMarker("recovery", context.runId, context.runAttempt),
        "",
        "### Deployment recovered",
        "",
        `- Commit: ${context.deploySha}`,
        `- Run: ${context.runUrl}`,
        `- Attempt: ${context.runAttempt}`,
        `- Recovered at: ${formatTimestamp(recoveredAt)}`,
        ""
    ].join("\n");
}

/**
 * 専用labelと本文markerの両方を持つ自動管理Issueだけを抽出する。
 * タイトルは利用者が変更できる表示情報として識別には使わない。
 * @param {ManagedIssue[]} issues
 * @returns {ManagedIssue[]}
 */
export function selectManagedIssues(issues) {
    return issues
        .filter((issue) => {
            const labelNames = (issue.labels || []).map((label) => (
                typeof label === "string" ? label : label.name || ""
            ));
            return labelNames.includes(DEPLOYMENT_FAILURE_LABEL) &&
                String(issue.body || "").includes(DEPLOYMENT_FAILURE_MARKER);
        })
        .sort((left, right) => left.number - right.number);
}

/**
 * Issue本文またはコメントに同じworkflow runの通知markerがあるか判定する。
 * @param {string | null | undefined} issueBody
 * @param {Array<{ body?: string | null }>} comments
 * @param {"failure" | "recovery"} kind
 * @param {string} runId
 * @returns {boolean}
 */
export function hasRunNotification(issueBody, comments, kind, runId) {
    const markerPrefix = createRunMarkerPrefix(kind, runId);
    return [issueBody || "", ...comments.map((comment) => comment.body || "")]
        .some((body) => body.includes(markerPrefix));
}

class GitHubApiError extends Error {
    /**
     * GitHub API errorを作る。
     * @param {string} message
     * @param {number} status
     */
    constructor(message, status) {
        super(message);
        this.name = "GitHubApiError";
        this.status = status;
    }
}

/**
 * GitHub REST API response bodyをJSONまたは文字列として読む。
 * @param {Response} response
 * @returns {Promise<unknown>}
 */
async function readResponseBody(response) {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/**
 * Link headerから次pageのURLを取得する。
 * @param {string | null} linkHeader
 * @returns {string | null}
 */
function findNextPageUrl(linkHeader) {
    if (!linkHeader) return null;
    for (const link of linkHeader.split(",")) {
        const match = link.match(/<([^>]+)>;\s*rel="next"/);
        if (match) return match[1];
    }
    return null;
}

/**
 * GitHub Issue操作clientを作る。
 * @param {{
 *   apiUrl: string,
 *   repository: string,
 *   token: string,
 *   fetchImpl?: typeof fetch,
 *   requestTimeoutMs?: number,
 *   createTimeoutSignal?: (timeoutMs: number) => AbortSignal
 * }} options
 * @returns {{
 *   ensureLabel: () => Promise<void>,
 *   getLatestWorkflowRun: (workflowFile: string) => Promise<WorkflowRunOrder>,
 *   getBranchSha: (branch: string) => Promise<string>,
 *   listOpenIssues: () => Promise<Array<*>>,
 *   createIssue: (body: string, assignee: string) => Promise<void>,
 *   addAssignee: (issueNumber: number, assignee: string) => Promise<void>,
 *   listComments: (issueNumber: number) => Promise<Array<*>>,
 *   commentIssue: (issueNumber: number, body: string) => Promise<void>,
 *   closeIssue: (issueNumber: number) => Promise<void>
 * }}
 */
export function createGitHubIssueClient(options) {
    const {
        apiUrl,
        repository,
        token,
        fetchImpl = fetch,
        requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
        createTimeoutSignal = (timeoutMs) => AbortSignal.timeout(timeoutMs)
    } = options;
    if (!apiUrl) throw new Error("GITHUB_API_URL is required");
    if (!/^[^/]+\/[^/]+$/.test(repository)) {
        throw new Error("GITHUB_REPOSITORY must use owner/repository format");
    }
    if (!token) throw new Error("GH_TOKEN is required");
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
        throw new Error("requestTimeoutMs must be a positive integer");
    }

    const repositoryPath = repository
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
    const baseUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;

    /**
     * GitHub REST APIへrequestする。
     * @param {string} pathOrUrl
     * @param {{ method?: string, body?: Record<string, *> }} [requestOptions]
     * @returns {Promise<{ data: *, headers: Headers }>}
     */
    async function request(pathOrUrl, requestOptions = {}) {
        const { method = "GET", body } = requestOptions;
        const url = /^https?:\/\//.test(pathOrUrl)
            ? pathOrUrl
            : new URL(pathOrUrl.replace(/^\//, ""), baseUrl).href;
        const response = await fetchImpl(url, {
            method,
            headers: {
                accept: "application/vnd.github+json",
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
                "x-github-api-version": "2022-11-28"
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: createTimeoutSignal(requestTimeoutMs)
        });
        const data = await readResponseBody(response);
        if (!response.ok) {
            const apiMessage = data !== null && typeof data === "object" && "message" in data
                ? String(data.message)
                : String(data || response.statusText);
            throw new GitHubApiError(
                `GitHub API ${method} ${new URL(url).pathname} returned ${response.status}: ${apiMessage}`,
                response.status
            );
        }
        return { data, headers: response.headers };
    }

    /**
     * paginationされたGitHub API配列をすべて取得する。
     * @param {string} path
     * @returns {Promise<Array<*>>}
     */
    async function listAll(path) {
        const items = [];
        /** @type {string | null} */
        let nextUrl = path;
        while (nextUrl) {
            const response = await request(nextUrl);
            if (!Array.isArray(response.data)) {
                throw new Error(`GitHub API list response was not an array: ${nextUrl}`);
            }
            items.push(...response.data);
            nextUrl = findNextPageUrl(response.headers.get("link"));
        }
        return items;
    }

    return {
        async getLatestWorkflowRun(workflowFile) {
            const query = new URLSearchParams({ per_page: String(WORKFLOW_RUN_PAGE_SIZE) });
            const response = await request(
                `repos/${repositoryPath}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${query}`
            );
            /** @type {unknown[]} */
            const runs = response.data !== null && typeof response.data === "object" &&
                "workflow_runs" in response.data && Array.isArray(response.data.workflow_runs)
                ? response.data.workflow_runs
                : [];
            const runOrders = runs.map((run) => {
                if (!run || typeof run !== "object" ||
                    !("run_number" in run) || !("run_attempt" in run)) {
                    throw new Error(`Workflow run order is missing for ${workflowFile}`);
                }
                return {
                    runNumber: String(run.run_number),
                    runAttempt: String(run.run_attempt)
                };
            });
            if (runOrders.length === 0) {
                throw new Error(`No workflow runs found for ${workflowFile}`);
            }
            return selectNewestWorkflowRun(runOrders);
        },

        async getBranchSha(branch) {
            const response = await request(
                `repos/${repositoryPath}/git/ref/heads/${encodeURIComponent(branch)}`
            );
            const sha = response.data !== null && typeof response.data === "object" &&
                "object" in response.data && response.data.object !== null &&
                typeof response.data.object === "object" && "sha" in response.data.object
                ? response.data.object.sha
                : null;
            if (typeof sha !== "string" || !sha) {
                throw new Error(`Branch SHA is missing for ${branch}`);
            }
            return sha;
        },

        async ensureLabel() {
            const labelPath = `repos/${repositoryPath}/labels/${encodeURIComponent(DEPLOYMENT_FAILURE_LABEL)}`;
            try {
                await request(labelPath);
                return;
            } catch (error) {
                if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
            }
            await request(`repos/${repositoryPath}/labels`, {
                method: "POST",
                body: {
                    name: DEPLOYMENT_FAILURE_LABEL,
                    color: "D73A4A",
                    description: "Open while the Deploy Pages workflow is failing"
                }
            });
        },

        async listOpenIssues() {
            const query = new URLSearchParams({
                state: "open",
                labels: DEPLOYMENT_FAILURE_LABEL,
                per_page: "100"
            });
            const issues = await listAll(`repos/${repositoryPath}/issues?${query}`);
            return issues.filter((issue) => !issue.pull_request);
        },

        async createIssue(body, assignee) {
            await request(`repos/${repositoryPath}/issues`, {
                method: "POST",
                body: {
                    title: DEPLOYMENT_FAILURE_TITLE,
                    body: `${DEPLOYMENT_FAILURE_MARKER}\n${body}`,
                    assignees: [assignee],
                    labels: [DEPLOYMENT_FAILURE_LABEL]
                }
            });
        },

        async addAssignee(issueNumber, assignee) {
            await request(`repos/${repositoryPath}/issues/${issueNumber}/assignees`, {
                method: "POST",
                body: { assignees: [assignee] }
            });
        },

        async listComments(issueNumber) {
            return listAll(`repos/${repositoryPath}/issues/${issueNumber}/comments?per_page=100`);
        },

        async commentIssue(issueNumber, body) {
            await request(`repos/${repositoryPath}/issues/${issueNumber}/comments`, {
                method: "POST",
                body: { body }
            });
        },

        async closeIssue(issueNumber) {
            await request(`repos/${repositoryPath}/issues/${issueNumber}`, {
                method: "PATCH",
                body: { state: "closed", state_reason: "completed" }
            });
        }
    };
}

/**
 * 同じrunのコメントがなければ冪等に追加する。
 * @param {ReturnType<typeof createGitHubIssueClient>} client
 * @param {{ number: number, body?: string | null }} issue
 * @param {"failure" | "recovery"} kind
 * @param {{ runId: string }} context
 * @param {string} report
 * @param {{ attempts?: number, delayMs?: number, wait?: (delayMs: number) => Promise<void> }} retryOptions
 * @returns {Promise<void>}
 */
async function ensureRunComment(client, issue, kind, context, report, retryOptions) {
    await retryOperation(
        `Comment on deployment ${kind} issue #${issue.number}`,
        async () => {
            const comments = await client.listComments(issue.number);
            if (hasRunNotification(issue.body, comments, kind, context.runId)) {
                console.log(`Issue #${issue.number} already records ${kind} run ${context.runId}.`);
                return;
            }
            await client.commentIssue(issue.number, report);
        },
        retryOptions
    );
}

/**
 * deploy結果を公開Issueへ反映する。
 * GitHub API clientを注入可能にし、状態遷移と一時失敗を単体テストする。
 * @param {{
 *   deploySha: string,
 *   repositoryOwner: string,
 *   runId: string,
 *   runNumber: string,
 *   runAttempt: string,
 *   runUrl: string,
 *   results: DeploymentJobResults,
 *   targetBranch?: string,
 *   workflowFile?: string
 * }} context
 * @param {ReturnType<typeof createGitHubIssueClient>} client
 * @param {{
 *   now?: () => Date,
 *   retry?: { attempts?: number, delayMs?: number, wait?: (delayMs: number) => Promise<void> }
 * }} [options]
 * @returns {Promise<"failure" | "recovery" | "noop">}
 */
export async function updateDeploymentFailureIssue(context, client, options = {}) {
    const state = classifyDeploymentState(context.results);
    if (state === "noop") {
        console.log("No deployment failure or recovery to report.");
        return state;
    }

    const now = options.now || (() => new Date());
    const retryOptions = options.retry || {};
    const targetBranch = context.targetBranch || "main";
    const workflowFile = context.workflowFile || "deploy-pages.yml";
    const latestRun = await retryOperation(
        "Check the latest Deploy Pages workflow run",
        () => client.getLatestWorkflowRun(workflowFile),
        retryOptions
    );
    if (isNewerWorkflowRun(latestRun, context)) {
        console.log(
            `Skip stale notification run ${context.runNumber}/${context.runAttempt}; ` +
            `latest run is ${latestRun.runNumber}/${latestRun.runAttempt}.`
        );
        return "noop";
    }

    const currentBranchSha = await retryOperation(
        `Check current ${targetBranch} commit`,
        () => client.getBranchSha(targetBranch),
        retryOptions
    );
    if (currentBranchSha !== context.deploySha) {
        console.log(
            `Skip stale notification target ${context.deploySha}; ` +
            `current ${targetBranch} is ${currentBranchSha}.`
        );
        return "noop";
    }

    await retryOperation(
        "Ensure deployment failure label",
        () => client.ensureLabel(),
        retryOptions
    );

    if (state === "failure") {
        const report = buildFailureReport(context, now());
        /** @type {ManagedIssue[]} */
        let existingIssues = [];
        const created = await retryOperation(
            "Create or locate deployment failure issue",
            async () => {
                existingIssues = selectManagedIssues(await client.listOpenIssues());
                if (existingIssues.length > 0) return false;
                await client.createIssue(report, context.repositoryOwner);
                return true;
            },
            retryOptions
        );
        if (created) {
            console.log("Created the deployment failure issue.");
            return state;
        }

        if (existingIssues.length > 1) {
            console.warn(
                `Found ${existingIssues.length} managed deployment failure issues; updating all of them.`
            );
        }
        for (const issue of existingIssues) {
            await retryOperation(
                `Assign deployment failure issue #${issue.number}`,
                () => client.addAssignee(issue.number, context.repositoryOwner),
                retryOptions
            );
            await ensureRunComment(client, issue, state, context, report, retryOptions);
        }
        return state;
    }

    const existingIssues = await retryOperation(
        "Find recovered deployment failure issues",
        async () => selectManagedIssues(await client.listOpenIssues()),
        retryOptions
    );
    if (existingIssues.length === 0) {
        console.log("No open deployment failure issue to close.");
        return state;
    }
    if (existingIssues.length > 1) {
        console.warn(
            `Found ${existingIssues.length} managed deployment failure issues; closing all of them.`
        );
    }

    const report = buildRecoveryReport(context, now());
    for (const issue of existingIssues) {
        await ensureRunComment(client, issue, state, context, report, retryOptions);
        await retryOperation(
            `Close recovered deployment failure issue #${issue.number}`,
            () => client.closeIssue(issue.number),
            retryOptions
        );
    }
    return state;
}

/**
 * 必須環境変数を読み込む。
 * @param {string} name
 * @returns {string}
 */
function requireEnvironmentVariable(name) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
}

const entryPointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entryPointUrl) {
    try {
        const context = {
            deploySha: requireEnvironmentVariable("DEPLOY_SHA"),
            repositoryOwner: requireEnvironmentVariable("REPOSITORY_OWNER"),
            runId: requireEnvironmentVariable("GITHUB_RUN_ID"),
            runNumber: requireEnvironmentVariable("GITHUB_RUN_NUMBER"),
            runAttempt: requireEnvironmentVariable("GITHUB_RUN_ATTEMPT"),
            runUrl: requireEnvironmentVariable("RUN_URL"),
            results: {
                resolve: requireEnvironmentVariable("RESOLVE_RESULT"),
                build: requireEnvironmentVariable("BUILD_RESULT"),
                freshness: requireEnvironmentVariable("FRESHNESS_RESULT"),
                deploy: requireEnvironmentVariable("DEPLOY_RESULT")
            }
        };
        const client = createGitHubIssueClient({
            apiUrl: requireEnvironmentVariable("GITHUB_API_URL"),
            repository: requireEnvironmentVariable("GITHUB_REPOSITORY"),
            token: requireEnvironmentVariable("GH_TOKEN")
        });
        await updateDeploymentFailureIssue(context, client);
    } catch (error) {
        console.error(normalizeError(error).message);
        process.exitCode = 1;
    }
}
