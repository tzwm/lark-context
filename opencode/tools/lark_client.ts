interface LarkTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

let cachedToken: string | null = null;
let tokenExpireTime: number | null = null;

export async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  // 如果 token 还在有效期内（预留 60 秒缓冲），直接返回缓存的 token
  if (cachedToken && tokenExpireTime && Date.now() < tokenExpireTime - 60000) {
    return cachedToken;
  }

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });

  const data = (await res.json()) as LarkTokenResponse;

  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Failed to get access token: ${data.msg}`);
  }

  cachedToken = data.tenant_access_token;
  // expire 是秒数，转换为毫秒时间戳
  tokenExpireTime = Date.now() + (data.expire || 7200) * 1000;

  return cachedToken;
}

export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpireTime = null;
}

export async function larkRequest(
  appId: string,
  appSecret: string,
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> {
  const accessToken = await getTenantAccessToken(appId, appSecret);

  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://open.feishu.cn/open-apis${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return res.json();
}
