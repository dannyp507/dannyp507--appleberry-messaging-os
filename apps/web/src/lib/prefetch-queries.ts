import { api } from "@/lib/api/client";
import type {
  Campaign,
  ChatbotFlowSummary,
  DashboardAnalytics,
  InboxThread,
} from "@/lib/api/types";

/** Shared fetchers for React Query `prefetchQuery` (nav hover / route warmup). */
export const prefetchFetchers = {
  analyticsDashboard: async () => {
    const { data } = await api.get<DashboardAnalytics>("/analytics/dashboard");
    return data;
  },
  campaigns: async () => {
    const { data } = await api.get<Campaign[]>("/campaigns");
    return data;
  },
  chatbotFlows: async () => {
    const { data } = await api.get<ChatbotFlowSummary[]>("/chatbot/flows");
    return data;
  },
  contacts: async () => {
    const { data } = await api.get<{ items: unknown[]; total: number }>(
      "/contacts",
      { params: { take: 25, skip: 0 } },
    );
    return data;
  },
  inboxThreads: async () => {
    const { data } = await api.get<InboxThread[]>("/inbox/threads");
    return data;
  },
};
