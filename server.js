// GymPulse Backend Application Server
// Zero-dependency native Node.js HTTP server + REST API + JSON Database

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || process.argv[2] || 5000;
const DATA_FILE = path.join(__dirname, 'data', 'store.json');
const SECRET_KEY = process.env.GYMPULSE_SECRET_KEY || crypto.randomBytes(32).toString('hex');

// -------------------------------------------------------------
// CLEAN DATA STORE INITIALIZATION
// -------------------------------------------------------------
function getCleanStore() {
  return {
    gymInfo: {
      name: "GYMPULSE ATHLETICS",
      branch: "Main Performance Facility",
      tagline: "Presence & Facility Intelligence",
      capacity: 60,
      currency: "USD"
    },
    members: [],
    liveSessions: [],
    sessionHistory: []
  };
}

function getStarterDemoMembers() {
  const now = Date.now();
  return [
    {
      id: "GP-1001",
      name: "Dr. Henrik Lindqvist",
      email: "henrik.lindqvist@karolinska.se",
      phone: "+46 70 123 4567",
      plan: "Annual Unlimited",
      status: "Active",
      joinedDate: "Feb 2025",
      validThrough: "28 Feb 2027",
      assignedCoach: "Freja Møller",
      focus: "Zone 2 Cardio & Spine Decompression",
      medicalClearance: "Cleared · Physiotherapy Approved",
      emergencyContact: "Elena Lindqvist (+46 70 123 4567)",
      guestPasses: 3,
      coachNotes: [
        { id: "note-1", date: "Today", author: "Coach Freja Møller", text: "Maintained 4 sessions weekly. Form on deadbugs and pallof press is solid." }
      ],
      attendanceHistory: []
    },
    {
      id: "GP-1002",
      name: "Freja Solberg",
      email: "freja.solberg@nordicmove.se",
      phone: "+46 72 987 6543",
      plan: "Performance Lab",
      status: "Active",
      joinedDate: "Aug 2024",
      validThrough: "15 Aug 2027",
      assignedCoach: "Freja Møller",
      focus: "Lactate Clearance & Olympic Lifting",
      medicalClearance: "Cleared · Elite Conditioning",
      emergencyContact: "Magnus Solberg (+46 72 987 0000)",
      guestPasses: 5,
      coachNotes: [
        { id: "note-2", date: "Yesterday", author: "Coach Freja Møller", text: "SkiErg pacing test completed: 1000m in 3:38 with controlled cadence." }
      ],
      attendanceHistory: []
    },
    {
      id: "GP-1003",
      name: "Julian Chen",
      email: "julian.chen@designlab.se",
      phone: "+46 76 555 4321",
      plan: "Monthly Foundation",
      status: "Active",
      joinedDate: "Jan 2026",
      validThrough: "31 Dec 2026",
      assignedCoach: "Lukas Berg",
      focus: "Joint Mobility & Kettlebells",
      medicalClearance: "Cleared",
      emergencyContact: "Mei Chen (+46 76 555 1111)",
      guestPasses: 2,
      coachNotes: [],
      attendanceHistory: []
    }
  ];
}

// Load or initialize store
function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = getCleanStore();
      saveStore(initial);
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.gymInfo) parsed.gymInfo = getCleanStore().gymInfo;
    if (!Array.isArray(parsed.members)) parsed.members = [];
    if (!Array.isArray(parsed.liveSessions)) parsed.liveSessions = [];
    if (!Array.isArray(parsed.sessionHistory)) parsed.sessionHistory = [];
    return parsed;
  } catch (err) {
    console.error('Error reading store, initializing clean store:', err);
    return getCleanStore();
  }
}

function saveStore(data) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save store:', err);
  }
}

// -------------------------------------------------------------
// HELPER UTILITIES
// -------------------------------------------------------------
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function calculateDwellMinutes(isoString) {
  if (!isoString) return 0;
  const diff = Date.now() - new Date(isoString).getTime();
  return Math.max(1, Math.round(diff / 60000));
}

function isToday(isoString) {
  if (!isoString) return false;
  return new Date(isoString).toDateString() === new Date().toDateString();
}

