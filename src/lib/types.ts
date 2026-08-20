/**
 * Type definitions for the Powerline API entities
 */

export type LineType = "transmission" | "sub_transmission" | "distribution";

export interface Line {
  id: number;
  line_code: string;
  name: string;
  line_type: LineType;
  voltage_kv: number | null;
  circuit_count: number;
  conductor_type: string | null;
  length_km: number | null;
  owner_org_id: number | null;
  owner_org_name: string | null;
  contractor_id: number | null;
  contractor_name: string | null;
  construction_date: string | null;
  commission_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TowerType =
  | "lattice_steel"
  | "wood"
  | "concrete"
  | "concrete_tele"
  | "steel_tele"
  | "other";

export interface Tower {
  id: number;
  line_id: number;
  line_code: string | null;
  line_name: string | null;
  tower_code: string;
  tower_number: number | null;
  tower_type: TowerType;
  structure_type: string | null;
  foundation_type: string | null;
  insulator_type: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  altitude_m: number | null;
  construction_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  distance_meters?: number;
}

export type DefectStatus =
  | "new"
  | "approved"
  | "in_progress"
  | "repaired"
  | "verified"
  | "deferred"
  | "rejected"
  | "cancelled";

export type DefectPriority = "low" | "medium" | "high" | "critical";
export type DefectSeverity = "minor" | "major" | "critical";

export interface Defect {
  id: number;
  defect_code: string;
  title: string;
  description: string | null;
  defect_type: string | null;
  severity: DefectSeverity;
  priority: DefectPriority;
  safety_risk: "none" | "low" | "medium" | "high";
  status: DefectStatus;
  category_name: string | null;
  definition_title: string | null;
  line_id: number | null;
  line_code: string | null;
  line_name: string | null;
  tower_id: number | null;
  tower_code: string | null;
  tower_type: TowerType | null;
  discovered_by_name: string | null;
  discovered_at: string;
  gps_lat: number | null;
  gps_lng: number | null;
  location_desc: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DefectCategory {
  id: number;
  name: string;
  applies_to: "tower" | "line" | "equipment" | "all";
  tower_type: TowerType | "all";
  is_active: boolean;
  defect_count: number;
}

export interface DefectDefinition {
  id: number;
  category_id: number;
  category_name: string;
  defect_code: number;
  title: string;
  default_priority: DefectPriority;
  default_severity: DefectSeverity;
  safety_risk: "none" | "low" | "medium" | "high";
  is_active: boolean;
}

export type InspectionStatus =
  | "draft"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled";

export interface Inspection {
  id: number;
  inspection_code: string;
  line_id: number | null;
  line_code: string | null;
  line_name: string | null;
  tower_id: number | null;
  tower_code: string | null;
  inspector_name: string | null;
  inspection_date: string;
  start_time: string | null;
  end_time: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  status: InspectionStatus;
  priority: "routine" | "emergency" | "follow_up" | "commissioning";
  weather: string | null;
  notes: string | null;
  created_at: string;
}

export type WorkOrderStatus =
  | "draft"
  | "assigned"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled"
  | "verified";

export interface WorkOrder {
  id: number;
  wo_code: string;
  title: string;
  description: string | null;
  priority: DefectPriority;
  status: WorkOrderStatus;
  defect_id: number | null;
  related_defect_code: string | null;
  line_id: number | null;
  line_code: string | null;
  line_name: string | null;
  tower_id: number | null;
  tower_code: string | null;
  crew_id: number | null;
  crew_name: string | null;
  contractor_id: number | null;
  contractor_name: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  outage_required: boolean;
  equipment_used: string | null;
  materials_used: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  lines: {
    total: number;
    transmission: number;
    sub_transmission: number;
    distribution: number;
  };
  towers: {
    total: number;
    by_type: Record<string, number>;
  };
  defects: {
    total: number;
    new: number;
    approved: number;
    in_progress: number;
    repaired: number;
    verified: number;
    critical: number;
    high: number;
  };
  inspections: {
    total: number;
    today: number;
    this_week: number;
    pending_approval: number;
  };
  work_orders: {
    total: number;
    open: number;
    overdue: number;
  };
  users: {
    total: number;
    active: number;
  };
  contractors: {
    total: number;
  };
  safety: {
    incidents_this_month: number;
    near_miss_this_month: number;
  };
  activity_7_days: Array<{
    date: string;
    defects: number;
    inspections: number;
  }>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}
