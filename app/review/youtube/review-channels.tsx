"use client";
import { useState } from "react";
import { send } from "@/lib/interactions/client";
import { YouTubePrivateUpload } from "@/components/YouTubePrivateUpload";
export function ReviewChannels({channels}: {channels:{id:string; label:string; status:string}[]}) {
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  return <section><button type="button" disabled={busy} onClick={async()=>{
    setBusy(true);
    const res=await send<{authorizeUrl:string}>("/api/keys/oauth/start","POST",{provider:"youtube"});
    if(res.ok) window.location.assign(res.authorizeUrl); else {setMessage(res.message);setBusy(false);}
  }}>Connect YouTube channel</button>
  {channels.map(c=><section key={c.id}><h2>{c.label}</h2>{c.status==="active" && <YouTubePrivateUpload channel={c.label} id={c.id} />}<button type="button" disabled={busy} onClick={async()=>{
    setBusy(true);const res=await send("/api/keys/connections/"+c.id+"/disconnect","POST",{});
    if(res.ok) window.location.reload();else {setMessage(res.message);setBusy(false);}
  }}>Disconnect this channel</button></section>)}<p role="status">{message}</p></section>;
}
