/** Cloudflare Pages Function — proxies /api/* to the EC2 backend. */

interface Env {
  API_HOST: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const host = env.API_HOST || "ec2-54-147-149-212.compute-1.amazonaws.com";
  const origin = `http://${host}`;

  const url = new URL(request.url);
  const target = `${origin}${url.pathname}${url.search}`;

  const headers = new Headers();
  headers.set("Host", host);
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
