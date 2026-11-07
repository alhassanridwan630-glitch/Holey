// One-off, SAFE-TO-RE-RUN migration: legacy single "premium" flag -> per-map ownership.
//   node scripts/migrate-ownership.js            (dry run: prints what WOULD change, writes nothing)
//   node scripts/migrate-ownership.js --apply    (performs the changes)
// It only ADDS fields. It never deletes users, payments or the legacy premium field.
async function migrate(db,{apply=false}={}){
  const r={usersChecked:0,usersUpdated:0,paymentsChecked:0,paymentsUpdated:0,applied:apply};
  const us=await db.collection('users').get();
  for(const d of us.docs){
    r.usersChecked++;const u=d.data();
    if(u.premium&&!(u.owned&&u.owned.atoll)){r.usersUpdated++;if(apply)await db.collection('users').doc(d.id).set({owned:{atoll:true}},{merge:true})}
  }
  const ps=await db.collection('payments').get();
  for(const d of ps.docs){
    r.paymentsChecked++;const p=d.data();
    if(!p.item){r.paymentsUpdated++;if(apply)await db.collection('payments').doc(d.id).set({item:'atoll',maps:['atoll'],migratedAt:new Date().toISOString()},{merge:true})}
  }
  return r;
}
module.exports={migrate};
if(require.main===module){
  const admin=require('firebase-admin');
  if(!process.env.FIREBASE_SERVICE_ACCOUNT){console.error('Set FIREBASE_SERVICE_ACCOUNT first (the service-account JSON).');process.exit(1)}
  admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
  migrate(admin.firestore(),{apply:process.argv.includes('--apply')}).then(r=>{console.log(JSON.stringify(r,null,2));if(!r.applied)console.log('Dry run only. Re-run with --apply to make these changes.')}).catch(e=>{console.error('Migration failed:',e.message);process.exit(1)});
}
