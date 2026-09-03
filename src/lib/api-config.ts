/**
 * API Configuration
 */
export const API_BASE_URL = "/api/proxy";

export const API_ENDPOINTS = {
  login: "/auth/login", logout: "/auth/logout", refresh: "/auth/refresh",
  me: "/auth/me", changePassword: "/auth/change-password",
  lines: "/lines", linesBulkUpdate: "/lines/bulk-update", lineTowers: (id: number) => `/lines/${id}/towers`,
  towers: "/towers", towerBulkUpdate: "/towers/bulk-update", towerNearby: "/towers/nearby",
  defects: "/defects", defectApprove: (id: number) => `/defects/${id}/approve`,
  defectVerify: (id: number) => `/defects/${id}/verify`,
  defectCategories: "/defect-categories", defectDefinitions: "/defect-definitions",
  inspections: "/inspections", inspectionApprove: (id: number) => `/inspections/${id}/approve`,
  workOrders: "/work-orders", workOrderAssign: (id: number) => `/work-orders/${id}/assign`,
  workOrderStart: (id: number) => `/work-orders/${id}/start`,
  workOrderComplete: (id: number) => `/work-orders/${id}/complete`,
  workOrderClose: (id: number) => `/work-orders/${id}/close`,
  dashboardStats: "/dashboard/stats", dashboardRecentDefects: "/dashboard/recent-defects",
  dashboardDefectsByCategory: "/dashboard/defects-by-category",
  users: "/users",
  // v4.3.83: نقش‌ها — دسترسی‌ها روی نقش تعریف و به کاربران تخصیص داده می‌شوند
  roles: "/roles",
  contracts: "/contracts", invoices: "/invoices",
  safetyIncidents: "/safety-incidents",
  personnel: "/personnel", contractors: "/contractors",
  // v3.0.0: مدارها — منبع کدهای دیسپاچینگ
  circuits: "/circuits",
  // v3.5.0: انواع سیم‌ها
  conductors: "/conductors",
  // v4.3.78: امور بهره‌برداری — داده‌های پایه
  districts: "/districts",
  equipment: "/equipment", equipmentClasses: "/equipment-classes",
  priceLists: "/price-lists", priceListItems: "/price-list-items",
  checklistTemplates: "/checklist-templates",
  auditLog: "/audit-log", organization: "/organization", crews: "/crews",
} as const;

export const TOKEN_KEY = "powerline_access_token";
export const REFRESH_TOKEN_KEY = "powerline_refresh_token";
export const USER_KEY = "powerline_user";
