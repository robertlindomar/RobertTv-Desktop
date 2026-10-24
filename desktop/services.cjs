const services = {
  netflix:{name:'Netflix',url:'https://www.netflix.com/br/',domains:['netflix.com']},
  youtube:{name:'YouTube',url:'https://www.youtube.com/',domains:['youtube.com','youtu.be','accounts.google.com','consent.google.com','consent.youtube.com']},
  prime:{name:'Prime Video',url:'https://www.primevideo.com/',domains:['primevideo.com','amazon.com','amazon.com.br','amazon.co.uk']},
  disney:{name:'Disney+',url:'https://www.disneyplus.com/pt-br',domains:['disneyplus.com','disney.com','mydisney.com','bamgrid.com']},
  hbo:{name:'HBO Max',url:'https://www.hbomax.com/br/pt',domains:['hbomax.com','max.com','auth.max.com']},
  paramount:{name:'Paramount+',url:'https://www.paramountplus.com/br/',domains:['paramountplus.com','paramount.com']},
  globo:{name:'Globoplay',url:'https://globoplay.globo.com/',domains:['globo.com']}
};
function allowed(id,value){try{const u=new URL(value);return u.protocol==='https:'&&services[id]?.domains.some(domain=>u.hostname===domain||u.hostname.endsWith('.'+domain));}catch{return false;}}
function serviceForURL(value){return Object.keys(services).find(id=>allowed(id,value));}
module.exports={services,allowed,serviceForURL};
