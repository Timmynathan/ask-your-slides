import "server-only";

// Must match ingestion/embed.py: same model, same dimensions, input_type "query" for searches.
const URL = "https://api.voyageai.com/v1/embeddings";
export const EMBED_MODEL = "voyage-4";
export const EMBED_DIMS = 1024;

export async function embedQuery(text: string, signal?: AbortSignal): Promise<number[]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: [text], model: EMBED_MODEL, input_type: "query", output_dimension: EMBED_DIMS }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
      } else if (!res.ok) {
        throw new Error(`Voyage HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      } else {
        const data = await res.json();
        const vec: number[] = data.data[0].embedding;
        if (vec.length !== EMBED_DIMS) throw new Error(`Voyage returned ${vec.length} dims`);
        return vec;
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  throw new Error(`Voyage embeddings failed: ${lastError}`);
}
