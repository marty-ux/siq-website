module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();
  try {
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch(_) { b = {}; } }
    b = b || {};
    const token = process.env.AIRTABLE_TOKEN, base = process.env.AIRTABLE_BASE_ID;
    if (!token || !base) return res.status(204).end();
    const f = {
      "Timestamp": new Date().toISOString(),
      "Visitor ID": String(b.vid||"").slice(0,64),
      "Path": String(b.path||"").slice(0,512),
      "Page Title": String(b.title||"").slice(0,512),
      "Referrer": String(b.ref||"").slice(0,1024),
      "UTM Source": String(b.utm_source||""),
      "UTM Medium": String(b.utm_medium||""),
      "UTM Campaign": String(b.utm_campaign||""),
      "UTM Term": String(b.utm_term||""),
      "UTM Content": String(b.utm_content||""),
      "Screen": String(b.screen||""),
      "Country": String(req.headers['x-vercel-ip-country']||""),
      "User Agent": String(req.headers['user-agent']||"").slice(0,1024),
      "Event Type": String(b.type||"pageview")
    };
    await fetch("https://api.airtable.com/v0/"+base+"/"+encodeURIComponent("Web Signals"), {
      method:"POST",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body: JSON.stringify({ records:[{fields:f}], typecast:true })
    });
  } catch(e) {}
  return res.status(204).end();
};
