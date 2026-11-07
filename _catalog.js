// Single source of truth for premium products, prices and ownership rules. All amounts are in kobo (NGN x 100).
// A product is only sold when enabled:true. Keep Toy World / third map / bundles disabled until their content ships.
const ITEMS={
  atoll:     {name:'Celestial Atoll',            maps:['atoll'],               enabled:true},
  toy:       {name:'Toy World',                  maps:['toy'],                 enabled:false},
  third:     {name:'Third Premium Map',          maps:['third'],               enabled:false},
  bundle_new:{name:'Toy World + Third Map',      maps:['toy','third'],         enabled:false},
  bundle_all:{name:'Complete Premium Collection',maps:['atoll','toy','third'], enabled:false}
};
// Every sellable offer: which maps it unlocks and its price.
const OFFERS=[[['atoll'],340000],[['toy'],250000],[['third'],250000],[['toy','third'],400000],[['atoll','toy','third'],680000]];
const MAP_IDS=['atoll','toy','third'];
const CUR='NGN';
// Cheapest way to buy exactly this set of maps using the offers above (players never pay for maps they own).
function cost(set){const memo={};const f=s=>{if(!s.length)return 0;const k=s.slice().sort().join('|');if(k in memo)return memo[k];let best=Infinity;for(const [m,p] of OFFERS)if(m.every(x=>s.includes(x)))best=Math.min(best,p+f(s.filter(x=>!m.includes(x))));return memo[k]=best};return f([...set])}
// Ownership of a user document. Legacy field premium:true always counts as owning Celestial Atoll.
function ownedOf(u){const o=Object.assign({},u&&u.owned);if(u&&u.premium)o.atoll=true;return o}
function quote(item,owned){const it=ITEMS[item];if(!it)return null;const need=it.maps.filter(m=>!owned[m]);return{item,maps:need,amount:need.length?cost(need):0}}
module.exports={ITEMS,OFFERS,MAP_IDS,CUR,cost,ownedOf,quote};
