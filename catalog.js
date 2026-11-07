const L=require('./_lib'),C=L.C;
// Personalised offers: the price shown is what THIS account would pay (never for maps it already owns).
module.exports=async(req,res)=>{
  try{
    const u=await L.user(req),owned=C.ownedOf((await L.db.collection('users').doc(u.uid).get()).data());
    const items=Object.keys(C.ITEMS).map(id=>{const it=C.ITEMS[id],q=C.quote(id,owned);return{id,name:it.name,enabled:it.enabled,maps:it.maps,owned:q.maps.length===0,needs:q.maps,amount:q.amount}});
    res.status(200).json({items});
  }catch(e){res.status(e.code||500).json({error:e.code?e.message:'Server error'})}
};
