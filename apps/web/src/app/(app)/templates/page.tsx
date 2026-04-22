"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import type { Template, TemplateButton, TemplateSection } from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type TemplateType = "TEXT" | "MEDIA" | "BUTTON" | "LIST";

const TYPE_LABELS: Record<TemplateType, string> = {
  TEXT: "Text", MEDIA: "Media", BUTTON: "Button", LIST: "List",
};
const TYPE_COLORS: Record<TemplateType, string> = {
  TEXT: "bg-[#6366F1]/10 text-[#6366F1]",
  MEDIA: "bg-emerald-500/10 text-emerald-400",
  BUTTON: "bg-[#EC4899]/10 text-[#EC4899]",
  LIST: "bg-amber-500/10 text-amber-400",
};

function emptyButton(): TemplateButton { return { type: "QUICK_REPLY", text: "" }; }
function emptySection(): TemplateSection {
  return { title: "", rows: [{ id: crypto.randomUUID(), title: "", description: "" }] };
}

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<TemplateType>("TEXT");
  const [header, setHeader] = useState("");
  const [content, setContent] = useState("");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<TemplateButton[]>([emptyButton()]);
  const [sections, setSections] = useState<TemplateSection[]>([emptySection()]);

  const resetForm = () => {
    setName(""); setType("TEXT"); setHeader(""); setContent("");
    setFooter(""); setButtons([emptyButton()]); setSections([emptySection()]);
  };

  const { data: templates = [], isLoading } = useQuery({
    queryKey: qk.templates,
    queryFn: async () => {
      const { data } = await api.get<Template[]>("/templates");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/templates", {
        name, content, type,
        header: header || undefined,
        footer: footer || undefined,
        buttons: type === "BUTTON" ? buttons : undefined,
        sections: type === "LIST" ? sections : undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.templates });
      setOpen(false); resetForm();
      toast.success("Template created");
    },
    onError: (e) => toast.error("Could not create template", getApiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.templates }),
    onError: (e) => toast.error("Could not delete template", getApiErrorMessage(e)),
  });

  const previewTemplate = templates.find((t) => t.id === previewId);

  const updateButton = (i: number, patch: Partial<TemplateButton>) =>
    setButtons((b) => b.map((btn, idx) => idx === i ? { ...btn, ...patch } : btn));
  const removeButton = (i: number) => setButtons((b) => b.filter((_, idx) => idx !== i));
  const updateSection = (si: number, patch: Partial<TemplateSection>) =>
    setSections((s) => s.map((sec, idx) => idx === si ? { ...sec, ...patch } : sec));
  const addRow = (si: number) =>
    setSections((s) => s.map((sec, idx) => idx === si
      ? { ...sec, rows: [...sec.rows, { id: crypto.randomUUID(), title: "", description: "" }] } : sec));
  const updateRow = (si: number, ri: number, patch: { title?: string; description?: string }) =>
    setSections((s) => s.map((sec, idx) => idx === si
      ? { ...sec, rows: sec.rows.map((r, rIdx) => rIdx === ri ? { ...r, ...patch } : r) } : sec));
  const removeRow = (si: number, ri: number) =>
    setSections((s) => s.map((sec, idx) => idx === si
      ? { ...sec, rows: sec.rows.filter((_, rIdx) => rIdx !== ri) } : sec));

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#111827]">Templates</h2>
          <p className="text-sm text-[#6B7280] mt-1">Message templates used in campaigns</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="px-4 py-2 stitch-gradient rounded-lg text-sm font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.25)] hover:opacity-90 transition-all flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">add</span>New Template
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-[#F9FAFB] rounded-xl" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="material-symbols-outlined text-5xl text-[#262B33] mb-4">layers</span>
          <p className="text-[#6B7280]">No templates yet. Create your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-[#F9FAFB] border border-[#F3F4F6] rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-[#111827] text-sm leading-snug">{t.name}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${TYPE_COLORS[t.type as TemplateType] ?? "bg-[#F3F4F6] text-[#6B7280]"}`}>
                  {TYPE_LABELS[t.type as TemplateType] ?? t.type}
                </span>
              </div>
              {t.header && <p className="text-xs font-semibold text-[#6B7280] truncate">{t.header}</p>}
              <p className="text-xs text-[#9CA3AF] line-clamp-3">{t.content}</p>
              {t.footer && <p className="text-[10px] text-[#9CA3AF]/70 italic">{t.footer}</p>}
              {t.buttons && t.buttons.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {t.buttons.map((btn, i) => (
                    <span key={i} className="px-2.5 py-1 border border-[#6366F1]/40 rounded-full text-[10px] font-medium text-[#6366F1]">{btn.text}</span>
                  ))}
                </div>
              )}
              {t.sections && t.sections.length > 0 && (
                <div className="text-[10px] text-[#9CA3AF]">
                  {t.sections.length} section{t.sections.length > 1 ? "s" : ""} · {t.sections.reduce((a, s) => a + s.rows.length, 0)} items
                </div>
              )}
              <div className="flex gap-2 mt-auto pt-2 border-t border-[#F3F4F6]">
                <button onClick={() => setPreviewId(t.id)}
                  className="flex-1 py-1.5 rounded-lg bg-[#F3F4F6] text-xs text-[#6B7280] hover:text-[#111827] transition-colors">Preview</button>
                <button onClick={() => { if (confirm("Delete this template?")) deleteMutation.mutate(t.id); }}
                  className="flex-1 py-1.5 rounded-lg bg-[#ff6e84]/10 text-xs text-[#ff6e84] hover:bg-[#ff6e84]/20 transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-[#F3F4F6] sticky top-0 bg-[#F9FAFB] z-10">
              <h3 className="text-lg font-bold text-[#111827]">Create Template</h3>
              <button onClick={() => { setOpen(false); resetForm(); }} className="text-[#6B7280] hover:text-[#111827]">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome Message"
                  className="w-full bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6366F1]/60" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {(["TEXT", "MEDIA", "BUTTON", "LIST"] as TemplateType[]).map((t) => (
                    <button key={t} onClick={() => setType(t)}
                      className={`py-2 rounded-lg text-xs font-bold transition-all ${type === t ? "stitch-gradient text-white" : "bg-[#F3F4F6] text-[#6B7280] hover:text-[#111827]"}`}>
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              {(type === "BUTTON" || type === "LIST" || type === "MEDIA") && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Header <span className="normal-case font-normal">(optional)</span></label>
                  <input value={header} onChange={(e) => setHeader(e.target.value)} placeholder="Header text"
                    className="w-full bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6366F1]/60" />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Body</label>
                <textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Message body... use {{1}} for variables"
                  className="w-full bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6366F1]/60 resize-none" />
              </div>
              {(type === "BUTTON" || type === "LIST") && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Footer <span className="normal-case font-normal">(optional)</span></label>
                  <input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Footer text"
                    className="w-full bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6366F1]/60" />
                </div>
              )}
              {type === "BUTTON" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Buttons (max 3)</label>
                    {buttons.length < 3 && (
                      <button onClick={() => setButtons((b) => [...b, emptyButton()])} className="text-xs text-[#6366F1] hover:underline">+ Add button</button>
                    )}
                  </div>
                  {buttons.map((btn, i) => (
                    <div key={i} className="bg-[#F3F4F6] border border-[#F3F4F6] rounded-xl p-4 space-y-3">
                      <div className="flex gap-2">
                        <select value={btn.type} onChange={(e) => updateButton(i, { type: e.target.value as TemplateButton["type"] })}
                          className="bg-[#F3F4F6] text-xs text-[#111827] rounded-lg px-2 py-1.5 border border-[#E5E7EB] focus:outline-none">
                          <option value="QUICK_REPLY">Quick Reply</option>
                          <option value="URL">URL</option>
                          <option value="PHONE">Phone</option>
                        </select>
                        <input value={btn.text} onChange={(e) => updateButton(i, { text: e.target.value })} placeholder="Button label"
                          className="flex-1 bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none" />
                        <button onClick={() => removeButton(i)} className="text-[#ff6e84] px-1">
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                      {(btn.type === "URL" || btn.type === "PHONE") && (
                        <input value={btn.value ?? ""} onChange={(e) => updateButton(i, { value: e.target.value })}
                          placeholder={btn.type === "URL" ? "https://example.com" : "+27123456789"}
                          className="w-full bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none" />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {type === "LIST" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Sections</label>
                    <button onClick={() => setSections((s) => [...s, emptySection()])} className="text-xs text-[#6366F1] hover:underline">+ Add section</button>
                  </div>
                  {sections.map((sec, si) => (
                    <div key={si} className="bg-[#F3F4F6] border border-[#F3F4F6] rounded-xl p-4 space-y-3">
                      <input value={sec.title} onChange={(e) => updateSection(si, { title: e.target.value })} placeholder="Section title"
                        className="w-full bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-sm font-semibold text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none" />
                      <div className="space-y-2">
                        {sec.rows.map((row, ri) => (
                          <div key={row.id} className="flex gap-2 items-start">
                            <div className="flex-1 space-y-1">
                              <input value={row.title} onChange={(e) => updateRow(si, ri, { title: e.target.value })} placeholder="Item title"
                                className="w-full bg-[#0B0E14] border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none" />
                              <input value={row.description ?? ""} onChange={(e) => updateRow(si, ri, { description: e.target.value })} placeholder="Description (optional)"
                                className="w-full bg-[#0B0E14] border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-xs text-[#6B7280] placeholder:text-[#9CA3AF] focus:outline-none" />
                            </div>
                            {sec.rows.length > 1 && (
                              <button onClick={() => removeRow(si, ri)} className="text-[#ff6e84] mt-1">
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            )}
                          </div>
                        ))}
                        <button onClick={() => addRow(si)} className="text-xs text-[#6366F1] hover:underline">+ Add item</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => { setOpen(false); resetForm(); }}
                className="px-4 py-2 rounded-lg text-sm text-[#6B7280] hover:text-[#111827] bg-[#F3F4F6] transition-colors">Cancel</button>
              <button disabled={createMutation.isPending || !name || !content} onClick={() => createMutation.mutate()}
                className="px-6 py-2 rounded-lg stitch-gradient text-sm font-semibold text-white hover:opacity-90 transition-all disabled:opacity-50">
                {createMutation.isPending ? "Saving…" : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setPreviewId(null)}>
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#111827]">{previewTemplate.name}</h3>
              <button onClick={() => setPreviewId(null)} className="text-[#6B7280] hover:text-[#111827]">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
            <div className="bg-[#F3F4F6] rounded-xl rounded-tl-none p-4 space-y-2 text-sm">
              {previewTemplate.header && <p className="font-bold text-[#111827] text-xs">{previewTemplate.header}</p>}
              <p className="text-[#111827] whitespace-pre-wrap">{previewTemplate.content}</p>
              {previewTemplate.footer && <p className="text-[10px] text-[#9CA3AF] italic">{previewTemplate.footer}</p>}
              {previewTemplate.buttons && previewTemplate.buttons.length > 0 && (
                <div className="pt-2 border-t border-[#F3F4F6] space-y-1.5">
                  {previewTemplate.buttons.map((btn, i) => (
                    <div key={i} className="text-center py-1.5 border border-[#6366F1]/40 rounded-lg text-xs font-medium text-[#6366F1]">
                      {btn.type === "URL" && <span className="material-symbols-outlined text-[12px] mr-1">open_in_new</span>}
                      {btn.type === "PHONE" && <span className="material-symbols-outlined text-[12px] mr-1">call</span>}
                      {btn.text}
                    </div>
                  ))}
                </div>
              )}
              {previewTemplate.sections && previewTemplate.sections.length > 0 && (
                <div className="pt-2 border-t border-[#F3F4F6]">
                  <div className="text-center py-1.5 border border-[#6366F1]/40 rounded-lg text-xs font-medium text-[#6366F1] flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">list</span>View options
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
