import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import Papa from "papaparse";

export type EventClass = "pothole" | "speed_breaker" | "broken_patch" | "road_vibration";
export type EventRow = { event_id:string; pass_id:string; timestamp:string; latitude:number; longitude:number; event_class:string; severity_0_5:number; detector_confidence:number; peak_vertical_g:number; speed_kmh:number; gps_accuracy_m:number; segment_id:string };
export type PassRow = { pass_id:string; bus_id:string; start_time:string; mean_speed_kmh:number; passengers_onboard:number };
export type SegmentRow = {
  segment_id: string;
  median_severity?: number;
  confidence: number;
  n_passes?: number;
  pass_count?: number;
  n_events?: number;
  event_count?: number;
  worst_class?: string;
  exposure_score?: number;
  condition_score?: number;
  condition_class?: "GOOD" | "MODERATE" | "POOR" | string;
  road_name?: string;
  road_type?: string;
  length_m?: number;
  pothole_count?: number;
  speed_breaker_count?: number;
  broken_patch_count?: number;
  roughness_count?: number;
  affected_pass_count?: number;
  unique_bus_count?: number;
  mean_severity?: number;
  max_severity?: number;
  suppressed_count?: number;
  explanation?: string;
  last_observed_at?: string;
};
export type SegmentFeature = { type:"Feature"; properties:{segment_id:string;start_chainage_m:number;length_m:number}; geometry:{type:"LineString";coordinates:number[][]} };
export type Signals = { t:number[];accel_x:number[];accel_y:number[];accel_z:number[];gyro_z:number[];speed:number[];detection_spans:{start:number;end:number;class:string}[];suppressed_spans:{start:number;end:number;class:string}[] };
export type Metrics = { per_class:Record<string,{precision:number;recall:number}>;confusion_matrix:number[][];false_positives:{before:number;after:number};naive_baseline:{precision:number;recall:number} };
type DataState={events:EventRow[];suppressed:EventRow[];passes:PassRow[];summaries:SegmentRow[];segments:SegmentFeature[];signals:Signals|null;metrics:Metrics|null;loading:boolean;source:string;replaceFile:(name:string,file:File)=>Promise<string>;reset:()=>void};
const C=createContext<DataState|null>(null);
const files=["events.csv","suppressed_events.csv","passes.csv","segment_summary.csv","segments.geojson","signals_sample.json","metrics.json"];
const parseCsv=<T,>(text:string)=>Papa.parse<T>(text,{header:true,dynamicTyping:true,skipEmptyLines:true}).data;
export function DataProvider({children}:{children:ReactNode}){
 const [version,setVersion]=useState(0); const [state,setState]=useState<Omit<DataState,"replaceFile"|"reset">>({events:[],suppressed:[],passes:[],summaries:[],segments:[],signals:null,metrics:null,loading:true,source:"Sample dataset"});
 useEffect(()=>{let live=true;(async()=>{const raw=await Promise.all(files.map(async f=>{const saved=localStorage.getItem(`roadsense:${f}`);if(saved)return saved;if(f==="segment_summary.csv"){try{const res=await fetch("/data/synthetic/segment_conditions_generated.csv");if(res.ok){const t=await res.text();if(t&&t.length>100)return t;}}catch{}}
if(f==="segments.geojson"){try{const res=await fetch("/data/synthetic/road_segments.geojson");if(res.ok){const t=await res.text();if(t&&t.length>100)return t;}}catch{}}return fetch(`/data/${f}`).then(r=>r.text())}));if(!live)return;const [events="",suppressed="",passes="",summaries="",segments="{}",signals="null",metrics="null"]=raw;setState({events:parseCsv<EventRow>(events),suppressed:parseCsv<EventRow>(suppressed),passes:parseCsv<PassRow>(passes),summaries:parseCsv<SegmentRow>(summaries),segments:(JSON.parse(segments).features??[]),signals:JSON.parse(signals),metrics:JSON.parse(metrics),loading:false,source:files.some(f=>localStorage.getItem(`roadsense:${f}`))?"Uploaded dataset":"Sample dataset"})})().catch(()=>setState(s=>({...s,loading:false})));return()=>{live=false}},[version]);
 const value=useMemo<DataState>(()=>({...state,replaceFile:async(name,file)=>{if(!files.includes(name))throw new Error("Use one of the supported filenames.");const text=await file.text();if(name.endsWith(".csv")){const parsed=Papa.parse(text,{header:true,skipEmptyLines:true});if(parsed.errors.length)throw new Error(parsed.errors[0]?.message??"Could not parse file");}else JSON.parse(text);localStorage.setItem(`roadsense:${name}`,text);setVersion(v=>v+1);return name;},reset:()=>{files.forEach(f=>localStorage.removeItem(`roadsense:${f}`));setVersion(v=>v+1)}}),[state]);
 return <C.Provider value={value}>{children}</C.Provider>
}
export const useRoadData=()=>{const v=useContext(C);if(!v)throw new Error("Road data unavailable");return v};
export const label=(s:string)=>s.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
export const severityClass=(v:number)=>v<1?"sev-0":v<2?"sev-1":v<3?"sev-2":v<4?"sev-3":v<5?"sev-4":"sev-5";
export const download=(name:string,body:string,type="text/csv")=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)};
