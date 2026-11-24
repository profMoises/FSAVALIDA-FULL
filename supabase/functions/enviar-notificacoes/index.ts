import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "noreply@senai.edu.br";
const APP_URL = Deno.env.get("APP_URL") ?? "https://senai-planos.edu.br";
const MAX_TENTATIVAS = 5;

type Notificacao = {
  id: string;
  plano_id: string;
  evento: string;
  destinatario_email: string;
  destinatario_nome: string;
  assunto: string;
};

type DadosPlano = {
  titulo: string;
  arquivo_nome: string;
  docente_nome: string | null;
  pasta_nome: string | null;
  enviado_por_nome: string | null;
  criado_at: string;
};

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlEmail(titulo: string, mensagem: string, campos: { label: string; valor: string }[]): string {
  const linhas = campos
    .map(
      (c) =>
        `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;width:140px;">${escaparHtml(c.label)}</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:500;">${escaparHtml(c.valor)}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:#0d47a1;padding:24px 32px;">
          <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">SENAI</span>
          <br><span style="font-size:12px;color:#bbdefb;">Gestão de Planos de Aula</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;font-weight:700;">${titulo}</h1>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">${mensagem}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            ${linhas}
          </table>
          <a href="${APP_URL}" style="display:inline-block;background:#0d7a6f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">ACESSAR SISTEMA</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">Esta é uma notificação automática do sistema SENAI de Gestão de Planos de Aula. Não responda a este e-mail.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function construirEmail(notif: Notificacao, dados: DadosPlano): { subject: string; html: string } {
  const dataFormatada = new Date(dados.criado_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  if (notif.evento === "envio_docente") {
    return {
      subject: notif.assunto,
      html: htmlEmail(
        "NOVO PLANO DE AULA RECEBIDO",
        "Um novo plano de aula foi enviado por um docente e está aguardando análise da equipe pedagógica.",
        [
          { label: "Docente", valor: dados.docente_nome ?? "—" },
          { label: "Curso", valor: dados.pasta_nome ?? "—" },
          { label: "Pasta", valor: dados.pasta_nome ?? "—" },
          { label: "Plano", valor: dados.arquivo_nome ?? "—" },
          { label: "Data do envio", valor: dataFormatada },
          { label: "Status", valor: "Aguardando análise pedagógica" },
        ],
      ),
    };
  }

  return {
    subject: notif.assunto,
    html: htmlEmail(
      "PLANO DE AULA AGUARDANDO ANÁLISE DA COORDENAÇÃO",
      "Um plano de aula foi aprovado pela Pedagogia e encaminhado para avaliação da Coordenação Técnica.",
      [
        { label: "Docente", valor: dados.docente_nome ?? "—" },
        { label: "Curso", valor: dados.pasta_nome ?? "—" },
        { label: "Pasta", valor: dados.pasta_nome ?? "—" },
        { label: "Plano", valor: dados.arquivo_nome ?? "—" },
        { label: "Encaminhado por", valor: dados.enviado_por_nome ?? "—" },
        { label: "Data", valor: dataFormatada },
        { label: "Status", valor: "Aguardando análise da Coordenação Técnica" },
      ],
    ),
  };
}

async function enviarEmailResend(
  to: string,
  toName: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; providerId?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY não configurado" };
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html,
        reply_to: EMAIL_FROM,
        tags: [{ name: "sistema", value: "senai-planos" }],
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return { success: false, error: data.message ?? `HTTP ${resp.status}` };
    }

    return { success: true, providerId: data.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Autorização necessária." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: perfil } = await admin
      .from("profiles")
      .select("perfil")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (perfil?.perfil !== "admin" && perfil?.perfil !== "pedagogia" && perfil?.perfil !== "coordenacao") {
      return new Response(JSON.stringify({ error: "Acesso negado." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pendentes, error: errPendentes } = await admin
      .from("notificacoes_email")
      .select("id, plano_id, evento, destinatario_email, destinatario_nome, assunto")
      .eq("status", "pendente")
      .lt("tentativas", MAX_TENTATIVAS)
      .order("criado_at", { ascending: true })
      .limit(20);

    if (errPendentes) {
      return new Response(JSON.stringify({ error: "Erro ao buscar notificações." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let enviadas = 0;
    let erros = 0;
    let semConfig = false;

    if (pendentes && pendentes.length > 0) {
      if (!RESEND_API_KEY) {
        semConfig = true;
      }

      for (const notif of pendentes as Notificacao[]) {
        if (semConfig) {
          await admin
            .from("notificacoes_email")
            .update({
              status: "erro",
              erro_mensagem: "RESEND_API_KEY não configurado",
              tentativas: notif.id ? 1 : 1,
            })
            .eq("id", notif.id);
          erros++;
          continue;
        }

        const { data: plano } = await admin
          .from("planos_aula")
          .select(
            "titulo, arquivo_nome, criado_at, docente:profiles!docente_id(nome), pasta:pastas!pasta_id(nome)",
          )
          .eq("id", notif.plano_id)
          .maybeSingle();

        if (!plano) {
          await admin
            .from("notificacoes_email")
            .update({ status: "erro", erro_mensagem: "Plano não encontrado", tentativas: 1 })
            .eq("id", notif.id);
          erros++;
          continue;
        }

        let enviadoPorNome: string | null = null;
        if (notif.evento === "encaminhamento_coordenacao") {
          const { data: ultimaInteracao } = await admin
            .from("plano_interacoes")
            .select("autor:profiles!autor_id(nome)")
            .eq("plano_id", notif.plano_id)
            .eq("tipo", "recebimento_coordenacao")
            .order("criado_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          enviadoPorNome = (ultimaInteracao as { autor: { nome: string } | null })?.autor?.nome ?? null;
        }

        const dadosPlano: DadosPlano = {
          titulo: (plano as { titulo: string }).titulo,
          arquivo_nome: (plano as { arquivo_nome: string }).arquivo_nome,
          docente_nome: (plano as { docente: { nome: string } | null })?.docente?.nome ?? null,
          pasta_nome: (plano as { pasta: { nome: string } | null })?.pasta?.nome ?? null,
          enviado_por_nome: enviadoPorNome,
          criado_at: (plano as { criado_at: string }).criado_at,
        };

        const { subject, html } = construirEmail(notif, dadosPlano);
        const resultado = await enviarEmailResend(notif.destinatario_email, notif.destinatario_nome, subject, html);

        if (resultado.success) {
          await admin
            .from("notificacoes_email")
            .update({
              status: "enviado",
              provider_id: resultado.providerId,
              enviado_at: new Date().toISOString(),
              tentativas: 1,
              erro_mensagem: null,
            })
            .eq("id", notif.id);
          enviadas++;
        } else {
          const novasTentativas = 1;
          const deveFalhar = novasTentativas >= MAX_TENTATIVAS;
          await admin
            .from("notificacoes_email")
            .update({
              status: deveFalhar ? "erro" : "pendente",
              erro_mensagem: resultado.error,
              tentativas: novasTentativas,
            })
            .eq("id", notif.id);
          erros++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processadas: pendentes?.length ?? 0,
        enviadas,
        erros,
        semConfiguracao: semConfig,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("enviar-notificacoes falhou:", err);
    return new Response(
      JSON.stringify({ error: "Ocorreu um erro inesperado. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
