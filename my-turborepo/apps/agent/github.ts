import { createPrivateKey, sign } from "node:crypto";

const GITHUB_API = "https://api.github.com";

export type GitHubAppConfig = {
  appId: string;
  // PEM contents of the private key downloaded from the GitHub App settings page
  privateKey: string;
};

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

// ---------------------------------- createAppJwt ----------------------------------

// A short-lived (max 10 min) JWT that authenticates as the GitHub App itself.
// It can only be used to mint installation tokens, not to touch repos.
function createAppJwt({ appId, privateKey }: GitHubAppConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // iat is backdated to tolerate clock drift between us and GitHub
  const payload = base64url(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }),
  );
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    createPrivateKey(privateKey),
  );
  return `${header}.${payload}.${base64url(signature)}`;
}

// ---------------------------------- githubRequest ----------------------------------

async function githubRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub ${init.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`,
    );
  }

  return (response.status === 204 ? undefined : await response.json()) as T;
}

export type InstallationToken = {
  token: string;
  expiresAt: string;
};

// ---------------------------------- createInstallationToken ----------------------------------
// createInstallationToken takes installationId -> and from github gets access token -> that has permissions to write contents, pull_requests

// Mints a 1-hour installation token scoped to a single repo with only the
// permissions the agent needs to push a branch and open a PR.
export async function createInstallationToken(
  config: GitHubAppConfig,
  installationId: string,
  repo: string,
): Promise<InstallationToken> {
  const result = await githubRequest<{ token: string; expires_at: string }>(
    `/app/installations/${installationId}/access_tokens`,
    createAppJwt(config),
    {
      method: "POST",
      body: JSON.stringify({
        repositories: [repo],
        permissions: { contents: "write", pull_requests: "write" },
      }),
    },
  );

  return { token: result.token, expiresAt: result.expires_at };
}

// ---------------------------------- revokeInstallationToken ----------------------------------
export async function revokeInstallationToken(token: string) {
  await githubRequest<void>("/installation/token", token, { method: "DELETE" });
}

// ---------------------------------- getAppBotIdentity ----------------------------------

// The "<slug>[bot]" identity, so commits made by the agent are attributed to the app.
// The app JWT only works on /app endpoints, so the user lookup uses the installation token.
export async function getAppBotIdentity(
  config: GitHubAppConfig,
  installationToken: string,
) {
  const app = await githubRequest<{ slug: string }>(
    "/app",
    createAppJwt(config),
  );
  const login = `${app.slug}[bot]`;
  const user = await githubRequest<{ id: number }>(
    `/users/${encodeURIComponent(login)}`,
    installationToken,
  );
  return { name: login, email: `${user.id}+${login}@users.noreply.github.com` };
}
