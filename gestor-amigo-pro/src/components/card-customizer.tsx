import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Check, Upload, X, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const CARD_COLORS = [
  "#0f1b3d", // marinho
  "#1e3a5f",
  "#c9a84c", // dourado
  "#0d7a5f", // esmeralda
  "#8b4513", // sépia
  "#6b2737", // vinho
  "#374151", // grafite
  "#7c3aed", // ametista
  "#0891b2", // teal
  "#dc2626", // rubi
];

export type CustomizableTable = "contracts" | "law_firms" | "demands";

export const EMOJI_PRESETS = [
  "🏛️","⚖️","📜","✍️","🗝️","🔑","🏗️","🏢","🏘️","🏡",
  "📄","📋","📎","📁","🗂️","🖋️","💼","🤝","📅","⏳",
  "🟦","🟥","🟩","🟨","⭐","🔥","💎","🎯","🚩","✅",
];

export type CardCustomization = {
  accent_color: string | null;
  icon_emoji: string | null;
  custom_tag: string | null;
  cover_image_url: string | null;
};

export function CardCustomizer({
  table,
  id,
  invalidateKey,
  value,
  compact,
  variant = "chip",
}: {
  table: CustomizableTable;
  id: string;
  invalidateKey: (string | number)[];
  value: CardCustomization;
  compact?: boolean;
  variant?: "chip" | "button";
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(value.accent_color ?? "");
  const [emoji, setEmoji] = useState(value.icon_emoji ?? "");
  const [tag, setTag] = useState(value.custom_tag ?? "");
  const [cover, setCover] = useState(value.cover_image_url ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadCover(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5 MB)");
      return;
    }
    // Só imagens rasterizadas comuns; extensão derivada do MIME, não do nome (auditoria set/2026).
    const mimeToExt: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const ext = mimeToExt[file.type];
    if (!ext) {
      toast.error("Formato não permitido. Use JPG, PNG ou WebP.");
      return;
    }
    setUploading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sem sessão");
      const path = `${user.user.id}/${table}-${id}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("card-covers").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (up.error) throw up.error;
      // Bucket é privado — usamos URL assinada de longa duração
      const signed = await supabase.storage
        .from("card-covers")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signed.error || !signed.data) throw signed.error ?? new Error("URL falhou");
      setCover(signed.data.signedUrl);
      toast.success("Imagem carregada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from(table)
      .update({
        accent_color: color || null,
        icon_emoji: emoji || null,
        custom_tag: tag || null,
        cover_image_url: cover || null,
      })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: invalidateKey });
    toast.success("Personalização salva");
    setOpen(false);
  }

  const triggerClasses =
    variant === "button"
      ? "inline-flex items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 hover:bg-accent/20 hover:border-accent px-3.5 py-2 text-xs uppercase tracking-widest text-foreground transition-all shadow-sm"
      : `inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur px-2.5 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all ${compact ? "" : ""}`;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`relative z-20 ${triggerClasses}`}
        aria-label="Personalizar"
      >
        {variant === "button" ? (
          <><Settings2 className="h-3.5 w-3.5" /> Personalizar</>
        ) : (
          <><Palette className="h-3 w-3" /> Personalizar</>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(28rem,95vw)] max-h-[90vh] p-0 gap-0 flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
            <DialogTitle className="text-base font-serif">Personalizar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-5 overflow-y-auto flex-1">
          <div>
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Cor de destaque</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CARD_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2 border-white shadow relative"
                  style={{ background: c }}
                >
                  {color === c ? (
                    <Check className="h-3.5 w-3.5 text-white absolute inset-0 m-auto drop-shadow" />
                  ) : null}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setColor("")}
                className="h-7 px-2 rounded-full border text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Nenhuma
              </button>
            </div>
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#hex personalizado"
              className="mt-2 h-8 text-xs"
            />
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Ícone</Label>
            <div className="mt-2 grid grid-cols-10 gap-1">
              {EMOJI_PRESETS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`h-7 w-7 rounded-md text-base flex items-center justify-center transition-all ${
                    emoji === em ? "bg-primary/15 ring-2 ring-primary/50" : "hover:bg-muted"
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="Ou digite/cole"
                maxLength={4}
                className="h-8 text-lg text-center"
              />
              {emoji ? (
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEmoji("")}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Etiqueta</Label>
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Alphaville · Prioridade · Fase 2…"
              maxLength={24}
              className="mt-1 h-8 text-xs"
            />
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Imagem de capa</Label>
            {cover ? (
              <div
                className="mt-2 h-24 rounded-lg bg-cover bg-center border border-border relative"
                style={{ backgroundImage: `url(${cover})` }}
              >
                <button
                  type="button"
                  onClick={() => setCover("")}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/90 border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                  aria-label="Remover imagem"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            <div className="flex items-center gap-2 mt-2">
              <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background hover:bg-muted px-3 py-1.5 text-xs cursor-pointer transition-colors">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Enviando…" : cover ? "Trocar" : "Enviar imagem"}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadCover(f);
                  }}
                />
              </label>
              <span className="text-[10px] text-muted-foreground">ou cole uma URL</span>
            </div>
            <Input
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              placeholder="https://…"
              className="mt-2 h-8 text-xs"
            />
          </div>

        </div>
          <DialogFooter className="flex-row justify-end gap-2 border-t border-border bg-background px-5 py-3 sm:justify-end">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={saving} className="min-w-20">
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}