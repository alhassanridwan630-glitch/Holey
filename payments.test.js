// Run with:  npm test      (no real credentials needed: Paystack and Firebase are simulated)
const Module=require('module'),path=require('path'),crypto=require('crypto');
const mock=require('./mock-firestore');
const orig=Module._load;Module._load=function(r){return r==='firebase-admin'?mock:orig.apply(this,arguments)};
process.env.FIREBASE_SERVICE_ACCOUNT='{}';process.env.PAYSTACK_SECRET_KEY='sk_test_dummy';
const api=f=>require(path.join('..','api',f));
const C=api('_catalog'),init=api('init'),prem=api('premium'),hook=api('webhook'),cat=api('catalog'),del=api('delete');
const {migrate}=require('../scripts/migrate-ownership');
const store=mock.__store,stats=mock.__stats;
const PS={},INIT=[];
global.fetch=async(url,o)=>{const j=x=>({json:async()=>x});
  if(url.endsWith('/transaction/initialize')){const b=JSON.parse(o.body);INIT.push(b);return j({status:true,data:{authorization_url:'https://checkout.paystack.com/'+b.reference,reference:b.reference}})}
  const m=/verify\/(.+)$/.exec(url);if(m){const d=PS[decodeURIComponent(m[1])];return j(d?{status:true,data:d}:{status:false})}return j({})};
const res=()=>{const r={code:200,body:null,status(c){r.code=c;return r},json(b){r.body=b;return r},end(){return r}};return r};
const call=async(f,req)=>{const r=res();await f(req,r);return r};
const A=u=>({authorization:'Bearer tok:'+u+':'+u+'@mail.com'});
const out=[];let fails=0;const T=(n,c)=>{out.push((c?'PASS ':'FAIL ')+n);if(!c)fails++};
const owned=u=>C.ownedOf(store.get('users/'+u));
const pay=(ref,extra)=>{const p=store.get('payments/'+ref);PS[ref]=Object.assign({id:Math.floor(Math.random()*1e6),status:'success',amount:p.amount,currency:'NGN',reference:ref},extra);return ref};
const sig=raw=>crypto.createHmac('sha512','sk_test_dummy').update(raw).digest('hex');
const webhook=(ev,s)=>{const raw=JSON.stringify(ev),rq=new (require('events'))();rq.method='POST';rq.headers={'x-paystack-signature':s||sig(raw)};process.nextTick(()=>{rq.emit('data',raw);rq.emit('end')});return rq};
const enableAll=()=>Object.values(C.ITEMS).forEach(i=>{i.enabled=true});
const ALL=['atoll','toy','third'];

