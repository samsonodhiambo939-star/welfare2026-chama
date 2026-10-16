/* WELFARE TEAM 2026 - Central Store
   Constitution-driven rules + localStorage persistence + 2-step approval workflow
   Treasurer (stage 1) -> Chairman (stage 2 final) -> posted
*/
const DB_KEY = "welfare2026_db_v1";
const SESSION_KEY = "welfare2026_session_v1";
const MEMBER_SHARED_PASSWORD = "Welfare@2026";
const CONSTITUTION_MEMBERS = [
  "Maurice Juma","Willis Nyamiwa","Tobias Osielo","Grace Achieng",
  "Ronald Otieno","Nick Ojwando","Monica Agwa","Mildred Wambura",
  "Kevin Maingi","Monica Kanuu","Josephine Omollo","Esther Makhulo"
];
function validatePassword(pw){
  pw = String(pw||"");
  const r = {
    len: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw)
  };
  r.valid = r.len && r.upper && r.lower && r.number && r.special;
  return r;
}
function ensureConstitutionMembers(db){
  let changed = false;
  CONSTITUTION_MEMBERS.forEach(function(name,i){
    const uname = name.toLowerCase().replace(/[^a-z ]/g,"").trim().split(/\s+/).join(".");
    let u = db.users.find(x=>x.username.toLowerCase()===uname);
    if(!u){
      db.users.push({ id: uid("u"), fullName:name, username:uname, password:MEMBER_SHARED_PASSWORD, role:"member", phone:"", idNumber:"", photo:"", status:"active", joinedDate: todayISO(), mustChangePwd:false });
      changed = true;
    }
  });
  return changed;
}

const RULES = {
  groupName: "WELFARE TEAM 2026",
  registrationFee: 2000,
  monthlySitting: 3000,
  emergencyFund: 10000,
  emergencyDeadlineMonths: 3,
  funeral: {
    principal: 5000,
    principalBeneficiary: 4000,
    parentGuardian: 3000,
    inLaw: 1500,
    missedFuneralFine: 2000,
    poorAttendanceFine: 2000
  },
  health: { member: 1000, family: 500, minAdmissionDays: 3 },
  loans: {
    normal: { max: 20000, months: 3, ratePm: 0.10, label: "Normal Loan (Short-term)" },
    special: { months: 6, ratePm: 0.20, label: "Special Loan (Long-term)" }
  },
  fines: {
    disturbance: 500, insult: 1000, funeralAbsence: 2000,
    phoneMotherTongue: 100, apology: 200, absentNoApology: 300,
    lateness: 100, absent: 200, challengeFee: 300
  },
  meetings: { generalDay: "Every 3rd Sunday", agmDeadline: "31st December", quorum: "3/4 members" },
  bank: "EQUITY BANK OF KENYA (or as agreed)",
  termYears: 1
};

const CONTRIB_TYPES = [
  { v: "monthly", label: "Monthly Sitting — Ksh 3,000", def: 3000 },
  { v: "registration", label: "Registration Fee — Ksh 2,000", def: 2000 },
  { v: "emergency", label: "Emergency Fund — Ksh 10,000", def: 10000 },
  { v: "excess_savings", label: "Excess Savings (refundable end-year)", def: 0 },
  { v: "funeral_principal", label: "Funeral — Loss of Principal (5,000)", def: 5000 },
  { v: "funeral_beneficiary", label: "Funeral — Principal Beneficiary (4,000)", def: 4000 },
  { v: "funeral_parent", label: "Funeral — Parent/Guardian (3,000)", def: 3000 },
  { v: "funeral_inlaw", label: "Funeral — In-law (1,500)", def: 1500 },
  { v: "health_member", label: "Health — Sick Member (1,000)", def: 1000 },
  { v: "health_family", label: "Health — Spouse/Child (500)", def: 500 },
  { v: "fine", label: "Fine Payment", def: 0 },
  { v: "loan_repayment", label: "Loan Repayment", def: 0 },
  { v: "other", label: "Other / Arrears", def: 0 }
];

