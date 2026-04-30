import type { ChatbotNodeType } from "@/lib/api/types";

// ─── Build API content JSON from flat form state ──────────────────────────────

export function buildContent(
  nodeType: ChatbotNodeType,
  config: Record<string, string>,
): Record<string, unknown> {
  switch (nodeType) {
    case "TEXT":
      return { text: config.text ?? "" };
    case "QUESTION":
      return { prompt: config.prompt ?? "", variableKey: config.variableKey ?? "answer" };
    case "CONDITION":
      return { variableKey: config.variableKey ?? "lastInput" };
    case "AI_REPLY":
      return { systemPrompt: config.systemPrompt ?? "" };
    case "SAVE_TO_SHEET": {
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(config)) {
        if (k.startsWith("fields.") && v.trim()) fields[k.replace("fields.", "")] = v.trim();
      }
      return { fields };
    }
    case "CHECK_CALENDAR":
      return {
        dateVariable:   config.dateVariable   || "date",
        hourVariable:   config.hourVariable   || "hour",
        resultVariable: config.resultVariable || "availability",
      };
    case "CREATE_BOOKING":
      return {
        nameVariable:    config.nameVariable    || "name",
        emailVariable:   config.emailVariable   || "email",
        serviceVariable: config.serviceVariable || "service",
        dateVariable:    config.dateVariable    || "availableDate",
        hourVariable:    config.hourVariable    || "availableHour",
        resultVariable:  config.resultVariable  || "bookingLink",
      };
    case "BUTTONS": {
      const buttons: { id: string; label: string }[] = [];
      for (let i = 1; i <= 3; i++) {
        const label = config[`btn${i}`]?.trim();
        if (label) buttons.push({ id: `btn_${label.toLowerCase().replace(/\s+/g, "_")}`, label });
      }
      return { prompt: config.prompt ?? "", buttons };
    }
    case "LIST": {
      const rows: { id: string; title: string; description?: string }[] = [];
      for (let i = 1; i <= 10; i++) {
        const title = config[`row${i}title`]?.trim();
        if (title) {
          const desc = config[`row${i}desc`]?.trim();
          rows.push({ id: `row_${i}`, title, ...(desc ? { description: desc } : {}) });
        }
      }
      const sections = rows.length > 0
        ? [{ ...(config.sectionTitle ? { title: config.sectionTitle } : {}), rows }]
        : [];
      return { prompt: config.prompt ?? "", buttonText: config.buttonText || "See Options", sections };
    }
    case "MEDIA":
      return { url: config.url ?? "", caption: config.caption ?? "", mediaType: config.mediaType ?? "image" };
    case "TAG_CONTACT":
    case "WEBHOOK":
      return { type: "TAG", tagName: config.tagName ?? "" };
    case "HUMAN_HANDOFF":
      return { message: config.message ?? "" };
    case "END":
      return { message: config.message ?? "" };
    default:
      return {};
  }
}

// ─── Flatten API content back to flat form state ─────────────────────────────

export function flattenContent(
  nodeType: ChatbotNodeType,
  content: Record<string, unknown>,
): Record<string, string> {
  const flat: Record<string, string> = {};
  const str = (v: unknown) => (v != null ? String(v) : "");

  switch (nodeType) {
    case "TEXT":
      flat.text = str(content.text);
      break;
    case "QUESTION":
      flat.prompt = str(content.prompt);
      flat.variableKey = str(content.variableKey);
      break;
    case "CONDITION":
      flat.variableKey = str(content.variableKey);
      break;
    case "AI_REPLY":
      flat.systemPrompt = str(content.systemPrompt);
      break;
    case "SAVE_TO_SHEET": {
      const fields = (content.fields ?? {}) as Record<string, string>;
      for (const [k, v] of Object.entries(fields)) flat[`fields.${k}`] = str(v);
      break;
    }
    case "CHECK_CALENDAR":
      flat.dateVariable   = str(content.dateVariable);
      flat.hourVariable   = str(content.hourVariable);
      flat.resultVariable = str(content.resultVariable);
      break;
    case "CREATE_BOOKING":
      flat.nameVariable    = str(content.nameVariable);
      flat.emailVariable   = str(content.emailVariable);
      flat.serviceVariable = str(content.serviceVariable);
      flat.dateVariable    = str(content.dateVariable);
      flat.hourVariable    = str(content.hourVariable);
      flat.resultVariable  = str(content.resultVariable);
      break;
    case "BUTTONS": {
      flat.prompt = str(content.prompt);
      const btns = (content.buttons ?? []) as { label: string }[];
      btns.forEach((b, i) => { flat[`btn${i + 1}`] = b.label; });
      break;
    }
    case "LIST": {
      flat.prompt = str(content.prompt);
      flat.buttonText = str(content.buttonText);
      const secs = (content.sections ?? []) as { title?: string; rows?: { title: string; description?: string }[] }[];
      if (secs[0]) {
        flat.sectionTitle = str(secs[0].title);
        (secs[0].rows ?? []).forEach((r, i) => {
          flat[`row${i + 1}title`] = r.title;
          if (r.description) flat[`row${i + 1}desc`] = r.description;
        });
      }
      break;
    }
    case "MEDIA":
      flat.url       = str(content.url);
      flat.caption   = str(content.caption);
      flat.mediaType = str(content.mediaType) || "image";
      break;
    case "TAG_CONTACT":
    case "WEBHOOK":
      flat.tagName = str(content.tagName);
      break;
    case "HUMAN_HANDOFF":
    case "END":
      flat.message = str(content.message);
      break;
  }
  return flat;
}
