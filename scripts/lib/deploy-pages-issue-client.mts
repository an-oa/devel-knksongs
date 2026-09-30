import {
    DEPLOYMENT_FAILURE_LABEL,
    DEPLOYMENT_FAILURE_MARKER,
    DEPLOYMENT_FAILURE_TITLE,
    hasReportedDeploymentState,
    isNewerWorkflowRun
} from "./deploy-pages-issue-state.mts";
import type { WorkflowRunOrder } from "./deploy-pages-issue-state.mts";

export type ManagedIssue = { number: number, body?: string | null, labels?: Array<string | { name?: string }> };

type WorkflowRunSummary = WorkflowRunOrder & { runId: string, status: string };

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const WORKFLOW_RUN_PAGE_SIZE = 100;

class GitHubApiError extends Error {
    declare status: number;

    /**
     * GitHub API errorを作る。
     */
    constructor(message: string, status: number) {
        super(message);
        this.name = "GitHubApiError";
        this.status = status;
    }
}

/**
 * GitHub REST API response bodyをJSONまたは文字列として読む。
 */
async function readResponseBody(response: Response): Promise<unknown> {
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
 */
function findNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    for (const link of linkHeader.split(",")) {
        const match = link.match(/<([^>]+)>;\s*rel="next"/);
        if (match) return match[1];
    }
    return null;
}

/**
 * GitHub Issue操作clientを作る。
 */
export function createGitHubIssueClient(options: {
    apiUrl: string,
    repository: string,
    token: string,
    fetchImpl?: typeof fetch,
    requestTimeoutMs?: number,
    createTimeoutSignal?: (timeoutMs: number) => AbortSignal
}): {
    ensureLabel: () => Promise<void>,
    getNewestSupersedingWorkflowRun: (
        workflowFile: string,
        reference: WorkflowRunOrder
    ) => Promise<WorkflowRunSummary | null>,
    getBranchSha: (branch: string) => Promise<string>,
    listOpenIssues: () => Promise<ManagedIssue[]>,
    createIssue: (body: string, assignee: string) => Promise<void>,
    addAssignee: (issueNumber: number, assignee: string) => Promise<void>,
    listComments: (issueNumber: number) => Promise<Array<{ body?: string | null }>>,
    commentIssue: (issueNumber: number, body: string) => Promise<void>,
    closeIssue: (issueNumber: number) => Promise<void>
} {
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
     */
    async function request(
        pathOrUrl: string,
        requestOptions: { method?: string, body?: Record<string, unknown> } = {}
    ): Promise<{ data: unknown, headers: Headers }> {
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
     * 各API固有の配列検証を適用し、Link headerに従って全pageを取得する。
     */
    async function listAllPages(
        path: string,
        readPage: (data: unknown, pageUrl: string) => unknown[]
    ): Promise<unknown[]> {
        const items: unknown[] = [];
        let nextUrl: string | null = path;
        while (nextUrl) {
            const response = await request(nextUrl);
            items.push(...readPage(response.data, nextUrl));
            nextUrl = findNextPageUrl(response.headers.get("link"));
        }
        return items;
    }

    /**
     * paginationされたGitHub API配列をすべて取得する。
     */
    async function listAll(path: string): Promise<unknown[]> {
        return listAllPages(path, (data, pageUrl) => {
            if (!Array.isArray(data)) {
                throw new Error(`GitHub API list response was not an array: ${pageUrl}`);
            }
            return data;
        });
    }

    /**
     * paginationされたworkflow run responseをすべて取得する。
     */
    async function listAllWorkflowRuns(path: string): Promise<unknown[]> {
        return listAllPages(path, (data, pageUrl) => {
            const runs = data !== null && typeof data === "object" &&
                "workflow_runs" in data && Array.isArray(data.workflow_runs)
                ? data.workflow_runs
                : null;
            if (!runs) {
                throw new Error(`GitHub API workflow runs response was invalid: ${pageUrl}`);
            }
            return runs;
        });
    }

    /**
     * paginationされたworkflow job responseをすべて取得する。
     */
    async function listAllWorkflowJobs(path: string): Promise<unknown[]> {
        return listAllPages(path, (data, pageUrl) => {
            const jobs = data !== null && typeof data === "object" &&
                "jobs" in data && Array.isArray(data.jobs)
                ? data.jobs
                : null;
            if (!jobs) {
                throw new Error(`GitHub API workflow jobs response was invalid: ${pageUrl}`);
            }
            return jobs;
        });
    }

    return {
        async getNewestSupersedingWorkflowRun(workflowFile, reference) {
            const query = new URLSearchParams({ per_page: String(WORKFLOW_RUN_PAGE_SIZE) });
            const runs = await listAllWorkflowRuns(
                `repos/${repositoryPath}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?${query}`
            );
            const runSummaries = runs.map((run) => {
                if (!run || typeof run !== "object" ||
                    !("id" in run) || !("run_number" in run) ||
                    !("run_attempt" in run) || !("status" in run)) {
                    throw new Error(`Workflow run state is missing for ${workflowFile}`);
                }
                const summary: WorkflowRunSummary = {
                    runId: String(run.id),
                    runNumber: String(run.run_number),
                    runAttempt: String(run.run_attempt),
                    status: String(run.status)
                };
                if (!/^[1-9][0-9]*$/.test(summary.runId)) {
                    throw new Error(`Workflow run ID must be a positive integer: ${summary.runId}`);
                }
                return summary;
            });
            const completedNewerRuns = runSummaries
                .filter((run) => run.status === "completed" && isNewerWorkflowRun(run, reference))
                .sort((left, right) => {
                    if (isNewerWorkflowRun(left, right)) return -1;
                    if (isNewerWorkflowRun(right, left)) return 1;
                    return 0;
                });
            for (const run of completedNewerRuns) {
                const jobQuery = new URLSearchParams({
                    filter: "latest",
                    per_page: String(WORKFLOW_RUN_PAGE_SIZE)
                });
                const jobs = await listAllWorkflowJobs(
                    `repos/${repositoryPath}/actions/runs/${run.runId}/jobs?${jobQuery}`
                );
                if (hasReportedDeploymentState(jobs)) return run;
            }
            return null;
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
            // 配列自体はlistAllで検査し、要素の形はGitHub Issues APIの契約に従う。
            const issues = await listAll(`repos/${repositoryPath}/issues?${query}`) as Array<ManagedIssue & { pull_request?: unknown }>;
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
            // コメント要素の形はGitHub Issue Comments APIの契約に従う。
            return listAll(`repos/${repositoryPath}/issues/${issueNumber}/comments?per_page=100`) as Promise<Array<{ body?: string | null }>>;
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
