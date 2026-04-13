export const qk = {
  workspaces: ["workspaces"] as const,
  campaigns: ["campaigns"] as const,
  campaignReport: (id: string) => ["campaign-report", id] as const,
  contacts: (params: { search?: string; skip?: number; take?: number }) =>
    ["contacts", params] as const,
  contactGroups: ["contact-groups"] as const,
  contactGroupMembers: (id: string, params?: { skip?: number; take?: number }) =>
    ["contact-group-members", id, params] as const,
  templates: ["templates"] as const,
  whatsappAccounts: ["whatsapp-accounts"] as const,
  inboxThreads: ["inbox-threads"] as const,
  inboxMessages: (threadId: string) => ["inbox-messages", threadId] as const,
  chatbotFlows: ["chatbot-flows"] as const,
  chatbotFlow: (id: string) => ["chatbot-flow", id] as const,
  analyticsDashboard: ["analytics", "dashboard"] as const,
  autoresponderRules: ["autoresponder-rules"] as const,
  keywordTriggers: ["keyword-triggers"] as const,
};
