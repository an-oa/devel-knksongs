import { isAbsolute, relative, resolve } from "node:path";

/**
 * project root 配下の安全な path に解決する。
 * @param {{
 *   targetPath: string,
 *   rootDir?: string,
 *   pathLabel: string,
 *   requiredTopLevelDirectory?: string,
 *   allowProjectRoot?: boolean
 * }} options
 * @returns {string}
 */
export function resolveProjectPath(options) {
    const projectRoot = resolve(options.rootDir || process.cwd());
    const resolvedPath = resolve(projectRoot, options.targetPath);
    const relativePath = relative(projectRoot, resolvedPath);
    if (!relativePath) {
        if (options.allowProjectRoot) return projectRoot;
        throw new Error(`${options.pathLabel} must not target the project root`);
    }
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
        throw new Error(`${options.pathLabel} must stay inside the project root`);
    }
    const pathSegments = relativePath.split(/[\\/]+/).filter(Boolean);
    if (
        options.requiredTopLevelDirectory &&
        pathSegments[0] !== options.requiredTopLevelDirectory
    ) {
        throw new Error(
            `${options.pathLabel} must be ${options.requiredTopLevelDirectory} or its child directory`
        );
    }
    if (pathSegments.some((segment) => segment.startsWith("."))) {
        throw new Error(`${options.pathLabel} must not include dot directories`);
    }
    return resolvedPath;
}
