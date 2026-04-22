"use client";

import { api } from "@/lib/api/client";
import type { WhatsAppAccount } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";

export default function LinkGeneratorPage() {
  const [accountId, setAccountId] = useState("");
  const [message, setMessage] = useState("");
  const [waLink, setWaLink] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: qk.whatsappAccounts,
    queryFn: async () => {
      const { data } = await api.get<WhatsAppAccount[]>("/whatsapp/accounts");
      return data;
    },
  });

  const selectedAccount = accounts.find((a) => a.id === accountId);

  useEffect(() => {
    if (!selectedAccount?.phone) { setWaLink(""); return; }
    const phone = selectedAccount.phone.replace(/\D/g, "");
    const encoded = message ? `?text=${encodeURIComponent(message)}` : "";
    setWaLink(`https://wa.me/${phone}${encoded}`);
  }, [selectedAccount, message]);

  useEffect(() => {
    if (!waLink || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, waLink, {
      width: 220,
      margin: 2,
      color: { dark: "#ecedf6", light: "#161a21" },
    }).catch(() => {});
  }, [waLink]);

  const copy = () => {
    navigator.clipboard.writeText(waLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadQR = () => {
    if (!canvasRef.current) return;
    const a = document.createElement("a");
    a.href = canvasRef.current.toDataURL("image/png");
    a.download = "whatsapp-qr.png";
    a.click();
  };

  return (
    <div className="page-container space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#111827]">Link & QR Generator</h2>
        <p className="text-sm text-[#6B7280] mt-1">Generate click-to-chat links and QR codes for your WhatsApp numbers</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config panel */}
        <div className="bg-[#F9FAFB] border border-[#F3F4F6] rounded-2xl p-6 space-y-5">
          <h3 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Configuration</h3>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">WhatsApp Account</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
              className="w-full bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:border-[#6366F1]/60">
              <option value="">— Select account —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.phone ?? "no phone"})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Pre-filled Message <span className="normal-case font-normal">(optional)</span></label>
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Hi! I'd like to know more about..."
              className="w-full bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6366F1]/60 resize-none" />
          </div>

          {waLink && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Generated Link</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-[#0B0E14] border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-xs text-[#6B7280] font-mono break-all">
                  {waLink}
                </div>
                <button onClick={copy}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${copied ? "bg-emerald-500/10 text-emerald-400" : "stitch-gradient text-white"}`}>
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* QR preview */}
        <div className="bg-[#F9FAFB] border border-[#F3F4F6] rounded-2xl p-6 flex flex-col items-center justify-center gap-6">
          <h3 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest self-start">QR Code Preview</h3>
          {waLink ? (
            <>
              <div className="p-4 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl">
                <canvas ref={canvasRef} />
              </div>
              <div className="flex gap-3">
                <button onClick={downloadQR}
                  className="px-4 py-2 glass-pane rounded-lg text-sm font-medium text-[#6B7280] hover:text-[#111827] transition-all flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">download</span>Download PNG
                </button>
                <a href={waLink} target="_blank" rel="noopener noreferrer"
                  className="px-4 py-2 stitch-gradient rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">open_in_new</span>Test Link
                </a>
              </div>
              {selectedAccount && (
                <p className="text-xs text-[#9CA3AF] text-center">
                  Scan to open WhatsApp and start a chat with <span className="text-[#111827] font-medium">{selectedAccount.name}</span>
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-10">
              <div className="w-36 h-36 rounded-xl border-2 border-dashed border-[#D1D5DB] flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-4xl text-[#262B33]">qr_code_2</span>
              </div>
              <p className="text-sm text-[#9CA3AF]">Select an account to generate a QR code</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
