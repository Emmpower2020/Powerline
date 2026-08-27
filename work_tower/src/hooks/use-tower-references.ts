"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
export interface TowerStructureOption { id:number; name:string }
export interface TowerTypeCodeOption { id:number; code:string; title?:string|null }
export function useTowerReferences(enabled=true) {
  const [structures,setStructures]=useState<TowerStructureOption[]>([]), [typeCodes,setTypeCodes]=useState<TowerTypeCodeOption[]>([]), [loading,setLoading]=useState(false);
  useEffect(()=>{ if(!enabled)return; let alive=true; setLoading(true); apiClient.get<any>("tower-references").then(r=>{if(!alive)return;setStructures(Array.isArray(r?.tower_structures)?r.tower_structures:[]);setTypeCodes(Array.isArray(r?.tower_type_codes)?r.tower_type_codes:[])}).finally(()=>alive&&setLoading(false)); return()=>{alive=false}},[enabled]);
  return {structures,typeCodes,loading};
}
