export const origin = process.env.DEMO_ORIGIN ?? 'http://localhost:3000';
export const password = process.env.DEMO_ACCOUNT_PASSWORD;
if (!password) throw new Error('DEMO_ACCOUNT_PASSWORD is required');
export async function client(username) {
  const cookies = new Map();
  async function call(method, path, body, extra = {}) {
    const headers = {Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), ...extra};
    if (cookies.has('XSRF-TOKEN')) headers['X-XSRF-TOKEN'] = decodeURIComponent(cookies.get('XSRF-TOKEN'));
    const multipart = body instanceof FormData;
    if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + path, {method, headers, signal: AbortSignal.timeout(660000),
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body)});
    for (const cookie of response.headers.getSetCookie()) {
      const first=cookie.split(';')[0], i=first.indexOf('='); cookies.set(first.slice(0,i),first.slice(i+1));
    }
    if (!response.ok) {
      const problem=await response.json().catch(()=>({}));
      const error=new Error(`${method} ${path}: ${response.status} ${problem.detail ?? ''}`);
      error.status=response.status; throw error;
    }
    if(response.status===204) return null;
    return response.headers.get('content-type')?.includes('json') ? response.json() : Buffer.from(await response.arrayBuffer());
  }
  await call('GET','/api/installation');
  try { await call('GET','/api/auth/me'); } catch(e) { if(e.status!==401) throw e; }
  await call('POST','/api/auth/login',{username,password});
  return call;
}
export async function waitForApp() {
  for(let i=0;i<120;i++) {
    try { if((await fetch(origin+'/actuator/health',{signal:AbortSignal.timeout(3000)})).ok) return; } catch {}
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw new Error('Backend did not become ready in 4 minutes');
}
