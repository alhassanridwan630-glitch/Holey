const L=require('./_lib');
module.exports=async(req,res)=>{
  try{
    if(req.method!=='POST')return res.status(405).end();
    const raw=await new Promise((ok,no)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>ok(b));req.on('error',no)});
    const sig=String(req.headers['x-paystack-signature']||'');
    const h=L.crypto.createHmac('sha512',process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
    if(h.length!==sig.length||!L.crypto.timingSafeEqual(Buffer.from(h),Buffer.from(sig)))return res.status(401).end();
    const ev=JSON.parse(raw);
    if(ev.event==='charge.success'&&ev.data&&ev.data.reference)await L.verifyRef(ev.data.reference); // re-verified with Paystack, never trusted blindly
    res.status(200).end();
  }catch(e){res.status(500).end()}
};
module.exports.config={api:{bodyParser:false}};
