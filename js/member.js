/* Member portal — private dashboard */
let ME = requireAuth("member");
let TAB = "overview";
document.querySelectorAll("#tabs .tab").forEach(b=>b.onclick=()=>{TAB=b.dataset.t;document.querySelectorAll("#tabs .tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");render();});
async function logout(){ try{ await apiLogout(); }catch{} setSession(null); location.href="index.html"; }
function statusPill(s){ return '<span class="pill p-'+s+'">'+s.replace(/_/g,' ')+'</span>'; }
function render(){
  const db = loadDB(); ME = db.users.find(u=>u.id===ME.id);
  meBadge.textContent = ME.fullName + " • @" + ME.username;
  const t = memberTotals(db, ME.id);
  const myLoans = db.loans.filter(l=>l.memberId===ME.id);
  let activeBal = 0; myLoans.forEach(l=>{ if(["disbursed","repaying","approved"].includes(l.status)) activeBal += loanBalance(db,l).balance; });
  kpis.innerHTML =
    kpi(money(t.savings),"My Savings (approved)")+kpi(money(t.welfare),"Welfare given")+kpi(money(activeBal),"Active loan balance")+kpi(myLoans.length+" loans • "+t.pendingCount+" pending","My activity");
  const v = document.getElementById("view");
  if(TAB==="overview") v.innerHTML = vOverview(db,t,myLoans);
  if(TAB==="record") v.innerHTML = vRecord(db);
  if(TAB==="savings") v.innerHTML = vSavings(db);
  if(TAB==="loans") v.innerHTML = vLoans(db,myLoans);
  if(TAB==="fines") v.innerHTML = vFines(db);
  if(TAB==="cases") v.innerHTML = vCases(db);
  if(TAB==="meetings") v.innerHTML = vMeetings(db);
  if(TAB==="constitution") v.innerHTML = vConstitution();
  if(TAB==="profile") v.innerHTML = vProfile(db);
  bindCommon(db);
}
function kpi(v,l){ return '<div class="kpi"><div class="v">'+v+'</div><div class="l">'+l+'</div></div>'; }
function myNotes(db){
  return db.notifications.filter(n=>n.to==="all"||n.to===ME.id||n.to==="member_"+ME.id).slice(0,8);
}
function vOverview(db,t,myLoans){
  const pend = db.contributions.filter(c=>c.memberId===ME.id && c.status.startsWith("pending")).slice().reverse();
  const appr = db.contributions.filter(c=>c.memberId===ME.id && c.status==="approved").slice(-5).reverse();
  return '<div class="grid g2"><div class="card"><h3>Notifications — posted to you</h3>'+
    (myNotes(db).map(n=>'<div class="notice" style="margin-bottom:8px">'+esc(n.message)+'<br><span class="muted">'+esc(n.date)+'</span></div>').join("")||'<p class="muted">No notifications.</p>')+
    '</div><div class="card"><h3>Constitution quick rules</h3><p class="muted">Monthly <b>Ksh 3,000</b> • Emergency <b>10,000</b> (first 3 months) • Registration <b>2,000</b><br>Normal loan ≤20K / 3mo / 10% pm • Special / 6mo / 20% pm + guarantors<br>Funeral 5,000 / 4,000 / 3,000 / 1,500 • Health 1,000 / 500 (&gt;3 days + docs)</p>'+
    '<h3>Pending (awaiting Treasurer → Chairman)</h3>'+ (pend.map(c=>'<div class="row">'+statusPill(c.status)+'<span><b>'+esc(c.type)+'</b> '+money(c.amount)+' • '+esc(c.date)+'</span></div>').join("")||'<p class="muted">Nothing pending.</p>')+
    '<h3>Recently posted</h3>'+(appr.map(c=>'<div class="row"><span class="pill p-approved">posted</span><span>'+esc(c.type)+' '+money(c.amount)+'</span></div>').join("")||'<p class="muted">No posted records yet.</p>')+'</div></div>';
}
function vRecord(db){
  const opts = CONTRIB_TYPES.map(o=>'<option value="'+o.v+'">'+esc(o.label)+'</option>').join("");
  const myActiveLoans = db.loans.filter(l=>l.memberId===ME.id && ["approved","disbursed","repaying"].includes(l.status));
  const loanOpts = myActiveLoans.map(l=>'<option value="'+l.id+'">'+esc(l.kind)+' '+money(l.principal)+' bal '+money(loanBalance(db,l).balance)+'</option>').join("");
  return '<div class="card"><h3>Record a payment (after paying to chama account)</h3><p class="muted">Pay first to the chama account (Equity Bank / M-Pesa), then record here with txn code. Treasurer verifies first, Chairman posts finally.</p>'+
  '<label>Contribution type</label><select id="f_type" onchange="autoAmt()">'+opts+'</select>'+
  '<div class="grid g2"><div><label>Amount (Ksh)</label><input id="f_amt" type="number" min="1"></div><div><label>Date paid</label><input id="f_date" type="date" value="'+todayISO()+'"></div></div>'+
  '<div class="grid g2"><div><label>Payment method</label><select id="f_method"><option>M-Pesa</option><option>Equity Bank deposit</option><option>Bank transfer</option><option>Cash to treasurer</option></select></div><div><label>M-Pesa / txn code</label><input id="f_txn" placeholder="e.g. QHX12AB34"></div></div>'+
  '<label>Sending phone / account</label><input id="f_phone" placeholder="07...">'+
  '<div id="loanRow" class="hidden"><label>Link to loan (for repayments)</label><select id="f_loan"><option value="">— select —</option>'+loanOpts+'</select></div>'+
  '<label>Notes</label><textarea id="f_notes" rows="2" placeholder="Any detail"></textarea>'+
  '<div class="row" style="margin-top:12px"><button class="btn btn-green" onclick="submitContrib()">Submit for approval</button></div><p id="fmsg" class="muted"></p></div>'+
  '<script>function autoAmt(){void 0}<\/script>';
}
function vSavings(db){
  const rows = db.contributions.filter(c=>c.memberId===ME.id).slice().reverse();
  return '<div class="card"><h3>My savings & contributions (only you see this)</h3><div class="searchbar"><input id="q" placeholder="Search type / txn..." oninput="filterRows(this.value)"></div><div style="overflow:auto"><table><tr><th>Date</th><th>Type</th><th>Amount</th><th>Txn</th><th>Status</th><th>Approvals</th></tr>'+
  rows.map(c=>'<tr class="rrow"><td>'+esc(c.date)+'</td><td>'+esc(c.type)+(c.loanId?' <span class="muted">(loan)</span>':'')+'</td><td><b>'+money(c.amount)+'</b></td><td>'+esc(c.txnCode||"—")+'</td><td>'+statusPill(c.status)+(c.rejectReason?'<br><span class="muted">'+esc(c.rejectReason)+'</span>':'')+'</td><td class="muted">'+esc(c.treasurerBy||"")+(c.chairmanBy?" → "+esc(c.chairmanBy):"")+'</td></tr>').join("")+'</table></div></div>';
}
function vLoans(db,myLoans){
  const others = db.users.filter(u=>u.role==="member"&&u.id!==ME.id&&u.status==="active");
  return '<div class="grid g2"><div class="card"><h3>Request a loan</h3><p class="muted">Normal: max 20,000, 3 months, 10%/month flat. Special: any amount within shares, 6 months, 20%/month, needs guarantors with equivalent shares.</p>'+
  '<label>Loan type</label><select id="l_kind" onchange="calcLoan()"><option value="normal">Normal (10%/mo × 3mo)</option><option value="special">Special (20%/mo × 6mo)</option></select>'+
  '<label>Principal requested</label><input id="l_amt" type="number" value="20000" oninput="calcLoan()"><div id="quote" class="notice"></div>'+
  '<label>Purpose</label><input id="l_purpose" placeholder="e.g. school fees, business stock">'+
  '<label>Guarantors (Special loan — must hold equivalent shares)</label><select id="l_g" multiple size="4">'+others.map(o=>'<option value="'+o.id+'">'+esc(o.fullName)+'</option>').join("")+'</select>'+
  '<div class="row" style="margin-top:10px"><button class="btn btn-gold" onclick="requestLoan()">Submit loan request</button></div><p id="lmsg" class="muted"></p></div>'+
  '<div class="card"><h3>My loans</h3>'+(myLoans.slice().reverse().map(l=>{const b=loanBalance(db,l);return '<div class="notice" style="margin-bottom:8px"><b>'+esc(l.kind)+' '+money(l.principal)+'</b> '+statusPill(l.status)+'<br>Total payable '+money(l.totalPayable)+' • '+money(l.monthlyInstallment)+'/mo × '+l.months+'mo<br>Repaid '+money(b.repaid)+' • Balance '+money(b.balance)+'<br><span class="muted">'+esc(l.purpose||"")+' • guarantors: '+esc((l.guarantors||[]).map(g=>{const u=db.users.find(x=>x.id===g);return u?u.fullName:g;}).join(", ")||"—")+'</span><div class="row" style="margin-top:6px"><input id="pay_'+l.id+'" type="number" placeholder="Repayment amount" style="max-width:180px"><button class="btn btn-green btn-sm" onclick="repayLoan(\''+l.id+'\')">Record repayment</button></div></div>';}).join("")||'<p class="muted">No loans yet.</p>')+'</div></div>';
}
function vFines(db){
  const fs = db.fines.filter(f=>f.memberId===ME.id).slice().reverse();
  return '<div class="card"><h3>My fines (per Chapter 8)</h3><p class="muted">Fines: disturbance 500 • insult/gossip 1,000 • funeral absence 2,000 • phone/mother-tongue 100 • lateness 100 • absent 200 • absent no apology 300. Settle before assistance.</p><table><tr><th>Date</th><th>Reason</th><th>Amount</th><th>Status</th><th></th></tr>'+
  (fs.map(f=>'<tr><td>'+esc(f.date)+'</td><td>'+esc(f.reason)+'</td><td><b>'+money(f.amount)+'</b></td><td>'+statusPill(f.status)+'</td><td>'+(f.status!=="paid"?'<button class="btn btn-green btn-sm" onclick="payFine(\''+f.id+'\')">Record payment</button>':"")+'</td></tr>').join("")||'<tr><td colspan="5" class="muted">No fines.</td></tr>')+'</table></div>';
}
function vCases(db){
  return '<div class="card"><h3>Welfare support cases (funeral / health)</h3>'+(db.cases.slice().reverse().map(c=>{
    const mine = db.contributions.find(x=>x.caseId===c.id&&x.memberId===ME.id&&x.status==="approved");
    return '<div class="notice" style="margin-bottom:8px"><b>'+esc(c.title)+'</b> '+statusPill(c.status)+'<br>Required per member: <b>'+money(c.perMember)+'</b> • '+esc(c.description||"")+'<br><span class="muted">'+esc(c.date)+'</span> • '+(mine?'<span class="pill p-approved">you paid '+money(mine.amount)+'</span>':'<span class="pill p-pending_treasurer">you have not paid</span>')+'</div>';}).join("")||'<p class="muted">No cases opened.</p>')+'</div>';
}
function vMeetings(db){
  return '<div class="card"><h3>Meetings (every 3rd Sunday • AGM by 31 Dec)</h3><table><tr><th>Date</th><th>Meeting</th><th>Venue/Host</th><th>My attendance</th></tr>'+
  db.meetings.slice().reverse().map(m=>'<tr><td>'+esc(m.date)+'</td><td><b>'+esc(m.title)+'</b><br><span class="muted">'+esc(m.agenda||"")+'</span></td><td>'+esc(m.venue||"—")+'</td><td>'+esc((m.attendance&&m.attendance[ME.id])||"—")+'</td></tr>').join("")+'</table><p class="muted">Lateness Ksh 100 • Absent Ksh 200 • Absent no apology Ksh 300 • 3 consecutive absences not allowed. Apologies via monthly contribution / WhatsApp.</p></div>';
}
function vConstitution(){
  return '<div class="card"><h3>WELFARE-2026 Constitution (summary)</h3>'+
  '<p><b>Ch1 — Name:</b> WELFARE TEAM, non-political, WhatsApp + officials, registration Ksh 2,000, 12 founding members.</p>'+
  '<p><b>Ch2 — Objectives:</b> unity; income projects; funeral (5,000 principal / 4,000 beneficiary / 3,000 parent-guardian one only / 1,500 in-law / 2,000 missed funeral); health (1,000 member / 500 family, &gt;3 days + docs); loans (Normal ≤20K 3mo 10% pm; Special 6mo 20% pm + guarantors, default → deduct members shares).</p>'+
  '<p><b>Ch3 — Membership:</b> adult HAFUNG lineage, vetted; 2,000 non-refundable; monthly 3,000; excess refundable year-end; emergency 10,000 in first 3 months.</p>'+
  '<p><b>Ch4 — Officials:</b> Chair, Secretary, Treasurer, 2 Welfare Leaders; 1-yr term; elections AGM December; 2/3 can nullify; vacancy acting + 2/3 approval.</p>'+
  '<p><b>Ch5 — Bank:</b> Equity Bank (or agreed); 3 trustees; authorising letter by Chair+Sec+Treasurer; 2 of 3 can transact.</p>'+
  '<p><b>Ch6 — Meetings:</b> General 3rd Sunday; Special anytime; AGM ≤31 Dec; quorum 3/4; 2-week notice; lateness 100; absent 200; challenge with apology + 300.</p>'+
  '<p><b>Ch7 — Branches:</b> none.</p>'+
  '<p><b>Ch8 — Conduct:</b> fines 500/1,000/2,000/100; suspension; expulsion 2/3; resignation 3 months notice, 90% shares minus debts.</p>'+
  '<p><b>Ch9/10 — Amendment/Dissolution:</b> 2/3 majority + registrar consent; liquidation on dissolution.</p></div>';
}
function vProfile(db){
  const img = ME.photo?'<img src="'+ME.photo+'" class="avatar" style="width:80px;height:80px">':"";
  return '<div class="grid g2"><div class="card"><h3>My profile</h3><div class="row">'+img+'<div><b>'+esc(ME.fullName)+'</b><br><span class="muted">@'+esc(ME.username)+' • joined '+esc(ME.joinedDate||"")+' • '+esc(ME.status)+'</span></div></div>'+
  '<label>Phone</label><input id="p_phone" value="'+esc(ME.phone||"")+'"><label>ID number</label><input id="p_id" value="'+esc(ME.idNumber||"")+'">'+
  '<label>Photo (optional)</label><input id="p_photo" type="file" accept="image/*"><div class="row" style="margin-top:10px"><button class="btn btn-green" onclick="saveProfile()">Save</button></div><p class="muted">Logins are created/reset by admin. Contact Treasurer/Chairman if locked out.</p></div>'+
  '<div class="card"><h3>Change password</h3><p class="muted">Must be 8+ characters with CAPITAL, small, number & special character. Green tick = passed.</p>'+
  '<label>Current password</label><input id="cp_old" type="password">'+
  '<label>New password</label><input id="cp_new" type="password" oninput="checkPwdLive()">'+
  '<ul class="pwd-list"><li id="pw_len">8+ characters</li><li id="pw_up">Capital letter (A-Z)</li><li id="pw_low">Small letter (a-z)</li><li id="pw_num">Number (0-9)</li><li id="pw_sp">Special character (!@#$…)</li><li id="pw_match">New + confirm match</li></ul>'+
  '<label>Confirm new password</label><input id="cp_confirm" type="password" oninput="checkPwdLive()">'+
  '<div class="row" style="margin-top:10px"><button class="btn btn-gold" id="cp_btn" onclick="changePwd()">Update password</button></div><p id="cp_msg" class="muted"></p></div></div>';
}
function checkPwdLive(){
  const v = validatePassword((document.getElementById("cp_new")||{}).value||"");
  const match = ((document.getElementById("cp_new")||{}).value||"") === ((document.getElementById("cp_confirm")||{}).value||"") && ((document.getElementById("cp_new")||{}).value||"").length>0;
  const set = (id,ok)=>{const el=document.getElementById(id); if(el) el.classList.toggle("ok",!!ok);};
  set("pw_len",v.len); set("pw_up",v.upper); set("pw_low",v.lower); set("pw_num",v.number); set("pw_sp",v.special); set("pw_match",match);
  return v.valid && match;
}
async function changePwd(){
  if(window.__USE_API){
    if(!checkPwdLive()) return cp_msg.textContent = "New password does not meet all rules (need all green ticks).";
    try{ await apiReq("PUT","/api/password",{current:document.getElementById("cp_old").value||"",next:document.getElementById("cp_new").value}); cp_msg.style.color="green"; cp_msg.textContent="Password changed successfully ✔"; }
    catch(e){ cp_msg.textContent=e.message; }
    return;
  }
  const db = loadDB(); const u = db.users.find(x=>x.id===ME.id);
  if((document.getElementById("cp_old").value||"") !== u.password) return cp_msg.textContent = "Current password is wrong.";
  if(!checkPwdLive()) return cp_msg.textContent = "New password does not meet all rules (need all green ticks).";
  u.password = document.getElementById("cp_new").value; u.mustChangePwd = false;
  saveDB(db); cp_msg.style.color="green"; cp_msg.textContent="Password changed successfully ✔"; notify(db,u.id,"Your password was changed successfully.");
  saveDB(db);
}
function bindCommon(db){
  if(document.getElementById("f_type")){ autoAmt(); document.getElementById("f_type").addEventListener("change",autoAmt);
    document.getElementById("f_type").addEventListener("change",()=>{const t=document.getElementById("f_type").value;document.getElementById("loanRow").classList.toggle("hidden",t!=="loan_repayment");}); }
  if(document.getElementById("l_kind")) calcLoan();
}
function autoAmt(){ const m={monthly:3000,registration:2000,emergency:10000,funeral_principal:5000,funeral_beneficiary:4000,funeral_parent:3000,funeral_inlaw:1500,health_member:1000,health_family:500}; const t=document.getElementById("f_type").value; if(m[t]) document.getElementById("f_amt").value=m[t]; const lr=document.getElementById("loanRow"); if(lr) lr.classList.toggle("hidden",t!=="loan_repayment"); }
async function submitContrib(){
  const type=f_type.value, amount=Number(f_amt.value||0);
  if(!amount||amount<=0) return fmsg.textContent="Enter a valid amount.";
  if(!f_txn.value.trim()) return fmsg.textContent="Enter M-Pesa / txn code (proof you paid to chama account).";
  if(type==="loan_repayment" && (!document.getElementById("f_loan") || !f_loan.value)) return fmsg.textContent="Select the loan this repayment is for.";
  if(window.__USE_API){
    try{
      await apiReq("POST","/api/contributions",{type:type,amount:amount,date:f_date.value||todayISO(),method:f_method.value,txnCode:f_txn.value.trim(),phone:f_phone.value.trim(),notes:f_notes.value.trim(),loanId:(document.getElementById("f_loan")&&f_loan.value)||""});
      await refreshDB(); fmsg.style.color="green"; fmsg.textContent="Recorded! Sent to Treasurer for stage-1 approval."; render(); return;
    }catch(e){ return fmsg.textContent=e.message; }
  }
  const db=loadDB();
  db.contributions.push({id:uid("c"),memberId:ME.id,memberName:ME.fullName,type:type,amount:amount,date:f_date.value||todayISO(),method:f_method.value,txnCode:f_txn.value.trim(),phone:f_phone.value.trim(),notes:f_notes.value.trim(),loanId:f_loan?f_loan.value:"",caseId:"",status:"pending_treasurer",treasurerBy:"",chairmanBy:"",rejectReason:""});
  notify(db,"treasurer","New "+type+" "+money(amount)+" from "+ME.fullName+" awaiting your stage-1 approval.");
  saveDB(db); fmsg.style.color="green"; fmsg.textContent="Recorded! Sent to Treasurer for stage-1 approval."; render();
}
function calcLoan(){ const q=loanQuote(l_kind.value, Number(l_amt.value||0)); quote.innerHTML="Total repayable <b>"+money(q.total)+"</b> • <b>"+money(q.monthly)+"/month × "+q.months+" months</b> • Rate "+(q.ratePm*100)+" %/month flat (constitution)."; }
async function requestLoan(){
  const kind=l_kind.value, principal=Number(l_amt.value||0);
  if(kind==="normal"&&principal>20000) return lmsg.textContent="Normal loan cannot exceed Ksh 20,000 (constitution). Use Special loan.";
  if(!principal||principal<=0) return lmsg.textContent="Enter principal.";
  const g=Array.from(l_g.selectedOptions).map(o=>o.value);
  if(kind==="special"&&g.length===0) return lmsg.textContent="Special loan requires guarantors.";
  if(window.__USE_API){
    try{
      await apiReq("POST","/api/loans",{kind:kind,amount:principal,guarantors:g,purpose:l_purpose.value.trim()});
      await refreshDB(); lmsg.style.color="green"; lmsg.textContent="Loan request sent to Treasurer."; render(); return;
    }catch(e){ return lmsg.textContent=e.message; }
  }
  const db=loadDB();
  const q=loanQuote(kind,principal);
  db.loans.push({id:uid("L"),memberId:ME.id,memberName:ME.fullName,kind:kind,principal:q.principal,ratePm:q.ratePm,months:q.months,totalPayable:q.total,monthlyInstallment:q.monthly,guarantors:g,purpose:l_purpose.value.trim(),date:todayISO(),status:"pending_treasurer",treasurerBy:"",chairmanBy:"",rejectReason:"",disbursedDate:""});
  notify(db,"treasurer","New "+kind+" loan request "+money(principal)+" from "+ME.fullName+" awaiting stage-1.");
  saveDB(db); lmsg.style.color="green"; lmsg.textContent="Loan request sent to Treasurer."; render();
}
function repayLoan(id){ const amt=Number((document.getElementById("pay_"+id)||{}).value||0); if(!amt||amt<=0) return alert("Enter repayment amount."); TAB="record"; render(); setTimeout(()=>{f_type.value="loan_repayment";autoAmt();f_amt.value=amt;f_loan.value=id;window.scrollTo(0,0);},50); }
function payFine(id){ const db=loadDB(); const f=db.fines.find(x=>x.id===id); if(!f) return; TAB="record"; render(); setTimeout(()=>{f_type.value="fine";autoAmt();f_amt.value=f.amount;f_notes.value="Fine payment: "+f.reason+" ("+f.id+")";window.scrollTo(0,0);},50); }
function filterRows(q){ q=q.toLowerCase(); document.querySelectorAll(".rrow").forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?"":"none"); }
function saveProfile(){ const db=loadDB(); const u=db.users.find(x=>x.id===ME.id); u.phone=p_phone.value.trim(); u.idNumber=p_id.value.trim();
  const f=p_photo.files[0];
  const done=async()=>{ if(window.__USE_API){ try{ await apiReq("PUT","/api/profile",{phone:u.phone,idNumber:u.idNumber,photo:u.photo}); await refreshDB(); }catch(e){ return alert(e.message); } } else saveDB(db); alert("Profile saved."); render(); };
  if(f){ const r=new FileReader(); r.onload=()=>{u.photo=r.result;done();}; r.readAsDataURL(f);} else done();
}
render();