(async()=>{
 // ---------- pricing rules ----------
 const price=(item,own)=>{const o={};own.forEach(m=>o[m]=true);return C.quote(item,o)};
 T('list prices: atoll 3,400 / toy 2,500 / third 2,500',[price('atoll',[]).amount,price('toy',[]).amount,price('third',[]).amount].join()==='340000,250000,250000');
 T('bundles from nothing: toy+third 4,000 and complete 6,800',price('bundle_new',[]).amount===400000&&price('bundle_all',[]).amount===680000);
 T('bundles are cheaper than buying separately',400000<250000*2&&680000<340000+400000);
 T('owning atoll: complete collection costs only 4,000 (toy+third)',price('bundle_all',['atoll']).amount===400000&&price('bundle_all',['atoll']).maps.join()==='toy,third');
 T('owning toy+third: complete collection costs only 3,400',price('bundle_all',['toy','third']).amount===340000);
 T('owning atoll+toy: complete collection costs only 2,500',price('bundle_all',['atoll','toy']).amount===250000);
 T('owning toy: toy+third bundle costs only 2,500 (third)',price('bundle_new',['toy']).amount===250000);
 T('owning everything: nothing to pay',['atoll','toy','third','bundle_new','bundle_all'].every(i=>price(i,ALL).amount===0&&price(i,ALL).maps.length===0));
 let mono=true;const subsets=[[],['atoll'],['toy'],['third'],['atoll','toy'],['atoll','third'],['toy','third'],ALL];
 for(const a of subsets)for(const b of subsets)if(a.every(x=>b.includes(x)))for(const it of Object.keys(C.ITEMS))if(price(it,b).amount>price(it,a).amount)mono=false;
 T('owning more maps never makes any price go up',mono);
 T('legacy premium:true counts as owning atoll',C.ownedOf({premium:true}).atoll===true&&C.ownedOf({}).atoll===undefined);

 // ---------- auth + availability ----------
 T('init requires sign-in (401)',(await call(init,{method:'POST',headers:{}})).code===401);
 T('catalog requires sign-in (401)',(await call(cat,{headers:{}})).code===401);
 T('maps not built yet cannot be bought (toy, third, bundles)',(await Promise.all(['toy','third','bundle_new','bundle_all'].map(i=>call(init,{method:'POST',headers:A('u0'),body:{item:i}})))).every(r=>r.code===400&&/not available/.test(r.body.error)));
 T('unknown item rejected',(await call(init,{method:'POST',headers:A('u0'),body:{item:'../../x'}})).code===400);

 // ---------- celestial atoll (existing product) ----------
 let r=await call(init,{method:'POST',headers:A('u1'),body:{item:'atoll',amount:1,maps:['toy','third']}});
 const ref=r.body.reference,pd=store.get('payments/'+ref);
 T('init: server fixes item, maps and price (client amount/maps ignored)',pd.item==='atoll'&&pd.maps.join()==='atoll'&&pd.amount===340000&&pd.currency==='NGN'&&pd.status==='pending'&&INIT.at(-1).amount===340000);
 T('init: Paystack metadata carries item and maps',INIT.at(-1).metadata.item==='atoll');
 let p=await call(prem,{headers:A('u1'),query:{}});
 T('before payment: nothing owned, no premium course data sent',p.body.owned.atoll===false&&!p.body.maps.atoll);
 PS[ref]={id:1,status:'success',amount:100,currency:'NGN',reference:ref};
 T('wrong amount does NOT unlock',(await call(prem,{headers:A('u1'),query:{reference:ref}})).body.owned.atoll===false);
 PS[ref]={id:1,status:'success',amount:340000,currency:'USD',reference:ref};
 T('wrong currency does NOT unlock',(await call(prem,{headers:A('u1'),query:{reference:ref}})).body.owned.atoll===false);
 PS[ref]={id:1,status:'abandoned',amount:340000,currency:'NGN',reference:ref};
 T('interrupted/abandoned payment does NOT unlock',(await call(prem,{headers:A('u1'),query:{reference:ref}})).body.owned.atoll===false);
 PS[ref]={id:1,status:'success',amount:340000,currency:'NGN',reference:'OTHER'};
 T('mismatched reference does NOT unlock',(await call(prem,{headers:A('u1'),query:{reference:ref}})).body.owned.atoll===false);
 pay(ref);
 T("another user cannot claim someone else's payment",(await call(prem,{headers:A('u2'),query:{reference:ref}})).body.owned.atoll===false);
 p=await call(prem,{headers:A('u1'),query:{reference:ref}});
 T('verified payment unlocks atoll and returns its holes',p.body.owned.atoll===true&&p.body.maps.atoll.length===8&&p.body.owned.toy===false);
 T('payment record stored persistently (item, maps, granted, status)',(x=>x.status==='fulfilled'&&x.item==='atoll'&&x.granted.join()==='atoll'&&!x.needsReview)(store.get('payments/'+ref)));
 const w0=stats.userWrites;
 const w1=await call(hook,webhook({event:'charge.success',data:{reference:ref}})),w2=await call(hook,webhook({event:'charge.success',data:{reference:ref}}));
 T('duplicate webhook notifications do not process twice',w1.code===200&&w2.code===200&&stats.userWrites===w0);
 T('webhook with a bad signature is rejected',(await call(hook,webhook({event:'charge.success',data:{reference:ref}},'00'.repeat(64)))).code===401);
 T('already-owned atoll is never charged again',(await call(init,{method:'POST',headers:A('u1'),body:{item:'atoll'}})).body.owned===true);
 T('repeating the payment check does not change ownership',(await call(prem,{headers:A('u1'),query:{reference:ref}})).body.owned.atoll===true&&stats.userWrites===w0);
 PS.FAKE={id:9,status:'success',amount:340000,currency:'NGN',reference:'FAKE'};
 await call(hook,webhook({event:'charge.success',data:{reference:'FAKE'}}));
 T('a reference the server never created cannot unlock anything',!store.get('users/ghost')&&!store.get('payments/FAKE'));

 // ---------- restore ----------
 let r3=await call(init,{method:'POST',headers:A('u3'),body:{item:'atoll'}});pay(r3.body.reference);
 T('restore: a payment finished while the app was closed is applied',(await call(prem,{headers:A('u3'),query:{}})).body.owned.atoll===true);
 T('restore: account with no purchase stays locked',(await call(prem,{headers:A('u4'),query:{}})).body.owned.atoll===false);

 // ---------- future products (enabled here only to test the rules) ----------
 enableAll();
 let c=await call(cat,{headers:A('u1')});
 T('catalog shows personalised prices (atoll owner)',(x=>x.find(i=>i.id==='atoll').owned===true&&x.find(i=>i.id==='bundle_all').amount===400000&&x.find(i=>i.id==='toy').amount===250000)(c.body.items));
 let b1=await call(init,{method:'POST',headers:A('u5'),body:{item:'bundle_new'}});
 T('bundle_new: 4,000 for toy+third',INIT.at(-1).amount===400000&&store.get('payments/'+b1.body.reference).maps.join()==='toy,third');
 pay(b1.body.reference);await call(prem,{headers:A('u5'),query:{}});
 T('bundle_new unlocks toy AND third, not atoll',owned('u5').toy&&owned('u5').third&&!owned('u5').atoll);
 T('bundle owner is not charged for either map again',(await call(init,{method:'POST',headers:A('u5'),body:{item:'toy'}})).body.owned===true&&(await call(init,{method:'POST',headers:A('u5'),body:{item:'bundle_new'}})).body.owned===true);
 let b2=await call(init,{method:'POST',headers:A('u5'),body:{item:'bundle_all'}});
 T('after bundle_new, complete collection costs only the missing atoll (3,400)',INIT.at(-1).amount===340000&&store.get('payments/'+b2.body.reference).maps.join()==='atoll');
 pay(b2.body.reference);await call(prem,{headers:A('u5'),query:{}});
 T('then all three maps are owned',ALL.every(m=>owned('u5')[m]));
 let b3=await call(init,{method:'POST',headers:A('u6'),body:{item:'bundle_all'}});pay(b3.body.reference);await call(prem,{headers:A('u6'),query:{}});
 T('bundle_all from scratch: 6,800 unlocks all three',INIT.at(-1).amount===680000&&ALL.every(m=>owned('u6')[m]));
 {const m6=(await call(prem,{headers:A('u6'),query:{}})).body.maps;T('owner of all maps receives atoll (8 holes) and Toy World (9 holes); third map has no content yet',m6.atoll.length===8&&m6.toy.length===9&&!m6.third)}
 // two overlapping unpaid checkouts, both then paid: nothing removed, nothing granted twice, flagged for refund review
 let o1=await call(init,{method:'POST',headers:A('u7'),body:{item:'toy'}}),o2=await call(init,{method:'POST',headers:A('u7'),body:{item:'bundle_new'}});
 T('starting a new checkout supersedes the old unpaid one',store.get('payments/'+o1.body.reference).status==='superseded'&&store.get('payments/'+o2.body.reference).status==='pending');
 pay(o2.body.reference);await call(prem,{headers:A('u7'),query:{}});pay(o1.body.reference);await call(prem,{headers:A('u7'),query:{}});
 const late=store.get('payments/'+o1.body.reference);
 T('late payment of an old checkout: no map lost or double-granted, flagged needsReview',owned('u7').toy&&owned('u7').third&&late.needsReview===true&&late.overlap.join()==='toy'&&late.granted.length===0);
 {const m7=(await call(prem,{headers:A('u7'),query:{}})).body.maps;T('toy-only owner receives Toy World data but NOT Celestial Atoll data',m7.toy&&m7.toy.length===9&&!m7.atoll)}
 {const m1=(await call(prem,{headers:A('u1'),query:{}})).body.maps;T('atoll-only owner receives Atoll data but NOT Toy World data',m1.atoll&&!m1.toy)}
 Object.values(C.ITEMS).forEach(i=>{i.enabled=(i===C.ITEMS.atoll)});

 // ---------- legacy buyers (before migration) ----------
 store.set('users/legacy',{premium:true,premiumRef:'OLD-1'});
 store.set('payments/OLD-1',{uid:'legacy',email:'legacy@mail.com',amount:340000,currency:'NGN',status:'fulfilled'});
 T('legacy buyer keeps atoll even BEFORE migration',(await call(prem,{headers:A('legacy'),query:{}})).body.owned.atoll===true);
 T('legacy buyer is not charged again',(await call(init,{method:'POST',headers:A('legacy'),body:{item:'atoll'}})).body.owned===true);
 store.set('users/lp',{});store.set('payments/OLD-2',{uid:'lp',email:'lp@mail.com',amount:340000,currency:'NGN',status:'pending'});
 PS['OLD-2']={id:5,status:'success',amount:340000,currency:'NGN',reference:'OLD-2'};
 T('legacy pending payment (no item field) still completes as atoll',(await call(prem,{headers:A('lp'),query:{}})).body.owned.atoll===true);

 // ---------- migration ----------
 store.set('users/m1',{premium:true,premiumRef:'R1',email:'m1@x'});store.set('users/m2',{email:'m2@x'});store.set('users/m3',{premium:true,owned:{atoll:true}});
 store.set('payments/MP1',{uid:'m1',amount:340000,currency:'NGN',status:'fulfilled'});store.set('payments/MP2',{uid:'m3',item:'atoll',maps:['atoll'],amount:340000,status:'fulfilled'});
 const snap=()=>JSON.stringify([...store.entries()]);
 const before=snap(),nUsers=[...store.keys()].filter(k=>k.startsWith('users/')).length,nPay=[...store.keys()].filter(k=>k.startsWith('payments/')).length;
 const dry=await migrate(require('./mock-firestore').firestore(),{apply:false});
 T('migration dry run writes nothing',snap()===before&&dry.applied===false&&dry.usersUpdated>=1);
 const run1=await migrate(mock.firestore(),{apply:true}),after1=snap();
 T('migration converts premium buyers to owned.atoll and keeps the legacy flag',store.get('users/m1').owned.atoll===true&&store.get('users/m1').premium===true&&store.get('users/m1').premiumRef==='R1'&&store.get('users/m1').email==='m1@x');
 T('migration tags old payments as item atoll without changing amounts or status',(x=>x.item==='atoll'&&x.maps.join()==='atoll'&&x.amount===340000&&x.status==='fulfilled'&&x.uid==='m1')(store.get('payments/MP1')));
 T('migration leaves non-buyers and already-migrated records alone',!store.get('users/m2').owned&&store.get('payments/MP2').migratedAt===undefined);
 const run2=await migrate(mock.firestore(),{apply:true});
 T('migration is safe to re-run (second run changes nothing)',snap()===after1&&run2.usersUpdated===0&&run2.paymentsUpdated===0);
 T('migration deleted nothing',[...store.keys()].filter(k=>k.startsWith('users/')).length===nUsers&&[...store.keys()].filter(k=>k.startsWith('payments/')).length===nPay);
 T('migrated buyer still has access and is not charged again',(await call(prem,{headers:A('m1'),query:{}})).body.owned.atoll===true&&(await call(init,{method:'POST',headers:A('m1'),body:{item:'atoll'}})).body.owned===true);

 // ---------- account deletion keeps accounting records but drops the identity ----------
 await call(del,{method:'POST',headers:A('u1')});
 T('account deletion removes the user, detaches payment email, keeps the record',!store.get('users/u1')&&store.get('payments/'+ref).email===null&&store.get('payments/'+ref).status==='fulfilled'&&stats.deleted.includes('u1'));

 console.log(out.join('\n'));console.log('\n'+(out.length-fails)+' passed, '+fails+' failed');
 process.exit(fails?1:0);
})().catch(e=>{console.error('TEST CRASH',e);process.exit(1)});
