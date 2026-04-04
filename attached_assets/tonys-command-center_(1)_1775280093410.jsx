import { useState, useEffect, useCallback } from "react";

const TODAY_STR = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
const DATE_KEY = new Date().toISOString().split("T")[0];
const F = "'Instrument Sans','DM Sans',-apple-system,sans-serif";
const FS = "'Instrument Serif','DM Serif Display',Georgia,serif";
const C = {bg:"#F7F6F3",card:"#FFF",brd:"#E8E6E1",tx:"#1A1A1A",sub:"#6B6B6B",mut:"#A3A3A3",red:"#C62828",grn:"#2E7D32",amb:"#E65100",blu:"#1565C0",redBg:"#FFEBEE",grnBg:"#E8F5E9",ambBg:"#FFF3E0",bluBg:"#E3F2FD"};
const SC={Hot:C.red,Warm:C.amb,New:C.blu,Cold:C.mut};

const T={checkin:"Morning gate. System locked until done. Bedtime, wake, Bible, workout, journal, nutrition, unplug. Saved to Google Sheet. Disappears once done.",journal:"Brain dump. Auto-formats: Mood, Key Events, Reflection, Original Entry. Saved to Google Doc. Disappears once done.",ideas:"Capture ideas. Auto-prioritizes against business plan. Override = Ethan notified. Tech → Slack.",gmail:"Full screen Important Emails with reply/snooze/train. FYI (no reply). Once done, gone. Badge shows unresolved.",snooze:"Removes email until chosen time. Returns when expired.",suggestReply:"System drafts reply. You approve. Goes to Gmail drafts.",attempt:"Log call attempt. Give follow-up instructions. System drafts email.",connected:"Log outcome, notes, next step, follow-up."};

const CAL=[
  {t:"8:00 AM",n:"Claremont Imaging Check-in",loc:"Bldg 3A, 255 E Bonita Ave, Pomona",note:"Call 909-450-0393",real:true},
  {t:"9:30 AM",n:"Jedi Kids"},{t:"10:30 AM",n:"2K house payment + Martha"},
  {t:"10:30 AM",n:"Review Chat — James 3:13",note:"Like 12:31"},
  {t:"10:30 AM",n:"B12 + City of Hope + specialist + holistic"},
  {t:"11:30 AM",n:"LinkedIn: mormilo"},{t:"12:00 PM",n:"MP — luma.com"},
  {t:"1:00 PM",n:"Gas Town — Yegge AI orchestrator"},
  {t:"1:00 PM",n:"Stitch + Remotion + Blender MCP"},
  {t:"1:00 PM",n:"NEXUS — Network of Experts"},
  {t:"2:00 PM",n:"What Tony STOPS Doing → Who Owns It",note:"Discuss 3/23"},
  {t:"3:00 PM",n:"Trojan Horse — in-house agent approach"},
  {t:"5:30 PM",n:"High volume texting + social media + Usale"},
  {t:"8:00 PM",n:"Compliance — close out notes"},
  {t:"8:30 PM",n:"Chris Craddock EXP Realty — partner"},
  {t:"9:30 PM",n:"House AMP — important!"},
  {t:"10:30 PM",n:"Title Company Pitch"},
  {t:"11:30 PM",n:"LinkedIn: shellycofini"},
];
const EI=[
  {id:1,from:"Ethan Jolly",subj:"My Amended Contract",why:"Equity stake — needs a call",time:"Yesterday",p:"high"},
  {id:2,from:"Chris Wesser",subj:"FlipIQ Lightning Docs",why:"Capital raise — revisions tonight",time:"Today",p:"high"},
  {id:3,from:"Claude Team",subj:"$200 team credit",why:"Expires Apr 17",time:"Today",p:"med"},
  {id:4,from:"Fernando Perez",subj:"Off-market Chino",why:"Deal — asked for call",time:"Today",p:"med"},
  {id:5,from:"Sebastian Calder",subj:"Video sales letters",why:"Pricing inquiry",time:"Yesterday",p:"low"},
];
const EF=[
  {id:10,from:"Dr. Fakhoury",subj:"Mom's medication",why:"B12 shipping tomorrow"},
  {id:11,from:"David Breneman",subj:"Consultation Request",why:"Responded to Ethan"},
  {id:12,from:"Marisol Diaz",subj:"Physician referral",why:"Family medical"},
];
const CONTACTS=[
  {id:1,name:"Mike Oyoque",co:"MR EXCELLENCE",st:"Warm",ph:"(555) 123-4567",next:"Follow up demo",last:"Mar 25"},
  {id:2,name:"Xander Clemens",co:"Family Office Club",st:"Hot",ph:"(555) 234-5678",next:"Intro call — 10K investors",last:"Mar 30"},
  {id:3,name:"Fernando Perez",co:"Park Ave Capital",st:"New",ph:"(555) 345-6789",next:"Call re: Chino",last:"Today"},
  {id:4,name:"Tony Fletcher",co:"LPT/FairClose",st:"Warm",ph:"(555) 456-7890",next:"Broker Playbook",last:"Apr 1"},
  {id:5,name:"Kyle Draper",co:"",st:"New",ph:"(555) 567-8901",next:"Demo?",last:"Mar 28"},
  {id:6,name:"Chris Craddock",co:"EXP Realty",st:"New",ph:"(555) 678-9012",next:"#1 EXP recruiter",last:"Never"},
];
const TASKS=[
  {id:"t1",text:"10 Sales Calls",cat:"SALES",sales:true},
  {id:"t2",text:"Reply Ethan re: equity",cat:"OPS"},
  {id:"t3",text:"Follow up Chris Wesser",cat:"SALES"},
  {id:"t4",text:"Sales demo website",cat:"SALES"},
];
const CATS=["Tech","Sales","Marketing","Strategic Partners","Operations","Product","Personal"];
const URG=["Now","This Week","This Month","Someday"];

