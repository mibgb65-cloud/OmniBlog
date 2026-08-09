const githubApiVersion = "2026-03-10";
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ContentMutationError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "ContentMutationError";
    this.code = code;
    this.status = status;
  }
}

function repositoryConfig(env) {
  const repository = env.GITHUB_REPOSITORY ?? "mibgb65-cloud/OmniBlog";
  const branch = env.GITHUB_BRANCH ?? "main";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[A-Za-z0-9._/-]+$/.test(branch)) {
    throw new ContentMutationError("github_config_invalid", "GitHub repository configuration is invalid.", 503);
  }
  if (!env.GITHUB_CONTENT_TOKEN) {
    throw new ContentMutationError("github_not_configured", "Published article deletion is not configured.", 503);
  }
  return { repository, branch };
}

async function githubRequest(env, repository, path, init = {}) {
  const requestFetch = env.GITHUB_FETCH ?? fetch;
  const response = await requestFetch(`https://api.github.com/repos/${repository}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GITHUB_CONTENT_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "OmniBlog-Studio",
      "x-github-api-version": githubApiVersion,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const conflict = response.status === 409 || response.status === 422;
    throw new ContentMutationError(
      conflict ? "github_conflict" : "github_request_failed",
      conflict ? "The repository changed during deletion. Please retry." : "GitHub rejected the article deletion request.",
      conflict ? 409 : 502,
    );
  }
  return response.json();
}

function articlePaths(tree, slugs) {
  const files = tree.filter((entry) => entry.type === "blob").map((entry) => entry.path);
  const paths = new Set();
  for (const slug of slugs) {
    const markdownPrefix = `content/articles/${slug}.`;
    const markdown = files.filter((path) => path === `${markdownPrefix}zh.md` || path === `${markdownPrefix}en.md`);
    if (!markdown.length) {
      throw new ContentMutationError("article_not_found", `Published article '${slug}' no longer exists.`, 404);
    }
    markdown.forEach((path) => paths.add(path));
    files.filter((path) => path.startsWith(`public/images/articles/${slug}/`)).forEach((path) => paths.add(path));
  }
  return [...paths].sort();
}

async function deleteR2Media(env, slugs) {
  if (!env.MEDIA?.list || !env.MEDIA?.delete) return { count: 0, failed: false };
  let count = 0;
  try {
    for (const slug of slugs) {
      let cursor;
      do {
        const page = await env.MEDIA.list({ prefix: `articles/${slug}/`, cursor });
        const keys = page.objects.map((object) => object.key);
        if (keys.length) {
          await env.MEDIA.delete(keys);
          count += keys.length;
        }
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    }
    return { count, failed: false };
  } catch {
    return { count, failed: true };
  }
}

async function triggerDeployment(env) {
  if (!env.CLOUDFLARE_DEPLOY_HOOK) return { triggered: false, failed: false };
  try {
    const requestFetch = env.DEPLOY_FETCH ?? fetch;
    const response = await requestFetch(env.CLOUDFLARE_DEPLOY_HOOK, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) return { triggered: false, failed: true };
    return {
      triggered: true,
      failed: false,
      buildId: typeof body.result?.build_uuid === "string" ? body.result.build_uuid : undefined,
    };
  } catch {
    return { triggered: false, failed: true };
  }
}

export function validateArticleSlugs(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const slugs = [...new Set(value)];
  return slugs.every((slug) => typeof slug === "string" && slugPattern.test(slug)) ? slugs : null;
}

export async function unpublishArticles(env, slugs) {
  const { repository, branch } = repositoryConfig(env);
  const encodedBranch = branch.split("/").map(encodeURIComponent).join("/");
  const reference = await githubRequest(env, repository, `/git/ref/heads/${encodedBranch}`);
  const headSha = reference.object?.sha;
  if (!headSha) throw new ContentMutationError("github_response_invalid", "GitHub returned an invalid branch reference.");
  const commit = await githubRequest(env, repository, `/git/commits/${headSha}`);
  const baseTree = commit.tree?.sha;
  if (!baseTree) throw new ContentMutationError("github_response_invalid", "GitHub returned an invalid commit.");
  const tree = await githubRequest(env, repository, `/git/trees/${baseTree}?recursive=1`);
  if (tree.truncated || !Array.isArray(tree.tree)) {
    throw new ContentMutationError("github_tree_incomplete", "GitHub could not return the complete repository tree.");
  }
  const deletedPaths = articlePaths(tree.tree, slugs);
  const nextTree = await githubRequest(env, repository, "/git/trees", {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTree,
      tree: deletedPaths.map((path) => ({ path, mode: "100644", type: "blob", sha: null })),
    }),
  });
  if (!nextTree.sha) throw new ContentMutationError("github_response_invalid", "GitHub returned an invalid tree.");
  const nextCommit = await githubRequest(env, repository, "/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message: `content: unpublish ${slugs.join(", ")}`,
      tree: nextTree.sha,
      parents: [headSha],
    }),
  });
  if (!nextCommit.sha) throw new ContentMutationError("github_response_invalid", "GitHub returned an invalid commit.");
  await githubRequest(env, repository, `/git/refs/heads/${encodedBranch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: nextCommit.sha, force: false }),
  });

  const [media, deployment] = await Promise.all([deleteR2Media(env, slugs), triggerDeployment(env)]);
  return {
    commitSha: nextCommit.sha,
    commitUrl: `https://github.com/${repository}/commit/${nextCommit.sha}`,
    deletedPaths,
    media,
    deployment,
  };
}
