const L=require('./_lib');
// Deletes the signed-in player's account data. Payment records are kept for accounting but detached from the email.
module.exports=async(req,res)=>{
  try{
    if(req.method!=='POST')return res.status(405).end();
    const u=await L.user(req);
    const q=await L.db.collection('payments').where('uid','==',u.uid).get();
    for(const d of q.docs)await L.db.collection('payments').doc(d.id).update({uid:'deleted',email:null,deletedAt:new Date().toISOString()});
    await L.db.collection('users').doc(u.uid).delete();
    try{await L.admin.auth().deleteUser(u.uid)}catch(e){}
    res.status(200).json({deleted:true});
  }catch(e){res.status(e.code||500).json({error:e.code?e.message:'Server error'})}
};