// -------------------------------------------------------------
// HTTP REQUEST ROUTER
// -------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // -----------------------------------------------------------
  // 1. DASHBOARD & ANALYTICS STATS (REAL TIME)
  // -----------------------------------------------------------
  if (pathname === '/api/dashboard/stats' && method === 'GET') {
    const store = loadStore();
    const liveSessions = store.liveSessions;
    const liveCount = liveSessions.length;
    const capacity = store.gymInfo.capacity || 60;
    const loadPercentage = Math.min(100, Math.round((liveCount / capacity) * 100));

    // Real visits today: completed sessions today + active sessions started today
    const completedToday = store.sessionHistory.filter(s => isToday(s.checkedInAt));
    const liveToday = liveSessions.filter(s => isToday(s.checkedInAt));
    const visitsToday = completedToday.length + liveToday.length;

    // Real average dwell time of completed sessions today
    let avgDwellDisplay = "—";
    if (completedToday.length > 0) {
      const totalDwell = completedToday.reduce((sum, s) => sum + (s.dwellMinutes || 0), 0);
      const avgMins = Math.round(totalDwell / completedToday.length);
      avgDwellDisplay = `${avgMins} min`;
    }

    // Real hourly cadence: map check-ins today into 8 standard facility buckets
    const hours = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];
    const allTodaySessions = [...completedToday, ...liveToday];
    const hourCounts = {};
    hours.forEach(h => { hourCounts[h] = 0; });

    allTodaySessions.forEach(s => {
      if (s.checkedInAt) {
        const h = new Date(s.checkedInAt).getHours();
        if (h < 7) hourCounts["06:00"]++;
        else if (h < 9) hourCounts["08:00"]++;
        else if (h < 11) hourCounts["10:00"]++;
        else if (h < 13) hourCounts["12:00"]++;
        else if (h < 15) hourCounts["14:00"]++;
        else if (h < 17) hourCounts["16:00"]++;
        else if (h < 19) hourCounts["18:00"]++;
        else hourCounts["20:00"]++;
      }
    });

    const maxCount = Math.max(...Object.values(hourCounts), 1);
    const currentHour = new Date().getHours();
    const hourlyCadence = hours.map(h => {
      const hNum = parseInt(h.split(':')[0], 10);
      const isCurrent = currentHour >= hNum && currentHour < hNum + 2;
      const count = hourCounts[h];
      const percent = visitsToday === 0 ? 0 : Math.round((count / maxCount) * 100);
      return { hour: h, count, percent, current: isCurrent };
    });

    // Recent activity stream (last 5 sessions)
    const recentActivity = [...store.liveSessions.map(s => ({
      id: s.id,
      name: s.memberName,
      type: 'CHECK_IN',
      time: s.checkedInAt,
      detail: `${s.gate} · In Session`
    })), ...store.sessionHistory.slice(0, 5).map(s => ({
      id: s.id,
      name: s.memberName,
      type: 'CHECK_OUT',
      time: s.checkedOutAt || s.checkedInAt,
      detail: `${s.dwellMinutes || 0} min session completed`
    }))].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 5);

    return sendJson(res, 200, {
      gymInfo: store.gymInfo,
      activeHeadcount: liveCount,
      capacity: capacity,
      loadPercentage: loadPercentage,
      visitsToday: visitsToday,
      avgDwell: avgDwellDisplay,
      totalMembers: store.members.length,
      hourlyCadence: hourlyCadence,
      recentActivity: recentActivity
    });
  }

  // -----------------------------------------------------------
  // 2. GYM SETTINGS API
  // -----------------------------------------------------------
  if (pathname === '/api/gym/settings' && method === 'GET') {
    const store = loadStore();
    return sendJson(res, 200, store.gymInfo);
  }

  if (pathname === '/api/gym/settings' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const store = loadStore();
      if (body.name) store.gymInfo.name = body.name.trim();
      if (body.branch) store.gymInfo.branch = body.branch.trim();
      if (body.capacity && Number(body.capacity) > 0) {
        store.gymInfo.capacity = Number(body.capacity);
      }
      saveStore(store);
      return sendJson(res, 200, { success: true, gymInfo: store.gymInfo });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // -----------------------------------------------------------
  // 3. MEMBER DIRECTORY API
  // -----------------------------------------------------------
  if (pathname === '/api/members' && method === 'GET') {
    const store = loadStore();
    const q = (parsedUrl.searchParams.get('search') || '').toLowerCase().trim();
    const statusFilter = parsedUrl.searchParams.get('status') || 'all';

    let list = store.members.map(m => {
      const isInside = store.liveSessions.some(s => s.memberId === m.id);
      return {
        ...m,
        liveInside: isInside,
        displayStatus: isInside ? "In Session" : (m.status || "Active")
      };
    });

    if (q) {
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.plan && m.plan.toLowerCase().includes(q)) ||
        (m.assignedCoach && m.assignedCoach.toLowerCase().includes(q)) ||
        (m.phone && m.phone.includes(q))
      );
    }

    if (statusFilter === 'active') {
      list = list.filter(m => m.liveInside);
    } else if (statusFilter === 'registered') {
      list = list.filter(m => !m.liveInside);
    }

    return sendJson(res, 200, {
      total: store.members.length,
      filteredCount: list.length,
      members: list
    });
  }

  // POST /api/members (Enroll Athlete)
  if (pathname === '/api/members' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.name || !body.name.trim()) {
        return sendJson(res, 400, { error: "Athlete name is required" });
      }

      const store = loadStore();
      const nextIdNumber = 1001 + store.members.length;
      const newId = `GP-${nextIdNumber}`;

      const now = new Date();
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const joinedFormatted = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
      
      const expiryYear = now.getFullYear() + 1;
      const validThrough = body.validThrough || `31 Dec ${expiryYear}`;

      const newMember = {
        id: newId,
        name: body.name.trim(),
        email: body.email ? body.email.trim() : `${body.name.toLowerCase().replace(/\s+/g, '.')}@gympulse.local`,
        phone: body.phone ? body.phone.trim() : 'Not provided',
        plan: body.plan || "Annual Unlimited",
        status: "Active",
        joinedDate: joinedFormatted,
        validThrough: validThrough,
        assignedCoach: body.coach || "General Staff",
        focus: body.focus || "Functional Conditioning & Movement",
        medicalClearance: body.medicalClearance || "Standard Physical Clearance",
        emergencyContact: body.emergencyContact || "Not provided",
        guestPasses: 3,
        coachNotes: [],
        attendanceHistory: []
      };

      store.members.push(newMember);
      saveStore(store);

      return sendJson(res, 201, {
        success: true,
        message: "Athlete registered successfully",
        member: newMember
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // GET /api/members/:id (Athlete Dossier)
  const memberIdMatch = pathname.match(/^\/api\/members\/([A-Za-z0-9-]+)$/);
  if (memberIdMatch && method === 'GET') {
    const memberId = memberIdMatch[1];
    const store = loadStore();
    const member = store.members.find(m => m.id === memberId);

    if (!member) {
      return sendJson(res, 404, { error: "Athlete not found" });
    }

    const isInside = store.liveSessions.some(s => s.memberId === member.id);
    return sendJson(res, 200, {
      ...member,
      liveInside: isInside,
      displayStatus: isInside ? "In Session" : (member.status || "Active")
    });
  }

  // PUT /api/members/:id (Edit Athlete)
  if (memberIdMatch && method === 'PUT') {
    try {
      const memberId = memberIdMatch[1];
      const body = await parseJsonBody(req);
      const store = loadStore();
      const member = store.members.find(m => m.id === memberId);

      if (!member) {
        return sendJson(res, 404, { error: "Athlete not found" });
      }

      if (body.name) member.name = body.name.trim();
      if (body.email) member.email = body.email.trim();
      if (body.phone) member.phone = body.phone.trim();
      if (body.plan) member.plan = body.plan;
      if (body.assignedCoach) member.assignedCoach = body.assignedCoach;
      if (body.focus) member.focus = body.focus;
      if (body.emergencyContact) member.emergencyContact = body.emergencyContact;
      if (body.medicalClearance) member.medicalClearance = body.medicalClearance;
      if (body.status) member.status = body.status;

      saveStore(store);
      return sendJson(res, 200, { success: true, member });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // DELETE /api/members/:id (Delete Athlete)
  if (memberIdMatch && method === 'DELETE') {
    const memberId = memberIdMatch[1];
    const store = loadStore();
    const idx = store.members.findIndex(m => m.id === memberId);

    if (idx === -1) {
      return sendJson(res, 404, { error: "Athlete not found" });
    }

    store.members.splice(idx, 1);
    // Also remove from live sessions if active
    store.liveSessions = store.liveSessions.filter(s => s.memberId !== memberId);
    saveStore(store);

    return sendJson(res, 200, { success: true, message: "Athlete removed from database" });
  }

  // POST /api/members/:id/notes (Add Coach Note)
  const notesMatch = pathname.match(/^\/api\/members\/([A-Za-z0-9-]+)\/notes$/);
  if (notesMatch && method === 'POST') {
    try {
      const memberId = notesMatch[1];
      const body = await parseJsonBody(req);
      if (!body.text || !body.text.trim()) {
        return sendJson(res, 400, { error: "Observation text is required" });
      }

      const store = loadStore();
      const member = store.members.find(m => m.id === memberId);
      if (!member) {
        return sendJson(res, 404, { error: "Athlete not found" });
      }

      const newNote = {
        id: "note-" + Date.now(),
        date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
        author: body.author || "Duty Coach",
        text: body.text.trim()
      };

      if (!Array.isArray(member.coachNotes)) member.coachNotes = [];
      member.coachNotes.unshift(newNote);
      saveStore(store);

      return sendJson(res, 201, { success: true, note: newNote, notes: member.coachNotes });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // -----------------------------------------------------------
  // 4. LIVE ATTENDANCE & GATE OPERATIONS
  // -----------------------------------------------------------
  if (pathname === '/api/attendance/live' && method === 'GET') {
    const store = loadStore();
    const sessions = store.liveSessions.map(s => {
      const dwellMins = calculateDwellMinutes(s.checkedInAt);
      return {
        ...s,
        dwellMinutes: dwellMins,
        dwellDisplay: `${dwellMins} min on floor`,
        timeDisplay: new Date(s.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    });

    return sendJson(res, 200, {
      headcount: sessions.length,
      capacity: store.gymInfo.capacity,
      sessions: sessions
    });
  }

  // POST /api/attendance/checkin (Real Check-In)
  if (pathname === '/api/attendance/checkin' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const store = loadStore();

      // Find member by ID or Name or QR Token
      let member = null;
      if (body.memberId) {
        member = store.members.find(m => m.id === body.memberId.trim());
      } else if (body.name) {
        const query = body.name.trim().toLowerCase();
        member = store.members.find(m =>
          m.name.toLowerCase() === query ||
          m.id.toLowerCase() === query
        );
      } else if (body.token) {
        // Parse token GP.{memberId}.{timestamp}.{hmac}
        const parts = body.token.split('.');
        if (parts.length >= 2) {
          const tId = parts[1];
          member = store.members.find(m => m.id === tId);
        }
      }

      if (!member) {
        return sendJson(res, 404, { error: "Athlete not found. Please verify member ID or enroll them first." });
      }

      // Check if already on floor
      const alreadyInside = store.liveSessions.some(s => s.memberId === member.id);
      if (alreadyInside) {
        return sendJson(res, 400, {
          error: `${member.name} (${member.id}) is already checked in on the floor.`
        });
      }

      const now = new Date();
      const newSession = {
        id: "sess-" + Date.now(),
        memberId: member.id,
        memberName: member.name,
        plan: member.plan,
        coach: member.assignedCoach,
        checkedInAt: now.toISOString(),
        gate: body.gate || "Front Turnstile Gate (QR)"
      };

      store.liveSessions.unshift(newSession);
      saveStore(store);

      return sendJson(res, 201, {
        success: true,
        message: `${member.name} successfully checked in`,
        session: {
          ...newSession,
          dwellMinutes: 1,
          dwellDisplay: "1 min on floor",
          timeDisplay: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
        headcount: store.liveSessions.length
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // POST /api/attendance/checkout (Real Checkout)
  if (pathname === '/api/attendance/checkout' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const store = loadStore();

      const idx = store.liveSessions.findIndex(s =>
        s.id === body.sessionId ||
        s.memberId === body.memberId ||
        (body.name && s.memberName.toLowerCase() === body.name.toLowerCase())
      );

      if (idx === -1) {
        return sendJson(res, 404, { error: "Active training session not found for checkout." });
      }

      const session = store.liveSessions[idx];
      store.liveSessions.splice(idx, 1);

      const dwellMins = calculateDwellMinutes(session.checkedInAt);
      const checkoutRecord = {
        ...session,
        checkedOutAt: new Date().toISOString(),
        dwellMinutes: dwellMins,
        dwellDisplay: `${dwellMins} min`
      };

      // Archive to sessionHistory
      store.sessionHistory.unshift(checkoutRecord);

      // Append to member's attendance history
      const member = store.members.find(m => m.id === session.memberId);
      if (member) {
        if (!Array.isArray(member.attendanceHistory)) member.attendanceHistory = [];
        member.attendanceHistory.unshift({
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          entry: new Date(session.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          exit: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dwell: `${dwellMins} min`,
          gate: session.gate
        });
      }

      saveStore(store);

      return sendJson(res, 200, {
        success: true,
        message: `${session.memberName} checked out (${dwellMins} min workout)`,
        session: checkoutRecord,
        headcount: store.liveSessions.length
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // -----------------------------------------------------------
  // 5. CLIENT DYNAMIC QR PASS ENGINE
  // -----------------------------------------------------------
  const qrTokenMatch = pathname.match(/^\/api\/qr\/token\/([A-Za-z0-9-]+)$/);
  if (qrTokenMatch && method === 'GET') {
    const memberId = qrTokenMatch[1];
    const store = loadStore();
    const member = store.members.find(m => m.id === memberId);

    if (!member) {
      return sendJson(res, 404, { error: "Athlete not found" });
    }

    const timestamp = Date.now();
    const hmac = crypto.createHmac('sha256', SECRET_KEY)
      .update(`${member.id}:${timestamp}`)
      .digest('hex');

    const token = `GP.${member.id}.${timestamp}.${hmac.slice(0, 16)}`;

    return sendJson(res, 200, {
      token: token,
      expiresInSeconds: 30,
      member: {
        id: member.id,
        name: member.name,
        plan: member.plan,
        validThrough: member.validThrough,
        assignedCoach: member.assignedCoach,
        recentVisits: member.attendanceHistory ? member.attendanceHistory.slice(0, 3) : []
      }
    });
  }

  // -----------------------------------------------------------
  // 6. SYSTEM UTILITIES (SEED DEMO OR RESET)
  // -----------------------------------------------------------
  if (pathname === '/api/system/seed-demo' && method === 'POST') {
    const store = loadStore();
    const starters = getStarterDemoMembers();
    // Add starters that aren't already present
    starters.forEach(s => {
      if (!store.members.some(m => m.id === s.id)) {
        store.members.push(s);
      }
    });
    saveStore(store);
    return sendJson(res, 200, { success: true, message: "Demo starter athletes loaded", total: store.members.length });
  }

  if (pathname === '/api/system/clear-all' && method === 'POST') {
    const clean = getCleanStore();
    saveStore(clean);
    return sendJson(res, 200, { success: true, message: "All data cleared to factory clean state." });
  }

  // -----------------------------------------------------------
  // 7. STATIC ASSET SERVING
  // -----------------------------------------------------------
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(path.join(__dirname, filePath));

  if (!safePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (pathname.startsWith('/api')) {
        return sendJson(res, 404, { error: 'API endpoint not found' });
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(safePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(` GymPulse Fullstack Server Running on Port ${PORT}`);
  console.log(` Local: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});

