"use client";
import * as React from "react";
import { whoAmI } from "lib/api"; // ya existe en lib/api.ts

export default function WhoAmI() {
    const [out, setOut] = React.useState<any>(null);
    const [err, setErr] = React.useState<string | null>(null);

    React.useEffect(() => {
        (async () => {
            try {
                const res = await whoAmI();
                setOut(res);
            } catch (e: any) {
                setErr(e?.message ?? String(e));
            }
        })();
    }, []);

    return (
        <div className="p-6 space-y-4">
            <h1 className="text-xl font-semibold">/dev/whoami</h1>
            {err && <pre className="text-red-500">{err}</pre>}
            {out && <pre className="p-4 rounded border overflow-auto text-sm">
                {JSON.stringify(out, null, 2)}
            </pre>}
        </div>
    );
}
