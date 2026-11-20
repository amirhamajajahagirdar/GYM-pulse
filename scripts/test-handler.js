const fs = require('fs');
const path = require('path');
const { Readable, PassThrough } = require('stream');

const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const handlerCode = serverCode.replace(/server\.listen[\s\S]*$/, 'module.exports = { server };');
const m = { exports: {} };
new Function('require','module','exports','__dirname','__filename', handlerCode)(
  require, m, m.exports, path.join(__dirname,'..'), path.join(__dirname,'..','server.js')
);
const server = m.exports.server;

function req(method, url, body) {
  return new Promise(resolve => {
    const rq = new Readable({ read() { if (body) this.push(JSON.stringify(body)); this.push(null); } });
    rq.method = method; rq.url = url;
    rq.headers = { 'content-type': 'application/json', 'host': 'localhost' };
    let status = 200; const hdrs = {}; let raw = '';
    const rs = new PassThrough();
    rs.writeHead = (c, h) => { status = c; Object.assign(hdrs, h||{}); };
    rs.setHeader = (k, v) => { hdrs[k] = v; };
    rs.on('data', c => raw += c);
    rs.on('end', () => resolve({ status, body: raw ? JSON.parse(raw) : {} }));
    server.emit('request', rq, rs);
  });
}

async function run() {
  console.log('Running integration tests against clean (zero-data) server...\n');

  // 1. Stats on empty DB
  const r1 = await req('GET', '/api/dashboard/stats');
  console.log(`1. Dashboard stats: active=${r1.body.activeHeadcount}, visits=${r1.body.visitsToday}, members=${r1.body.totalMembers}`);
  if (r1.status !== 200) throw new Error('Stats failed');

  // 2. Enroll athlete
  const r2 = await req('POST', '/api/members', { name:'Test Athlete', plan:'Annual Unlimited', coach:'Test Coach', phone:'+1 555 0001', email:'test@test.com' });
  console.log(`2. Enroll: ${r2.body.member?.name} → ${r2.body.member?.id}`);
  if (r2.status !== 201) throw new Error('Enroll failed');
  const memberId = r2.body.member.id;

  // 3. Check-in by ID
  const r3 = await req('POST', '/api/attendance/checkin', { memberId, gate: 'Front Turnstile' });
  console.log(`3. Check-in: ${r3.body.message}`);
  if (r3.status !== 201) throw new Error('Check-in failed');

  // 4. Duplicate prevention
  const r4 = await req('POST', '/api/attendance/checkin', { memberId });
  console.log(`4. Duplicate blocked: ${r4.body.error}`);
  if (r4.status !== 400) throw new Error('Duplicate not blocked');

  // 5. Live floor
  const r5 = await req('GET', '/api/attendance/live');
  console.log(`5. Live: headcount=${r5.body.headcount}, athlete=${r5.body.sessions[0]?.memberName}`);
  if (r5.body.headcount !== 1) throw new Error('Live headcount wrong');

  // 6. Dashboard after check-in
  const r6 = await req('GET', '/api/dashboard/stats');
  console.log(`6. Stats after check-in: active=${r6.body.activeHeadcount}, visits=${r6.body.visitsToday}`);

  // 7. Check-out
  const sessionId = r5.body.sessions[0].id;
  const r7 = await req('POST', '/api/attendance/checkout', { sessionId });
  console.log(`7. Check-out: ${r7.body.message}`);
  if (r7.status !== 200) throw new Error('Check-out failed');

  // 8. Stats after checkout
  const r8 = await req('GET', '/api/dashboard/stats');
  console.log(`8. Stats after checkout: active=${r8.body.activeHeadcount}, visits=${r8.body.visitsToday}, avgDwell=${r8.body.avgDwell}`);
  if (r8.body.activeHeadcount !== 0) throw new Error('Active should be 0 after checkout');
  if (r8.body.visitsToday !== 1) throw new Error('visitsToday should be 1');

  // 9. QR token
  const r9 = await req('GET', `/api/qr/token/${memberId}`);
  console.log(`9. QR token for ${r9.body.member?.name}: ${r9.body.token?.slice(0, 24)}…`);
  if (!r9.body.token) throw new Error('QR failed');

  // 10. Delete athlete
  const r10 = await req('DELETE', `/api/members/${memberId}`);
  console.log(`10. Delete: ${r10.body.message}`);
  if (r10.status !== 200) throw new Error('Delete failed');

  // 11. Verify deleted
  const r11 = await req('GET', '/api/members');
  console.log(`11. After delete: total members = ${r11.body.total}`);
  if (r11.body.total !== 0) throw new Error('Delete did not work');

  console.log('\n✓ ALL 11 TESTS PASSED — Server is fully functional\n');
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
