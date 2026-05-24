import "dotenv/config";
const HYDRA="https://hydra-public.prod.m3.scopelypv.com/oauth2/token";
const BASE="https://api.marvelstrikeforce.com";
async function tok(){const b=Buffer.from(`${process.env.SCOPELY_CLIENT_ID}:${process.env.SCOPELY_CLIENT_SECRET}`).toString("base64");const r=await fetch(HYDRA,{method:"POST",headers:{Authorization:`Basic ${b}`,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});return (await r.json() as any).access_token;}
async function g(p:string,t:string){return (await (await fetch(BASE+p,{headers:{"x-api-key":process.env.MSF_API_KEY!,Authorization:`Bearer ${t}`,"User-Agent":"APIClient/1.0 (Server)"}})).json());}
(async()=>{const t=await tok();
  const cid="survivaltower_mighty_war_02_01_78de2e08";
  for (const path of [
    `/game/v1/nodeCombats/${cid}?charInfo=full&difficulty=0&difficultyGroup=survivaltower_war_02`,
    `/game/v1/nodeCombats/${cid}?charInfo=full&difficulty=0&difficultyGroup=survivaltower_war_02&statsFormat=csv`,
    `/game/v1/nodeCombats/${cid}?charInfo=full`,
  ]){
    console.log("\n=== "+path);
    const r:any = await g(path,t);
    const unit = r?.data?.right?.waves?.[0]?.units?.[0];
    console.log(JSON.stringify(unit, null, 2));
  }
})();
