// Funzione serverless Netlify: recupera i prezzi correnti da Twelve Data.
// La chiave API resta lato server (variabile d'ambiente TWELVE_DATA_API_KEY),
// non è mai esposta al browser. Il file HTML chiama solo questo endpoint.
//
// Parametri (query string):
//   us = lista di ticker USA separati da virgola, es. "AMZN,NOW,GOOG"
//   eu = lista "SIMBOLO:MIC" separati da virgola, es. "BESI:XAMS,HO:XPAR"
//        (MIC = Market Identifier Code ISO 10383: XAMS = Euronext Amsterdam, XPAR = Euronext Paris)
//
// Risposta:
//   { prices: { "AMZN": { price: 231.5, currency: "USD" }, ... }, errors: ["..."] }

const BASE = "https://api.twelvedata.com/quote";

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "TWELVE_DATA_API_KEY non configurata su Netlify (Site settings → Environment variables).",
      }),
    };
  }

  const qs = event.queryStringParameters || {};
  const usList = (qs.us || "").split(",").map((s) => s.trim()).filter(Boolean);
  const euList = (qs.eu || "").split(",").map((s) => s.trim()).filter(Boolean);

  const prices = {};
  const errors = [];

  // ---- ticker USA: una sola chiamata bulk, separati da virgola ----
  if (usList.length > 0) {
    try {
      const url = `${BASE}?symbol=${encodeURIComponent(usList.join(","))}&apikey=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      parseQuoteResponse(data, usList, prices, errors);
    } catch (e) {
      errors.push("Errore di rete sui ticker USA: " + e.message);
    }
  }

  // ---- ticker europei: un simbolo può avere lo stesso ticker su borse diverse,
  // quindi ognuno va disambiguato singolarmente col suo MIC ----
  for (const item of euList) {
    const [symbol, mic] = item.split(":");
    if (!symbol) continue;
    try {
      const url = `${BASE}?symbol=${encodeURIComponent(symbol)}${mic ? `&mic_code=${encodeURIComponent(mic)}` : ""}&apikey=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      parseQuoteResponse(data, [symbol], prices, errors, item);
    } catch (e) {
      errors.push(`Errore di rete su ${item}: ` + e.message);
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ prices, errors }) };
};

// Twelve Data, quando interroghi più simboli, restituisce un oggetto chiavato per simbolo;
// con un solo simbolo restituisce direttamente l'oggetto quote. Gestiamo entrambe le forme.
function parseQuoteResponse(data, requestedSymbols, prices, errors, labelOverride) {
  if (!data) { errors.push("Risposta vuota da Twelve Data."); return; }

  if (data.status === "error" || data.code >= 400) {
    errors.push(`${labelOverride || requestedSymbols.join(",")}: ${data.message || "simbolo non trovato"}`);
    return;
  }

  // caso: un solo simbolo -> oggetto quote diretto (ha "close" e "symbol")
  if (data.symbol && data.close !== undefined) {
    const key = labelOverride || data.symbol;
    const p = parseFloat(data.close);
    if (isFinite(p)) prices[key] = { price: p, currency: data.currency || null };
    else errors.push(`${key}: prezzo non numerico ricevuto`);
    return;
  }

  // caso: più simboli -> oggetto chiavato { "AAPL": {...}, "MSFT": {...} }
  requestedSymbols.forEach((sym) => {
    const entry = data[sym];
    if (!entry) { errors.push(`${sym}: nessun dato restituito`); return; }
    if (entry.status === "error") { errors.push(`${sym}: ${entry.message || "errore"}`); return; }
    const p = parseFloat(entry.close);
    if (isFinite(p)) prices[sym] = { price: p, currency: entry.currency || null };
    else errors.push(`${sym}: prezzo non numerico ricevuto`);
  });
}
