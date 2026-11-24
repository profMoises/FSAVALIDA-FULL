import { createClient } from "npm:@supabase/supabase-js@2";
import { unzipSync } from "npm:fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TAMANHO_MAXIMO = 10 * 1024 * 1024;

type Formato = "pdf" | "ooxml" | "ole" | "odf" | "texto" | "png" | "jpeg";

const TIPOS: Record<string, { mime: string; formato: Formato; entrada?: string }> = {
  pdf: { mime: "application/pdf", formato: "pdf" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", formato: "ooxml", entrada: "word/document.xml" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", formato: "ooxml", entrada: "xl/workbook.xml" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", formato: "ooxml", entrada: "ppt/presentation.xml" },
  doc: { mime: "application/msword", formato: "ole" },
  xls: { mime: "application/vnd.ms-excel", formato: "ole" },
  ppt: { mime: "application/vnd.ms-powerpoint", formato: "ole" },
  odt: { mime: "application/vnd.oasis.opendocument.text", formato: "odf" },
  ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", formato: "odf" },
  odp: { mime: "application/vnd.oasis.opendocument.presentation", formato: "odf" },
  csv: { mime: "text/csv", formato: "texto" },
  txt: { mime: "text/plain", formato: "texto" },
  png: { mime: "image/png", formato: "png" },
  jpg: { mime: "image/jpeg", formato: "jpeg" },
  jpeg: { mime: "image/jpeg", formato: "jpeg" },
};

const EXTENSOES_TEXTO = Object.keys(TIPOS).map((e) => `.${e}`).join(", ");

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function comecaCom(bytes: Uint8Array, assinatura: number[]): boolean {
  return assinatura.every((b, i) => bytes[i] === b);
}

function conteudoConfere(bytes: Uint8Array, tipo: { mime: string; formato: Formato; entrada?: string }): boolean {
  switch (tipo.formato) {
    case "pdf":
      return comecaCom(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "png":
      return comecaCom(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpeg":
      return comecaCom(bytes, [0xff, 0xd8, 0xff]);
    case "ole":
      return comecaCom(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "texto":
      return !bytes.some((b) => b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b));
    case "ooxml":
    case "odf": {
      if (!comecaCom(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
      const nomes: string[] = [];
      let entradas: Record<string, Uint8Array>;
      try {
        entradas = unzipSync(bytes, {
          filter: (f) => {
            nomes.push(f.name);
            return f.name === "mimetype";
          },
        });
      } catch {
        return false;
      }
      if (nomes.some((n) => n.toLowerCase().endsWith("vbaproject.bin"))) return false;
      if (tipo.formato === "ooxml") {
        return nomes.includes("[Content_Types].xml") && nomes.includes(tipo.entrada!);
      }
      const mimetype = entradas["mimetype"];
      return !!mimetype && new TextDecoder().decode(mimetype).trim() === tipo.mime;
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Autorização necessária." }, 401);

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
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: perfil, error: perfilError } = await admin
      .from("profiles")
      .select("perfil")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (perfilError) return json({ error: "Não foi possível verificar suas permissões." }, 500);
    if (perfil?.perfil !== "admin") {
      return json({ error: "Apenas administradores podem enviar arquivos para os Links Úteis." }, 403);
    }

    const tamanhoDeclarado = Number(req.headers.get("content-length") ?? "0");
    if (tamanhoDeclarado > TAMANHO_MAXIMO + 64 * 1024) {
      return json({ error: "O arquivo deve ter no máximo 10 MB." }, 413);
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ error: "Envio inválido. Selecione o arquivo novamente." }, 400);
    }
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) return json({ error: "Nenhum arquivo foi enviado." }, 400);
    if (arquivo.size === 0) return json({ error: "O arquivo está vazio." }, 400);
    if (arquivo.size > TAMANHO_MAXIMO) return json({ error: "O arquivo deve ter no máximo 10 MB." }, 413);

    const nomeOriginal = arquivo.name || "arquivo";
    const extensao = nomeOriginal.includes(".") ? nomeOriginal.split(".").pop()!.toLowerCase() : "";
    const tipo = TIPOS[extensao];
    if (!tipo) {
      return json({ error: `Tipo de arquivo não permitido. Use: ${EXTENSOES_TEXTO}.` }, 415);
    }

    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    if (!conteudoConfere(bytes, tipo)) {
      return json({
        error: `O conteúdo do arquivo não corresponde a um .${extensao} válido. Arquivos com macros também não são aceitos.`,
      }, 415);
    }

    const nomeSeguro = nomeOriginal
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const caminho = `${Date.now()}-${nomeSeguro}`;

    const { error: uploadError } = await admin.storage
      .from("links-uteis")
      .upload(caminho, bytes, { contentType: tipo.mime, upsert: false });
    if (uploadError) {
      console.error("links-uteis-upload: falha no upload", uploadError.message);
      return json({ error: "Não foi possível armazenar o arquivo. Tente novamente." }, 500);
    }

    return json({ caminho });
  } catch (err) {
    console.error("links-uteis-upload erro:", err);
    return json({ error: "Ocorreu um erro inesperado. Tente novamente." }, 500);
  }
});
