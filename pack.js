(function(){var P=globalThis.ORD_PACKS,left=P.packs.length;
P.packs.forEach(function(p){fetch(p.file).then(function(r){if(!r.ok)throw new Error(r.status);return r.arrayBuffer();}).then(function(buf){
  var tgt=p.grp==='sounds'?globalThis.ORD_SOUNDS:globalThis.ORD_ART[p.grp];
  p.ent.forEach(function(e){var url=null,mk=function(){return url||(url=URL.createObjectURL(new Blob([new Uint8Array(buf,e[1],e[2])],{type:P.mime[e[3]]})));};
    if(p.field){var o=tgt[e[0]];Object.defineProperty(o,p.field,{get:mk,configurable:true});}
    else Object.defineProperty(tgt,e[0],{get:mk,enumerable:true,configurable:true});});
}).catch(function(err){console.warn('ORD pack',p.file,err);}).then(function(){if(--left===0)globalThis.ORD_PACK_PENDING=false;globalThis.dispatchEvent(new Event('ord-pack'));});});})();