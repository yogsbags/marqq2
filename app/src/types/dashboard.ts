export interface ModuleStats {
  id: string;
  name: string;
  metrics: {
    label: string;
    value: string | number;
    change?: number;
  }[];
  color: string;
}

export interface DashboardData {
  overallMetrics: {
    totalLeads: number;
    conversionRate: number;
    roiImprovement: number;
    activeUsers: number;
  };
  modules: ModuleStats[];
}