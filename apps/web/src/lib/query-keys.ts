export const qk = {
  workspaces: ["workspaces"] as const,
  campaigns: ["campaigns"] as const,
  campaignReport: (id: string) => ["campaign-report", id] as const,
  contacts: (params: { search?: string; skip?: number; take?: number; groupId?: string; optedOut?: boolean }) =>
    ["contacts", params] as const,
  contactGroups: ["contact-groups"] as const,
  contactGroupMembers: (id: string, params?: { skip?: number; take?: number }) =>
    ["contact-group-members", id, params] as const,
  templates: ["templates"] as const,
  whatsappAccounts: ["whatsapp-accounts"] as const,
  telegramAccounts: ["telegram-accounts"] as const,
  facebookPages: ["facebook-pages"] as const,
  facebookPage: (id: string) => ["facebook-page", id] as const,
  inboxThreads: ["inbox-threads"] as const,
  inboxMessages: (threadId: string) => ["inbox-messages", threadId] as const,
  chatbotFlows: ["chatbot-flows"] as const,
  chatbotFlow: (id: string) => ["chatbot-flow", id] as const,
  analyticsDashboard: ["analytics", "dashboard"] as const,
  autoresponderRules: ["autoresponder-rules"] as const,
  keywordTriggers: ["keyword-triggers"] as const,
  googleIntegrationStatus: ["google-integration-status"] as const,
  googleSpreadsheets: ["google-spreadsheets"] as const,
  googleSheetTabs: (spreadsheetId: string) => ["google-sheet-tabs", spreadsheetId] as const,
  googleCalendars: ["google-calendars"] as const,
  // Facebook comment automations
  fbCommentAutomations: ["fb-comment-automations"] as const,
  fbCommentAutomation: (id: string) => ["fb-comment-automation", id] as const,
  fbCommentEvents: (automationId: string) => ["fb-comment-events", automationId] as const,
  fbPagePosts: (pageId: string) => ["fb-page-posts", pageId] as const,
  // WhatsApp account AI settings
  waAccountAiSettings: (id: string) => ["wa-account-ai-settings", id] as const,
  // Facebook Page AI settings
  fbPageAiSettings: (id: string) => ["fb-page-ai-settings", id] as const,
  // Facebook Page chatbot flows
  fbPageFlows: (id: string) => ["fb-page-flows", id] as const,
  // Instagram accounts
  instagramAccounts: ["instagram-accounts"] as const,
  igAccountAiSettings: (id: string) => ["ig-account-ai-settings", id] as const,
  igAccountFlows: (id: string) => ["ig-account-flows", id] as const,
  // Instagram comment automations
  igCommentAutomations: ["ig-comment-automations"] as const,
  igCommentAutomation: (id: string) => ["ig-comment-automation", id] as const,
  igCommentEvents: (automationId: string) => ["ig-comment-events", automationId] as const,
  igAccountPosts: (accountId: string) => ["ig-account-posts", accountId] as const,
  // Workspace media library
  workspaceMedia: ["workspace-media"] as const,
  // Brand settings
  brandSettings: ["brand-settings"] as const,
};
