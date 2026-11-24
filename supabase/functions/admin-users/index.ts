import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PERFIS = ["admin", "docente", "pedagogia", "coordenacao"];
const VINCULO_MULTIPLO = ["docente", "pedagogia", "coordenacao"];
const MIN_SENHA = 6;

function senhaFraca(senha: string): string | null {
  if (senha.length < MIN_SENHA) return `A senha deve ter pelo menos ${MIN_SENHA} caracteres.`;
  return null;
}

type Payload = {
  action?: string;
  id?: string;
  nome?: string;
  email?: string;
  senha?: string;
  perfil?: string;
  pasta_id?: string | null;
  pasta_ids?: string[];
  usuarios?: Array<{
    nome: string;
    email: string;
    senha: string;
    pasta_ids: string[];
  }>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validarDados(body: Payload, exigeSenha: boolean): string | null {
  if (!body.nome || body.nome.trim().length < 2) return "Informe o nome do usuário.";
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return "Informe um e-mail válido.";
  if (!body.perfil || !PERFIS.includes(body.perfil)) return "Escolha um perfil válido.";
  if (body.perfil === "docente") {
    const temPastaUnica = body.pasta_id && body.pasta_id.trim() !== "";
    const temMultiplas = Array.isArray(body.pasta_ids) && body.pasta_ids.length > 0;
    if (!temPastaUnica && !temMultiplas) return "Vincule o docente a pelo menos uma pasta.";
  }
  if (body.pasta_ids !== undefined && !Array.isArray(body.pasta_ids)) return "Pastas inválidas.";
  if (exigeSenha && !body.senha) {
    return `A senha deve ter pelo menos ${MIN_SENHA} caracteres.`;
  }
  if (body.senha) {
    const aviso = senhaFraca(body.senha);
    if (aviso) return aviso;
  }
  return null;
}

function pastasMultiplas(body: Payload): string[] {
  if (!VINCULO_MULTIPLO.includes(body.perfil ?? "")) return [];
  return [...new Set(body.pasta_ids ?? [])];
}

async function substituirVinculos(admin: SupabaseClient, profileId: string, pastaIds: string[]): Promise<boolean> {
  const { error: deleteError } = await admin.from("profile_pastas").delete().eq("profile_id", profileId);
  if (deleteError) return false;
  if (pastaIds.length === 0) return true;
  const { error: insertError } = await admin
    .from("profile_pastas")
    .insert(pastaIds.map((pasta_id) => ({ profile_id: profileId, pasta_id })));
  return !insertError;
}

type ResultadoImport = {
  email: string;
  nome: string;
  acao: "criado" | "existente" | "erro";
  vinculos_adicionados: number;
  vinculos_existentes: number;
  erro?: string;
};

async function processarImportacao(
  admin: SupabaseClient,
  usuarios: Array<{ nome: string; email: string; senha: string; pasta_ids: string[] }>,
): Promise<{ resultados: ResultadoImport[]; resumo: { criados: number; existentes: number; erros: number; vinculos_adicionados: number; vinculos_existentes: number } }> {
  const resultados: ResultadoImport[] = [];
  let criados = 0;
  let existentes = 0;
  let erros = 0;
  let vinculosAdicionadosTotal = 0;
  let vinculosExistentesTotal = 0;

  for (const item of usuarios) {
    const email = item.email.trim().toLowerCase();
    const nome = item.nome.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      resultados.push({ email: item.email, nome, acao: "erro", vinculos_adicionados: 0, vinculos_existentes: 0, erro: "E-mail inválido." });
      erros++;
      continue;
    }

    if (!item.senha || item.senha.length < MIN_SENHA) {
      resultados.push({ email, nome, acao: "erro", vinculos_adicionados: 0, vinculos_existentes: 0, erro: `Senha deve ter pelo menos ${MIN_SENHA} caracteres.` });
      erros++;
      continue;
    }

    const avisoSenha = senhaFraca(item.senha);
    if (avisoSenha) {
      resultados.push({ email, nome, acao: "erro", vinculos_adicionados: 0, vinculos_existentes: 0, erro: avisoSenha });
      erros++;
      continue;
    }

    const pastaIds = [...new Set(item.pasta_ids.filter((id) => id.trim() !== ""))];

    const { data: perfilExistente } = await admin
      .from("profiles")
      .select("id, perfil")
      .eq("email", email)
      .maybeSingle();

    if (perfilExistente) {
      if (perfilExistente.perfil !== "docente") {
        resultados.push({
          email,
          nome,
          acao: "erro",
          vinculos_adicionados: 0,
          vinculos_existentes: 0,
          erro: `Usuário existente com perfil "${perfilExistente.perfil}" — não alterado.`,
        });
        erros++;
        continue;
      }

      const { data: vinculosAtuais } = await admin
        .from("profile_pastas")
        .select("pasta_id")
        .eq("profile_id", perfilExistente.id);
      const idsAtuais = new Set((vinculosAtuais ?? []).map((v: { pasta_id: string }) => v.pasta_id));

      const novosIds = pastaIds.filter((id) => !idsAtuais.has(id));
      if (novosIds.length > 0) {
        const { error: insertErr } = await admin
          .from("profile_pastas")
          .insert(novosIds.map((pasta_id) => ({ profile_id: perfilExistente.id, pasta_id })));
        if (insertErr) {
          resultados.push({
            email,
            nome,
            acao: "erro",
            vinculos_adicionados: 0,
            vinculos_existentes: idsAtuais.size,
            erro: "Falha ao adicionar vínculos.",
          });
          erros++;
          continue;
        }
      }

      resultados.push({
        email,
        nome,
        acao: "existente",
        vinculos_adicionados: novosIds.length,
        vinculos_existentes: idsAtuais.size,
      });
      existentes++;
      vinculosAdicionadosTotal += novosIds.length;
      vinculosExistentesTotal += idsAtuais.size;
      continue;
    }

    const { data: criado, error: createError } = await admin.auth.admin.createUser({
      email,
      password: item.senha,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (createError || !criado.user) {
      const msg = createError?.message?.toLowerCase().includes("already")
        ? "E-mail já cadastrado com perfil diferente."
        : "Não foi possível criar a conta.";
      resultados.push({ email, nome, acao: "erro", vinculos_adicionados: 0, vinculos_existentes: 0, erro: msg });
      erros++;
      continue;
    }

    const pastaIdPrincipal = pastaIds.length > 0 ? pastaIds[0] : null;
    const { error: profileError } = await admin.from("profiles").insert({
      id: criado.user.id,
      nome,
      email,
      perfil: "docente",
      pasta_id: pastaIdPrincipal,
      primeiro_acesso: true,
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(criado.user.id);
      resultados.push({ email, nome, acao: "erro", vinculos_adicionados: 0, vinculos_existentes: 0, erro: "Falha ao salvar perfil." });
      erros++;
      continue;
    }

    if (pastaIds.length > 0) {
      const { error: insertErr } = await admin
        .from("profile_pastas")
        .insert(pastaIds.map((pasta_id) => ({ profile_id: criado.user.id, pasta_id })));
      if (insertErr) {
        await admin.from("profiles").delete().eq("id", criado.user.id);
        await admin.auth.admin.deleteUser(criado.user.id);
        resultados.push({ email, nome, acao: "erro", vinculos_adicionados: 0, vinculos_existentes: 0, erro: "Falha ao vincular pastas." });
        erros++;
        continue;
      }
    }

    resultados.push({
      email,
      nome,
      acao: "criado",
      vinculos_adicionados: pastaIds.length,
      vinculos_existentes: 0,
    });
    criados++;
    vinculosAdicionadosTotal += pastaIds.length;
  }

  return {
    resultados,
    resumo: {
      criados,
      existentes,
      erros,
      vinculos_adicionados: vinculosAdicionadosTotal,
      vinculos_existentes: vinculosExistentesTotal,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sessão não encontrada. Entre novamente." }, 401);

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
    if (userError || !userData.user) return json({ error: "Sessão inválida. Entre novamente." }, 401);
    const caller = userData.user;

    const { data: perfilChamador } = await admin
      .from("profiles")
      .select("perfil")
      .eq("id", caller.id)
      .maybeSingle();
    if (perfilChamador?.perfil !== "admin") {
      return json({ error: "Apenas o administrador pode gerenciar usuários." }, 403);
    }

    const body = (await req.json()) as Payload;

    if (body.action === "import-batch") {
      if (!Array.isArray(body.usuarios) || body.usuarios.length === 0) {
        return json({ error: "Nenhum usuário válido para importar." }, 400);
      }
      const resultado = await processarImportacao(admin, body.usuarios);
      return json({ ok: true, ...resultado });
    }

    if (body.action === "create") {
      const erro = validarDados(body, true);
      if (erro) return json({ error: erro }, 400);

      const email = body.email!.trim().toLowerCase();
      const { data: criado, error: createError } = await admin.auth.admin.createUser({
        email,
        password: body.senha,
        email_confirm: true,
        user_metadata: { nome: body.nome!.trim() },
      });
      if (createError || !criado.user) {
        console.error("createUser falhou:", createError);
        const duplicado = createError?.message?.toLowerCase().includes("already");
        return json(
          {
            error: duplicado
              ? "Já existe um usuário com este e-mail."
              : "Não foi possível criar o usuário. Tente novamente.",
          },
          400,
        );
      }

      const pastaIdDocente = body.perfil === "docente" ? (body.pasta_id && body.pasta_id.trim() !== "" ? body.pasta_id : (Array.isArray(body.pasta_ids) && body.pasta_ids.length > 0 ? body.pasta_ids[0] : null)) : null;
      const { error: profileError } = await admin.from("profiles").insert({
        id: criado.user.id,
        nome: body.nome!.trim(),
        email,
        perfil: body.perfil,
        pasta_id: pastaIdDocente,
        primeiro_acesso: true,
      });
      if (profileError) {
        console.error("profiles.insert falhou:", profileError);
        await admin.auth.admin.deleteUser(criado.user.id);
        return json({ error: "Não foi possível salvar o perfil do usuário." }, 500);
      }
      const vinculosSalvos = await substituirVinculos(admin, criado.user.id, pastasMultiplas(body));
      if (!vinculosSalvos) {
        console.error("profile_pastas.insert falhou para:", criado.user.id);
        await admin.from("profiles").delete().eq("id", criado.user.id);
        await admin.auth.admin.deleteUser(criado.user.id);
        return json({ error: "Não foi possível vincular as pastas do usuário. Confira se a pasta selecionada ainda existe." }, 500);
      }
      return json({ ok: true, id: criado.user.id });
    }

    if (body.action === "update") {
      if (!body.id) return json({ error: "Usuário não informado." }, 400);
      const erro = validarDados(body, false);
      if (erro) return json({ error: erro }, 400);
      if (body.id === caller.id && body.perfil !== "admin") {
        return json({ error: "Você não pode remover o seu próprio perfil de administrador." }, 400);
      }

      const email = body.email!.trim().toLowerCase();
      const authUpdate: { email: string; email_confirm: boolean; password?: string } = {
        email,
        email_confirm: true,
      };
      if (body.senha) authUpdate.password = body.senha;

      const { error: authError } = await admin.auth.admin.updateUserById(body.id, authUpdate);
      if (authError) {
        const duplicado = authError.message?.toLowerCase().includes("already");
        return json(
          { error: duplicado ? "Já existe um usuário com este e-mail." : "Não foi possível atualizar o usuário." },
          400,
        );
      }

      const pastaIdDocente = body.perfil === "docente" ? (body.pasta_id && body.pasta_id.trim() !== "" ? body.pasta_id : (Array.isArray(body.pasta_ids) && body.pasta_ids.length > 0 ? body.pasta_ids[0] : null)) : null;
      const { error: profileError } = await admin
        .from("profiles")
        .update({
          nome: body.nome!.trim(),
          email,
          perfil: body.perfil,
          pasta_id: pastaIdDocente,
        })
        .eq("id", body.id);
      if (profileError) {
        console.error("profiles.update falhou:", profileError);
        return json({ error: "Não foi possível salvar o perfil do usuário." }, 500);
      }
      const vinculosSalvos = await substituirVinculos(admin, body.id, pastasMultiplas(body));
      if (!vinculosSalvos) return json({ error: "Não foi possível salvar as pastas do usuário. Confira se as pastas selecionadas ainda existem." }, 500);
      return json({ ok: true });
    }

    if (body.action === "delete") {
      if (!body.id) return json({ error: "Usuário não informado." }, 400);
      if (body.id === caller.id) return json({ error: "Você não pode excluir o seu próprio usuário." }, 400);

      const { count } = await admin
        .from("planos_aula")
        .select("id", { count: "exact", head: true })
        .eq("docente_id", body.id);
      if ((count ?? 0) > 0) {
        return json(
          { error: "Este usuário possui planos de aula enviados e não pode ser excluído." },
          409,
        );
      }

      const { error: deleteError } = await admin.auth.admin.deleteUser(body.id);
      if (deleteError) return json({ error: "Não foi possível excluir o usuário." }, 500);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: "Ocorreu um erro inesperado. Tente novamente." }, 500);
  }
});
