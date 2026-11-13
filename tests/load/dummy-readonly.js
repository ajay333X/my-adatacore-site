// Adatacore read-only capacity baseline. NEVER point at production.
// This measures public page delivery, NOT authenticated task throughput.
import http from 'k6/http';
import { check, sleep } from 'k6';

const base = (__ENV.DUMMY_BASE_URL || '').replace(/\/$/, '');
const agreed = __ENV.DUMMY_ISOLATED_ENV === 'YES';
const level = Number(__ENV.DUMMY_VUS || 25);
const allowed = [25, 50, 100, 250, 500].includes(level);
const match = /^https:\/\/([^\/?#]+)\/?$/.exec(base);
if (!match) throw new Error('Set DUMMY_BASE_URL to an isolated HTTPS staging origin');
const host = match[1].toLowerCase();
const forbidden = ['adatacore.com','www.adatacore.com',
 'my-adatacore-fl-ajays-projects-42da78a5.vercel.app',
 'my-adatacore-fl-git-main-ajays-projects-42da78a5.vercel.app'];
if (!agreed || !allowed || forbidden.includes(host) ||
    !(host.endsWith('.vercel.app') || host.endsWith('.internal'))) {
  throw new Error('Safety stop: isolated staging confirmation, valid staging URL and allowed VUs required');
}
export const options = {
  scenarios: { baseline: { executor: 'ramping-vus', startVUs: 0,
    stages: [{duration:'30s',target:level},{duration:'2m',target:level},{duration:'30s',target:0}],
    gracefulRampDown:'15s' } },
  thresholds: {
    http_req_failed: [{threshold:'rate<0.01',abortOnFail:true,delayAbortEval:'30s'}],
    http_req_duration: ['p(95)<1500'],
    checks: ['rate>0.99']
  },
  discardResponseBodies: true,
  userAgent: 'Adatacore-Isolated-Capacity-Test/1.0',
};
const pages = ['/', '/contributors', '/auth'];
export default function () {
  const path = pages[(__VU + __ITER) % pages.length];
  const res = http.get(base + path, { redirects: 0, timeout:'10s', tags:{page:path} });
  check(res, { 'page reachable': r => r.status === 200 || r.status === 301 || r.status === 302 || r.status === 307 || r.status === 308 });
  sleep(1 + Math.random() * 3);
}
