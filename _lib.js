const admin=require('firebase-admin');
const crypto=require('crypto');
const C=require('./_catalog');
if(!admin.apps.length){admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))})}
const db=admin.firestore();
const E=(m,c)=>Object.assign(new Error(m),{code:c});
async function user(req){
  const h=req.headers.authorization||'';
  if(!h.startsWith('Bearer '))throw E('Sign in required',401);
  try{return await admin.auth().verifyIdToken(h.slice(7))}catch(e){throw E('Invalid session, please sign in again',401)}
}
async function ps(path,opt){
  const r=await fetch('https://api.paystack.co'+path,{...opt,headers:{Authorization:'Bearer '+process.env.PAYSTACK_SECRET_KEY,'Content-Type':'application/json'}});
  return r.json();
}
// Idempotent. Unlocks the maps recorded on OUR payment record, only after Paystack confirms the exact amount and currency.
// If a map was already owned (e.g. two overlapping payments), nothing is removed and the record is flagged for review.
async function fulfil(ref,d){
  if(!d||d.status!=='success'||d.currency!==C.CUR||d.reference!==ref)return false;
  const pr=db.collection('payments').doc(ref);
  return db.runTransaction(async t=>{
    const s=await t.get(pr);
    if(!s.exists)return false;                              // only references the server created
    const p=s.data(),maps=p.maps||['atoll'],amount=p.amount||340000;   // legacy records are Celestial Atoll at NGN 3,400
    if(d.amount!==amount||(p.currency&&p.currency!==C.CUR))return false;
    if(p.status==='fulfilled')return true;                 // duplicate notification: do nothing
    const ur=db.collection('users').doc(p.uid),us=await t.get(ur),have=C.ownedOf(us.exists?us.data():null);
    const granted=maps.filter(m=>!have[m]),overlap=maps.filter(m=>have[m]),now=new Date().toISOString();
    t.update(pr,{status:'fulfilled',paidAt:now,paystackId:d.id,item:p.item||'atoll',maps,granted,overlap,needsReview:overlap.length>0});
    const owned={};maps.forEach(m=>{owned[m]=true});
    const upd={owned};if(maps.includes('atoll')){upd.premium=true}
    t.set(ur,upd,{merge:true});
    return true;
  });
}
async function verifyRef(ref){const j=await ps('/transaction/verify/'+encodeURIComponent(ref));return j&&j.status?fulfil(ref,j.data):false}
async function settlePending(uid){for(const st of ['pending','superseded']){const q=await db.collection('payments').where('uid','==',uid).where('status','==',st).limit(10).get();for(const d of q.docs)await verifyRef(d.id)}}
module.exports={admin,db,user,ps,fulfil,verifyRef,settlePending,crypto,E,C};
