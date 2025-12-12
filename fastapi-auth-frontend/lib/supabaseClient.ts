// lib/supabaseClient.ts
"use client";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    }
);

// (Opcional, útil para depurar en consola del navegador)
if (typeof window !== "undefined") {
    (window as any).supabase = supabase;
}
