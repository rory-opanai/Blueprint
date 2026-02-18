import { DealListOptions } from "@/lib/types";
import { getDealById, listDealsForUser } from "@/lib/services/deal-aggregator";

export async function getDashboardData(options?: DealListOptions) {
  return listDealsForUser(options);
}

export async function getDealData(opportunityId: string, options?: DealListOptions) {
  return getDealById(opportunityId, options);
}
