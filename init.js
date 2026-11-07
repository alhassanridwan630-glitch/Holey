const L=require('./_lib'),C=L.C;
// Starts a Paystack checkout. The SERVER decides the product, maps and price; the browser only names the item.
module.exports=async(req,res)=>{
  try{
    if(req.method!=='POST')return res.status(405).end();
    const u=await L.user(req);
    if(!u.email)throw L.E('An account email is required',400);
    const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const item=String(b.item||'atoll'),it=C.ITEMS[item];
    if(!it)throw L.E('Unknown item',400);
    if(!it.enabled)throw L.E('This map is not available yet',400);
    await L.settlePending(u.uid);                                   // anything already paid is applied first
    const ur=L.db.collection('users').doc(u.uid),owned=C.ownedOf((await ur.get()).data()),q=C.quote(item,owned);
    if(!q.maps.length)return res.status(200).json({owned:true});    // never charge for maps already owned
    const old=await L.db.collection('payments').where('uid','==',u.uid).where('status','==','pending').limit(10).get();
    for(const d of old.docs)await L.db.collection('payments').doc(d.id).update({status:'superseded'});
    const ref='HOLEY-'+u.uid.slice(0,6)+'-'+Date.now()+'-'+L.crypto.randomBytes(3).toString('hex');
    await L.db.collection('payments').doc(ref).set({uid:u.uid,email:u.email,item,maps:q.maps,amount:q.amount,currency:C.CUR,status:'pending',createdAt:new Date().toISOString()});
    const origin=process.env.SITE_URL||('https://'+req.headers.host);
    const j=await L.ps('/transaction/initialize',{method:'POST',body:JSON.stringify({email:u.email,amount:q.amount,currency:C.CUR,reference:ref,callback_url:origin+'/',metadata:{uid:u.uid,item,maps:q.maps}})});
    if(!j||!j.status){await L.db.collection('payments').doc(ref).update({status:'failed'});throw L.E('Could not start the payment. Please try again.',502)}
    res.status(200).json({url:j.data.authorization_url,reference:ref,amount:q.amount,maps:q.maps});
  }catch(e){res.status(e.code||500).json({error:e.code?e.message:'Server error'})}
};