const card={background:C.card,borderRadius:14,padding:"20px 24px",border:`1px solid ${C.brd}`};
const inp={width:"100%",padding:"10px 14px",borderRadius:10,border:`2px solid ${C.brd}`,fontSize:15,fontFamily:F,boxSizing:"border-box",outline:"none"};
const btn1={padding:"14px 28px",background:C.tx,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:F};
const btn2={padding:"10px 18px",background:C.card,color:C.tx,border:`2px solid ${C.brd}`,borderRadius:10,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:F};
const lbl={display:"block",fontSize:11,fontWeight:700,color:C.mut,textTransform:"uppercase",letterSpacing:1,marginBottom:6};

function Tip({tip,children}){const[s,setS]=useState(false);const[e,setE]=useState(false);const[t,setT]=useState(tip||"");
  return(<div style={{position:"relative",display:"inline-flex"}} onMouseEnter={()=>setS(true)} onMouseLeave={()=>{setS(false);setE(false);}}>
    {children}{s&&<div style={{position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",width:260,background:"#1A1A1A",color:"#fff",borderRadius:10,padding:"10px 12px",zIndex:9999,boxShadow:"0 8px 32px rgba(0,0,0,0.3)",fontSize:11,lineHeight:1.5}}>
      {!e?<><div style={{color:"#ccc"}}>{tip}</div><button onClick={ev=>{ev.stopPropagation();setE(true);}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",padding:"2px 8px",borderRadius:4,fontSize:10,cursor:"pointer",marginTop:4}}>✏️ Edit</button></>
      :<><textarea value={t} onChange={ev=>setT(ev.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:6,color:"#fff",padding:6,fontSize:10,fontFamily:F,minHeight:40,boxSizing:"border-box"}}/><div style={{display:"flex",gap:4,marginTop:4}}><button onClick={()=>setE(false)} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#ccc",padding:"2px 6px",borderRadius:4,fontSize:10,cursor:"pointer"}}>Cancel</button><button onClick={()=>setE(false)} style={{background:C.grn,border:"none",color:"#fff",padding:"2px 6px",borderRadius:4,fontSize:10,cursor:"pointer",fontWeight:700}}>Save</button></div></>}
      <div style={{position:"absolute",bottom:-5,left:"50%",transform:"translateX(-50%)",width:10,height:10,background:"#1A1A1A",rotate:"45deg"}}/></div>}</div>);}

function Gear({label}){const[o,setO]=useState(false);const[t,setT]=useState("");const[r,setR]=useState(null);
  return(<><button onClick={()=>setO(true)} style={{background:"none",border:"none",cursor:"pointer",padding:2,opacity:0.2,fontSize:12}} onMouseEnter={e=>e.target.style.opacity=1} onMouseLeave={e=>e.target.style.opacity=0.2}>⚙️</button>
    {o&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>{setO(false);setR(null);}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:14,padding:24,width:420,maxWidth:"90vw"}}>
        <div style={{fontSize:10,fontWeight:700,color:C.mut,textTransform:"uppercase",letterSpacing:1}}>Instructions</div>
        <div style={{fontFamily:FS,fontSize:18,marginTop:4}}>⚙️ {label}</div>
        <textarea value={t} onChange={e=>setT(e.target.value)} placeholder="What should this do differently?" style={{...inp,minHeight:70,resize:"vertical",marginTop:10}}/>
        {r&&<div style={{marginTop:8,padding:8,borderRadius:8,background:C.grnBg,fontSize:12,color:C.grn,fontWeight:600}}>✓ {r}</div>}
        <div style={{display:"flex",gap:8,marginTop:12,justifyContent:"flex-end"}}><button onClick={()=>{setO(false);setR(null);}} style={btn2}>Cancel</button><button onClick={()=>{if(t.trim())setR(`"${label}" updated in MD file`);}} style={btn1}>Apply</button></div>
      </div></div>}</>);}

function Head({title,right}){return(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{display:"flex",alignItems:"center",gap:6}}><h3 style={{fontFamily:FS,fontSize:19,margin:0}}>{title}</h3><Gear label={title}/></div>{right}</div>);}

export default function App(){
  const[view,setView]=useState("checkin"); // checkin→journal→emails→schedule→sales|tasks
  const[ck,setCk]=useState({bed:"",wake:"",sleep:"",bible:false,workout:false,journal:false,nut:"Good",unplug:false,done:false});
  const[jTxt,setJTxt]=useState("");const[jDone,setJDone]=useState(false);
  const[snoozed,setSnoozed]=useState({});const[tDone,setTDone]=useState({});
  const[ideas,setIdeas]=useState([]);const[showIdea,setShowIdea]=useState(false);
  const[newIdea,setNewIdea]=useState({text:"",cat:"Tech",urg:"This Week",tt:""});
  const[calls,setCalls]=useState([]);const[demos,setDemos]=useState(0);
  const[attempt,setAttempt]=useState(null);const[aN,setAN]=useState("");
  const[calSide,setCalSide]=useState(false);
  const[clock,setClock]=useState(new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}));
  const[eod,setEod]=useState(false);

  useEffect(()=>{const i=setInterval(()=>setClock(new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})),30000);return()=>clearInterval(i);},[]);
  useEffect(()=>{(async()=>{try{const r=await window.storage.get("tcc3");if(r?.value){const d=JSON.parse(r.value);if(d.dt===DATE_KEY){if(d.ck?.done){setCk(d.ck);setView(d.jDone?(d.emailsDone?(d.calDone?"sales":"schedule"):"emails"):"journal");}
  if(d.jDone)setJDone(true);if(d.snoozed)setSnoozed(d.snoozed);if(d.tDone)setTDone(d.tDone);if(d.ideas)setIdeas(d.ideas);if(d.demos)setDemos(d.demos);if(d.calls)setCalls(d.calls);}else if(d.ideas)setIdeas(d.ideas);}catch{}}})();},[]);
  const sv=useCallback(async(o={})=>{const s={dt:DATE_KEY,ck,jDone,snoozed,tDone,ideas,demos,calls,...o};try{await window.storage.set("tcc3",JSON.stringify(s));}catch{}},[ck,jDone,snoozed,tDone,ideas,demos,calls]);

  const upCk=(k,v)=>{const u={...ck,[k]:v};if(u.bed&&u.wake){try{const p=t=>{const m=t.match(/(\d+):?(\d*)\s*(am|pm)?/i);if(!m)return 0;let h=+m[1];const mn=m[2]?+m[2]:0;if(m[3]?.toLowerCase()==="pm"&&h<12)h+=12;if(m[3]?.toLowerCase()==="am"&&h===12)h=0;return h+mn/60;};let d=p(u.wake)-p(u.bed);if(d<0)d+=24;u.sleep=d.toFixed(1);}catch{}}setCk(u);};
  const unresolved=EI.filter(e=>!snoozed[e.id]).length;

  // ═══ CHECK-IN (Step 1) ═══
  if(view==="checkin"&&!ck.done)return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet"/>
      <div style={{...card,padding:"36px 40px",maxWidth:480,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between"}}><div><h1 style={{fontFamily:FS,fontSize:28,margin:0}}>Morning Check-in</h1><p style={{color:C.mut,margin:"6px 0 0",fontSize:13}}>{TODAY_STR} · {clock}</p></div><Tip tip={T.checkin}><Gear label="Check-in"/></Tip></div>
        <p style={{fontFamily:FS,fontSize:14,color:C.sub,fontStyle:"italic",margin:"12px 0 24px",borderLeft:`3px solid ${C.brd}`,paddingLeft:12}}>"Follow the plan I gave you!" — God</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}}>
          <div><label style={lbl}>Bedtime</label><input style={inp} placeholder="10:30 PM" value={ck.bed} onChange={e=>upCk("bed",e.target.value)}/></div>
          <div><label style={lbl}>Wake time</label><input style={inp} placeholder="6:00 AM" value={ck.wake} onChange={e=>upCk("wake",e.target.value)}/></div>
        </div>
        {ck.sleep&&<div style={{background:+ck.sleep>=7?C.grnBg:C.ambBg,borderRadius:10,padding:"10px 16px",marginBottom:18,fontSize:14,fontWeight:600,color:+ck.sleep>=7?C.grn:C.amb}}>Sleep: {ck.sleep}h {+ck.sleep<7?"⚠️":"✓"}</div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
          {[["bible","Bible"],["workout","Workout"],["journal","Journal"],["unplug","Unplug 6PM"]].map(([k,l])=><button key={k} onClick={()=>upCk(k,!ck[k])} style={{padding:13,borderRadius:12,border:`2px solid ${ck[k]?C.grn:C.brd}`,background:ck[k]?C.grnBg:C.card,color:ck[k]?C.grn:C.sub,cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:F}}>{ck[k]?"✓ ":""}{l}</button>)}
        </div>
        <div style={{marginBottom:22}}><label style={lbl}>Yesterday's Nutrition</label><div style={{display:"flex",gap:8}}>
          {["Good","OK","Bad"].map(n=><button key={n} onClick={()=>upCk("nut",n)} style={{flex:1,padding:12,borderRadius:10,border:`2px solid ${ck.nut===n?(n==="Good"?C.grn:n==="OK"?C.amb:C.red):C.brd}`,background:ck.nut===n?(n==="Good"?C.grnBg:n==="OK"?C.ambBg:C.redBg):C.card,color:ck.nut===n?(n==="Good"?C.grn:n==="OK"?C.amb:C.red):C.sub,cursor:"pointer",fontSize:14,fontWeight:700,fontFamily:F}}>{n}</button>)}</div></div>
        <button onClick={()=>{const u={...ck,done:true};setCk(u);setView("journal");sv({ck:u});}} style={{...btn1,width:"100%"}}>Let's Go →</button>
      </div></div>);

  // ═══ JOURNAL (Step 2) ═══
  if(view==="journal"&&!jDone)return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:F,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet"/>
      <div style={{...card,padding:"36px 40px",maxWidth:540,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between"}}><div><h1 style={{fontFamily:FS,fontSize:28,margin:0}}>Journal</h1><p style={{color:C.mut,margin:"6px 0 0",fontSize:13}}>Brain dump — speak or type</p></div><Tip tip={T.journal}><Gear label="Journal"/></Tip></div>
        <textarea value={jTxt} onChange={e=>setJTxt(e.target.value)} placeholder="What's on your mind?..." style={{...inp,minHeight:180,resize:"vertical",fontSize:15,lineHeight:1.7,marginTop:20}}/>
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={()=>{setJDone(true);setView("emails");sv({jDone:true});}} style={{...btn2,flex:1}}>Skip</button>
          <button onClick={()=>{setJDone(true);setView("emails");sv({jDone:true});if(jTxt.trim())sendPrompt("Journal entry: "+jTxt);}} disabled={!jTxt.trim()} style={{...btn1,flex:1,opacity:jTxt.trim()?1:0.4}}>Save & Continue →</button>
        </div></div></div>);

  // ═══ HEADER (Steps 3+) ═══
  const Hdr=()=>(<div style={{background:C.card,borderBottom:`1px solid ${C.brd}`,padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet"/>
    <div style={{display:"flex",alignItems:"baseline",gap:10}}><h1 onClick={()=>setView("schedule")} style={{fontFamily:FS,fontSize:18,margin:0,cursor:"pointer"}}>Tony's Command Center</h1><span style={{fontSize:11,color:C.mut}}>{TODAY_STR} · {clock}</span></div>
    <p style={{fontFamily:FS,fontSize:12,color:C.sub,fontStyle:"italic",margin:0,position:"absolute",left:"50%",transform:"translateX(-50%)"}}>"Follow the plan I gave you!" — God</p>
    <div style={{display:"flex",gap:5,alignItems:"center"}}>
      <Tip tip={T.ideas}><button onClick={()=>setShowIdea(true)} style={{...btn2,padding:"5px 10px",fontSize:11}}>💡{ideas.length>0?` (${ideas.length})`:""}</button></Tip>
      <Tip tip={T.gmail}><button onClick={()=>setView("emails")} style={{...btn2,padding:"5px 10px",fontSize:11,position:"relative"}}>✉️{unresolved>0&&<span style={{position:"absolute",top:-5,right:-5,background:C.red,color:"#fff",fontSize:9,fontWeight:800,borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center"}}>{unresolved}</span>}</button></Tip>
      <button onClick={()=>setCalSide(!calSide)} style={{...btn2,padding:"5px 10px",fontSize:11,background:calSide?C.bluBg:C.card,color:calSide?C.blu:C.tx}}>📅</button>
      <Tip tip={T.eod}><button onClick={()=>{setEod(true);sendPrompt("Generate EOD report for tony@flipiq.com and ethan@flipiq.com");}} style={{...btn2,padding:"5px 10px",fontSize:11,background:eod?C.grnBg:C.card}}>{eod?"✓":"📊"}</button></Tip>
      <Tip tip={T.chat}><button onClick={()=>sendPrompt("Chat mode — full context.")} style={{...btn2,padding:"5px 10px",fontSize:11,background:C.tx,color:"#fff",border:"none"}}>💬</button></Tip>
    </div></div>);

  // ═══ CALENDAR SIDEBAR ═══
  const CalSide=()=>calSide?(<div style={{position:"fixed",top:52,right:0,bottom:0,width:300,background:C.card,borderLeft:`1px solid ${C.brd}`,zIndex:40,overflow:"auto",padding:"14px 16px",boxShadow:"-4px 0 20px rgba(0,0,0,0.08)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><h3 style={{fontFamily:FS,fontSize:15,margin:0}}>📅 Schedule</h3><button onClick={()=>setCalSide(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:C.mut}}>✕</button></div>
    {CAL.map((c,i)=>(<div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:`1px solid ${C.brd}`}}><span style={{fontSize:10,fontWeight:700,color:c.real?C.blu:C.mut,minWidth:55}}>{c.t}</span><div style={{fontSize:11,fontWeight:c.real?700:400,color:c.real?C.blu:C.tx}}>{c.n}{c.note&&<span style={{color:C.amb,marginLeft:4}}>⚡</span>}</div></div>))}
  </div>):null;

  // ═══ IDEAS MODAL ═══
  const IdeasModal=()=>showIdea?(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowIdea(false)}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:18,padding:28,width:480,maxWidth:"90vw"}}>
      <Head title="What's your brilliant idea?"/>
      <p style={{fontSize:13,color:C.mut,margin:"0 0 16px"}}>That'll be #{ideas.length+1} — {ideas.length} ahead of it.</p>
      <textarea value={newIdea.text} onChange={e=>setNewIdea({...newIdea,text:e.target.value})} placeholder="Speak or type..." style={{...inp,minHeight:70,resize:"vertical",marginBottom:14}}/>
      <div style={{marginBottom:12}}><label style={lbl}>Category</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{CATS.map(c=><button key={c} onClick={()=>setNewIdea({...newIdea,cat:c})} style={{padding:"5px 12px",borderRadius:8,border:`2px solid ${newIdea.cat===c?C.tx:C.brd}`,background:newIdea.cat===c?C.tx:C.card,color:newIdea.cat===c?"#fff":C.sub,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F}}>{c}</button>)}</div></div>
      <div style={{marginBottom:12}}><label style={lbl}>Urgency</label><div style={{display:"flex",gap:5}}>{URG.map(u=><button key={u} onClick={()=>setNewIdea({...newIdea,urg:u})} style={{padding:"5px 12px",borderRadius:8,border:`2px solid ${newIdea.urg===u?(u==="Now"?C.red:C.tx):C.brd}`,background:newIdea.urg===u?(u==="Now"?C.red:C.tx):C.card,color:newIdea.urg===u?"#fff":C.sub,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F}}>{u}</button>)}</div></div>
      {newIdea.cat==="Tech"&&<div style={{marginBottom:12}}><label style={lbl}>Type</label><div style={{display:"flex",gap:5}}>{["Bug","Feature","Idea"].map(t=><button key={t} onClick={()=>setNewIdea({...newIdea,tt:t})} style={{padding:"5px 12px",borderRadius:8,border:`2px solid ${newIdea.tt===t?C.blu:C.brd}`,background:newIdea.tt===t?C.bluBg:C.card,color:newIdea.tt===t?C.blu:C.sub,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F}}>{t}</button>)}</div></div>}
      <div style={{display:"flex",gap:8}}><button onClick={()=>setShowIdea(false)} style={{...btn2,flex:1}}>Cancel</button><button onClick={()=>{if(!newIdea.text.trim())return;const u=[...ideas,{...newIdea,id:Date.now()}];setIdeas(u);setNewIdea({text:"",cat:"Tech",urg:"This Week",tt:""});setShowIdea(false);sv({ideas:u});if(newIdea.cat==="Tech")sendPrompt(`Slack: Tech ${newIdea.tt||"Idea"} — ${newIdea.text}`);}} style={{...btn1,flex:1}}>Park It — Make Calls</button></div>
    </div></div>):null;

  // ═══ ATTEMPT MODAL ═══
  const AttemptModal=()=>attempt?(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setAttempt(null)}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:14,padding:24,width:420}}>
      <h3 style={{fontFamily:FS,fontSize:18,margin:"0 0 4px"}}>Attempt — {attempt.name}</h3>
      <p style={{fontSize:12,color:C.mut,margin:"0 0 12px"}}>Instructions for follow-up:</p>
      <textarea value={aN} onChange={e=>setAN(e.target.value)} placeholder='"No answer, send email..."' style={{...inp,minHeight:80,resize:"vertical"}}/>
      <div style={{display:"flex",gap:8,marginTop:12}}><button onClick={()=>setAttempt(null)} style={btn2}>Cancel</button><button onClick={()=>{const u=[...calls,{name:attempt.name,type:"attempt",note:aN,time:new Date().toLocaleTimeString()}];setCalls(u);sv({calls:u});setAttempt(null);if(aN.trim())sendPrompt(`Log attempt ${attempt.name}: ${aN}`);}} style={btn1}>Log & Follow-up</button></div>
    </div></div>):null;

  // ═══ EMAILS (Step 3 — FULL SCREEN) ═══
  if(view==="emails")return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:F}}><Hdr/><IdeasModal/>
      <div style={{maxWidth:680,margin:"24px auto",padding:"0 20px"}}>
        <div style={{...card,marginBottom:16}}>
          <Head title="Important Emails" right={<span style={{color:C.red,fontWeight:700,fontSize:13}}>{unresolved} need attention</span>}/>
          {EI.filter(e=>!snoozed[e.id]).map(e=>(<div key={e.id} style={{padding:14,marginBottom:8,background:e.p==="high"?C.redBg:"#FAFAF8",borderRadius:12,borderLeft:`4px solid ${e.p==="high"?C.red:e.p==="med"?C.amb:C.mut}`}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:15,fontWeight:700}}>{e.from}</span><span style={{fontSize:11,color:C.mut}}>{e.time}</span></div>
            <div style={{fontSize:14,fontWeight:600,marginTop:2}}>{e.subj}</div>
            <div style={{fontSize:12,color:C.red,marginTop:4}}>→ {e.why}</div>
            <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
              <Tip tip={T.suggestReply}><button onClick={()=>sendPrompt(`Draft reply to ${e.from}: "${e.subj}"`)} style={{...btn2,padding:"5px 12px",fontSize:11,color:C.blu,borderColor:C.blu}}>Suggest Reply</button></Tip>
              <Tip tip={T.snooze}><select onChange={ev=>{if(ev.target.value){const u={...snoozed,[e.id]:ev.target.value};setSnoozed(u);sv({snoozed:u});ev.target.value="";}}} defaultValue="" style={{...btn2,padding:"5px 8px",fontSize:11}}><option value="">Snooze...</option><option value="1h">1 hour</option><option value="2h">2 hours</option><option value="tom">Tomorrow</option><option value="nw">Next week</option></select></Tip>
              <button style={{background:"none",border:"none",cursor:"pointer",fontSize:15}}>👍</button>
              <button style={{background:"none",border:"none",cursor:"pointer",fontSize:15}}>👎</button>
            </div></div>))}
          {unresolved===0&&<div style={{padding:16,textAlign:"center",color:C.grn,fontWeight:700,background:C.grnBg,borderRadius:10}}>All handled ✓</div>}
        </div>
        <div style={{...card,marginBottom:16}}><Head title="FYI — No Reply Needed"/>{EF.map(e=><div key={e.id} style={{padding:"10px 0",borderBottom:`1px solid ${C.brd}`}}><div style={{fontSize:14}}><strong>{e.from}</strong> — {e.subj}</div><div style={{fontSize:12,color:C.mut,marginTop:2}}>{e.why}</div></div>)}</div>
        <button onClick={()=>{setView("schedule");sv({emailsDone:true});}} style={{...btn1,width:"100%",marginBottom:40}}>Done — Show My Day →</button>
      </div></div>);

  // ═══ SALES (Full Screen + Calendar Sidebar) ═══
  if(view==="sales")return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:F}}><Hdr/><CalSide/><IdeasModal/><AttemptModal/>
      <div style={{maxWidth:760,margin:"24px auto",padding:"0 20px",marginRight:calSide?320:undefined,transition:"margin 0.2s"}}>
        <div style={{...card,marginBottom:16}}>
          <Head title="Sales Mode" right={<div style={{display:"flex",gap:12,alignItems:"center",fontSize:13,fontWeight:700}}><span>Calls: {calls.length}</span><span style={{color:C.blu}}>Demos: {demos}</span><div style={{display:"flex",gap:4}}><button onClick={()=>{setDemos(Math.max(0,demos-1));sv({demos:Math.max(0,demos-1)});}} style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.brd}`,background:C.card,cursor:"pointer",fontSize:14,fontWeight:700}}>−</button><button onClick={()=>{setDemos(demos+1);sv({demos:demos+1});}} style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.grn}`,background:C.grnBg,cursor:"pointer",fontSize:14,fontWeight:700,color:C.grn}}>+</button></div></div>}/>
          {CONTACTS.map(c=>(<div key={c.id} style={{display:"flex",gap:12,padding:14,marginBottom:6,background:"#FAFAF8",borderRadius:12,borderLeft:`4px solid ${SC[c.st]}`,alignItems:"center"}}>
            <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:15,fontWeight:700}}>{c.name}</span><span style={{fontSize:10,fontWeight:700,color:SC[c.st],background:c.st==="Hot"?C.redBg:c.st==="Warm"?C.ambBg:C.bluBg,padding:"2px 8px",borderRadius:4}}>{c.st}</span></div>
              {c.co&&<div style={{fontSize:12,color:C.sub}}>{c.co}</div>}<div style={{fontSize:13,marginTop:4}}>→ {c.next}</div><div style={{fontSize:11,color:C.mut,marginTop:2}}>Last: {c.last} · {c.ph}</div></div>
            <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
              <Tip tip={T.attempt}><button onClick={()=>{setAttempt(c);setAN("");}} style={{...btn2,padding:"7px 12px",fontSize:11}}>📞 Attempt</button></Tip>
              <Tip tip={T.connected}><button onClick={()=>{const u=[...calls,{name:c.name,type:"connected",time:new Date().toLocaleTimeString()}];setCalls(u);sv({calls:u});}} style={{...btn2,padding:"7px 12px",fontSize:11,color:C.grn,borderColor:C.grn}}>✓ Connected</button></Tip>
            </div></div>))}
        </div>
        {calls.length>0&&<div style={{...card,marginBottom:16,background:C.grnBg}}><Head title={`Call Log (${calls.length})`}/>{calls.map((cl,i)=><div key={i} style={{fontSize:13,padding:"3px 0",color:C.grn}}>✓ {cl.name} — {cl.type} {cl.time}</div>)}</div>}
        <button onClick={()=>setView("tasks")} style={{...btn2,width:"100%",marginBottom:10}}>✅ Switch to Tasks</button>
        <button onClick={()=>setView("schedule")} style={{...btn2,width:"100%",marginBottom:40,color:C.mut}}>← Schedule</button>
      </div></div>);

  // ═══ TASKS (Full Screen + Calendar Sidebar) ═══
  if(view==="tasks")return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:F}}><Hdr/><CalSide/><IdeasModal/>
      <div style={{maxWidth:580,margin:"24px auto",padding:"0 20px",marginRight:calSide?320:undefined,transition:"margin 0.2s"}}>
        <div style={{...card,marginBottom:16}}>
          <Head title="Tasks" right={<span style={{fontSize:13,color:C.mut}}>{Object.values(tDone).filter(Boolean).length}/{TASKS.length}</span>}/>
          {TASKS.map(t=>(<div key={t.id} onClick={()=>{if(t.sales){setView("sales");return;}const u={...tDone,[t.id]:!tDone[t.id]};setTDone(u);sv({tDone:u});}}
            style={{display:"flex",gap:12,alignItems:"center",padding:14,marginBottom:6,background:tDone[t.id]?C.grnBg:"#FAFAF8",borderRadius:12,cursor:"pointer",borderLeft:`4px solid ${t.cat==="SALES"?C.grn:t.cat==="OPS"?C.amb:C.blu}`,opacity:tDone[t.id]?0.6:1}}>
            <div style={{width:24,height:24,borderRadius:8,border:`2px solid ${tDone[t.id]?C.grn:C.mut}`,background:tDone[t.id]?C.grn:C.card,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{tDone[t.id]&&<span style={{color:"#fff",fontSize:12}}>✓</span>}</div>
            <div style={{flex:1}}><div style={{fontSize:10,fontWeight:700,color:t.cat==="SALES"?C.grn:t.cat==="OPS"?C.amb:C.blu,textTransform:"uppercase",letterSpacing:1}}>{t.cat}</div><div style={{fontSize:15,fontWeight:600,textDecoration:tDone[t.id]?"line-through":"none"}}>{t.text}</div></div>
            {t.sales&&!tDone[t.id]&&<span style={{fontSize:12,color:C.red,fontWeight:700}}>→ Sales</span>}<Gear label={`Task: ${t.text}`}/></div>))}
        </div>
        <button onClick={()=>setView("sales")} style={{...btn2,width:"100%",marginBottom:10}}>📞 Switch to Sales</button>
        <button onClick={()=>setView("schedule")} style={{...btn2,width:"100%",marginBottom:40,color:C.mut}}>← Schedule</button>
      </div></div>);

  // ═══ SCHEDULE (Step 4 — Full Screen, THE main view) ═══
  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:F}}><Hdr/><IdeasModal/>
      <div style={{maxWidth:760,margin:"24px auto",padding:"0 20px"}}>
        <div style={{...card,marginBottom:16}}>
          <Head title="Today's Schedule" right={<span style={{fontSize:12,color:C.mut}}>{CAL.length} items</span>}/>
          {CAL.map((c,i)=>(<div key={i} style={{display:"flex",gap:12,padding:"12px 14px",marginBottom:4,background:c.real?C.bluBg:"#FAFAF8",borderRadius:10,borderLeft:`4px solid ${c.real?C.blu:C.brd}`}}>
            <span style={{fontSize:13,fontWeight:700,color:c.real?C.blu:C.mut,minWidth:75,flexShrink:0}}>{c.t}</span>
            <div style={{flex:1}}><div style={{fontSize:14,fontWeight:c.real?700:500}}>{c.n}</div>{c.loc&&<div style={{fontSize:12,color:C.sub,marginTop:2}}>📍 {c.loc}</div>}{c.note&&<div style={{fontSize:12,color:C.amb,marginTop:2}}>⚡ {c.note}</div>}</div>
            {c.real?<span style={{fontSize:10,fontWeight:700,color:C.blu,background:"#fff",padding:"2px 8px",borderRadius:4,alignSelf:"center"}}>MEETING</span>:<span style={{fontSize:10,color:C.mut,alignSelf:"center"}}>note</span>}
          </div>))}
        </div>
        <button onClick={()=>{setView("sales");setCalSide(true);sv({calDone:true});}} style={{...btn1,width:"100%",padding:18,fontSize:17,marginBottom:10}}>📞 Enter Sales Mode →</button>
        <button onClick={()=>{setView("tasks");setCalSide(true);sv({calDone:true});}} style={{...btn2,width:"100%",padding:14,marginBottom:40}}>✅ Enter Task Mode</button>
      </div></div>);
}