function uid(p){ return p + "_" + Date.now().toString(36) + Math.floor(Math.random()*9999); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function money(n){ n = Number(n||0); return "Ksh " + n.toLocaleString("en-KE"); }
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function seedDB(){
  const members = CONSTITUTION_MEMBERS;
  const users = [
    { id:"u_chairman", fullName:"Chairman (Admin)", username:"chairman", password:"chairman2026", role:"chairman", phone:"—", idNumber:"—", photo:"", status:"active", joinedDate: todayISO() },
    { id:"u_treasurer", fullName:"Treasurer (Admin)", username:"treasurer", password:"treasurer2026", role:"treasurer", phone:"—", idNumber:"—", photo:"", status:"active", joinedDate: todayISO() }
  ];
  members.forEach(function(name,i){
    const uname = name.toLowerCase().replace(/[^a-z ]/g,"").trim().split(/\s+/).join(".");
    users.push({ id:"u_m"+(i+1), fullName:name, username:uname, password:MEMBER_SHARED_PASSWORD, role:"member", phone:"", idNumber:"", photo:"", status:"active", joinedDate: todayISO(), mustChangePwd:false });
  });
  return {
    v:1, seq:100,
    users: users,
    contributions: [],
    loans: [],
    fines: [],
    cases: [],
    meetings: [
      { id:"mt_seed1", title:"General Meeting — Monthly Sitting", type:"general", date: thirdSunday(new Date().getFullYear(), new Date().getMonth()), venue:"Rotational hosting (see roster)", agenda:"Monthly sittings Ksh 3,000, welfare cases, loans, fines, AOB", minutes:"", attendance:{} },
      { id:"mt_seed2", title:"Annual General Meeting (AGM)", type:"agm", date: new Date().getFullYear()+"-12-31", venue:"To be communicated", agenda:"Annual financial report, elections of Chair/Secretary/Treasurer + 2 welfare leaders, AOB", minutes:"", attendance:{} }
    ],
    notifications: [
      { id:"n0", to:"all", message:"Welcome to WELFARE TEAM 2026 chama system. Members record payments after paying to the chama account. Treasurer approves first, Chairman gives final approval.", date: todayISO(), readBy:[] }
    ]
  };
}
function thirdSunday(y,m){
  let d = new Date(y,m,1); let count=0;
  while(true){ if(d.getDay()===0) count++; if(count===3) break; d.setDate(d.getDate()+1); }
  return d.toISOString().slice(0,10);
}
function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw){ const s=seedDB(); localStorage.setItem(DB_KEY, JSON.stringify(s)); return s; }
    const db = JSON.parse(raw);
    if(ensureConstitutionMembers(db)){ saveDB(db); }
    return db;
  }
  catch(e){ const s=seedDB(); return s; }
}
function saveDB(db){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function resetDB(){ localStorage.removeItem(DB_KEY); return loadDB(); }
function getSession(){ try{ return JSON.parse(localStorage.getItem(SESSION_KEY)||"null"); }catch(e){ return null; } }
function setSession(s){ if(!s) localStorage.removeItem(SESSION_KEY); else localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function currentUser(){
  const s = getSession(); if(!s) return null;
  const db = loadDB(); return db.users.find(u=>u.id===s.userId) || null;
}
function requireAuth(role){
  const u = currentUser();
  if(!u){ location.href = "index.html"; return null; }
  if(role){
    const ok = Array.isArray(role) ? role.includes(u.role) : u.role===role;
    if(!ok){ alert("Access denied for role: "+u.role); location.href = u.role==="member" ? "member.html" : "admin.html"; return null; }
  }
  return u;
}
function notify(db, to, message){
  db.notifications.unshift({ id: uid("n"), to: to, message: message, date: todayISO(), readBy: [] });
}
/* Loan maths — flat monthly interest per constitution */
function loanQuote(kind, principal){
  const cfg = RULES.loans[kind];
  const P = Number(principal||0);
  const total = Math.round(P + (P * cfg.ratePm * cfg.months));
  const monthly = Math.round(total / cfg.months);
  return { principal:P, ratePm:cfg.ratePm, months:cfg.months, total:total, monthly:monthly };
}
function memberSavings(db, memberId){
  return db.contributions.filter(c=>c.memberId===memberId && c.status==="approved" && ["monthly","excess_savings","emergency"].includes(c.type))
    .reduce((a,c)=>a+Number(c.amount||0),0);
}
function memberTotals(db, memberId){
  const approved = db.contributions.filter(c=>c.memberId===memberId && c.status==="approved");
  const pending = db.contributions.filter(c=>c.memberId===memberId && (c.status==="pending_treasurer"||c.status==="pending_chairman"));
  return {
    savings: approved.filter(c=>["monthly","excess_savings","emergency"].includes(c.type)).reduce((a,c)=>a+ +c.amount,0),
    welfare: approved.filter(c=>String(c.type).startsWith("funeral")||String(c.type).startsWith("health")).reduce((a,c)=>a+ +c.amount,0),
    finesPaid: approved.filter(c=>c.type==="fine").reduce((a,c)=>a+ +c.amount,0),
    loanRepaid: approved.filter(c=>c.type==="loan_repayment").reduce((a,c)=>a+ +c.amount,0),
    pendingCount: pending.length
  };
}
function loanBalance(db, loan){
  const repaid = db.contributions.filter(c=>c.loanId===loan.id && c.status==="approved" && c.type==="loan_repayment").reduce((a,c)=>a+Number(c.amount||0),0);
  return { repaid: repaid, balance: Math.max(0, Number(loan.totalPayable||0) - repaid) };
}
