import { AlertTriangle,CheckCircle2,Clock3,MapPin } from "lucide-react";
import { severityClass,label } from "@/lib/roadsense-data";
export function PageTitle({title,subtitle,actions}:{title:string;subtitle:string;actions?:React.ReactNode}){return <div className="page-title"><div><h2>{title}</h2><p>{subtitle}</p></div>{actions}</div>}
export function SeverityPill({value}:{value:number}){return <span className={`severity-pill ${severityClass(value)}`}>{value.toFixed(1)}</span>}
export function Empty(){return <div className="grid min-h-48 place-items-center text-center text-muted-foreground"><div><MapPin className="mx-auto mb-2"/><p>No matching records</p></div></div>}
export function Status({kind}:{kind:'worsened'|'new'|'repaired'}){const cfg:{icon:typeof AlertTriangle;label:string}={worsened:{icon:AlertTriangle,label:'Worsened'},new:{icon:Clock3,label:'New'},repaired:{icon:CheckCircle2,label:'Repaired'}}[kind];const Icon=cfg.icon;return <span className={`status ${kind}`}><Icon/>{cfg.label}</span>}
export {label};
