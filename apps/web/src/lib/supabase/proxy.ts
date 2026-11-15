import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Percorsi accessibili senza sessione. */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/confirm"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Aggiorna i cookie di sessione Supabase a ogni richiesta e reindirizza al
 * login chi non è autenticato. È solo un primo filtro: l'autorizzazione vera
 * avviene nel Data Access Layer e nel database (RLS).
 */
export async function updateSession(
  request: NextRequest,
  extraRequestHeaders: Record<string, string> = {},
) {
  // Prosegue verso la pagina con i cookie aggiornati e gli header aggiuntivi (nonce CSP).
  const next = () => {
    const headers = new Headers(request.headers);
    for (const [k, v] of Object.entries(extraRequestHeaders)) headers.set(k, v);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return new NextResponse("Configurazione Supabase mancante", { status: 500 });
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = next();
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // getClaims() verifica la firma del JWT: non fidarsi di getSession() lato server.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  if (!isAuthenticated && !isPublic(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }
  return response;
}
