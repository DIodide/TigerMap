/** Cloudflare Pages Function — proxies /api/* to the EC2 backend. */
const API_ORIGIN = "http://54.147.149.212";

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const target = `${API_ORIGIN}${url.pathname}${url.search}`;

  const headers = new Headers();
  headers.set("Host", "54.147.149.212");
  headers.set("Accept", request.headers.get("Accept") || "*/*");
  if (request.headers.has("Content-Type")) {
    headers.set("Content-Type", request.headers.get("Content-Type")!);
  }

  const res = await fetch(target, {
    method: request.method,
    headers,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
  });

  const response = new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });

  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
};
