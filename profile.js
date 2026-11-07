const L=require('./_lib');
const OK=/^[\p{L}\p{N} _.\-]{2,16}$/u;
// Saves/loads the player's name and avatar so they follow the account across devices.
module.exports=async(req,res)=>{
  try{
    const u=await L.user(req),ref=L.db.collection('users').doc(u.uid);
    if(req.method==='POST'){
      const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const name=String(b.name||'').replace(/\s+/g,' ').trim(),av=Number(b.av);
      if(name&&!OK.test(name))throw L.E('Invalid name',400);
      if(!Number.isInteger(av)||av<0||av>7)throw L.E('Invalid avatar',400);
      await ref.set({profile:{name,av,avs:b.avs?1:0,pt:Date.now()}},{merge:true});
      return res.status(200).json({ok:true});
    }
    const d=(await ref.get()).data();
    res.status(200).json({profile:(d&&d.profile)||null});
  }catch(e){res.status(e.code||500).json({error:e.code?e.message:'Server error'})}
};
