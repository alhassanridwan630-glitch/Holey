const L=require('./_lib'),C=L.C,M=require('./_maps');
// Confirms any payments with Paystack, then returns ownership and ONLY the course data for maps this account owns.
module.exports=async(req,res)=>{
  try{
    const u=await L.user(req),ref=req.query&&req.query.reference;
    if(ref){const s=await L.db.collection('payments').doc(String(ref)).get();if(s.exists&&s.data().uid===u.uid)await L.verifyRef(String(ref))}
    else await L.settlePending(u.uid);
    const owned=C.ownedOf((await L.db.collection('users').doc(u.uid).get()).data()),maps={},o={};
    for(const k of C.MAP_IDS){o[k]=!!owned[k];if(owned[k]&&M[k])maps[k]=M[k]}
    res.status(200).json({owned:o,maps});
  }catch(e){res.status(e.code||500).json({error:e.code?e.message:'Server error'})}
};
