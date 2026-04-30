const express = require("express");
const cors    = require("cors");
const app     = express();

app.use(cors());
app.use(express.json({ limit: "10mb" })); // accepte les images base64 jusqu'à 10mb

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "CarDrive TCG API" });
});

// ── Route principale : reconnaissance de voiture ──────────────────────────────
app.post("/recognize", async (req, res) => {
  const { base64, mediaType = "image/jpeg" } = req.body;

  if (!base64) {
    return res.status(400).json({ error: "Champ 'base64' manquant" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Clé API non configurée sur le serveur" });
  }

  const system = `Tu es un expert automobile mondial avec 30 ans d'expérience.
On te donne une photo prise depuis un smartphone. Identifie le véhicule visible.

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT avec un objet JSON, rien d'autre avant ni après
- Pas de markdown, pas de backticks, pas d'explication
- Si tu n'es pas sûr à 100%, donne ta meilleure estimation avec confidence bas
- Si l'image ne contient pas de véhicule, mets confidence:0 et make:"Inconnu"

FORMAT JSON EXACT :
{
  "make": "Toyota",
  "model": "Yaris",
  "year": "2021",
  "category": "Compacte",
  "country_of_origin": "Japon",
  "world_units_produced": 8000000,
  "france_units_estimated": 180000,
  "fun_fact": "La Yaris est la voiture la plus vendue au Japon depuis 2020.",
  "power_hp": 116,
  "top_speed_kmh": 175,
  "zero_to_100": 10.2,
  "price_eur_new": 20000,
  "confidence": 92
}

Catégories valides : Berline, SUV, Sportive, Supercar, Hypercar, Compacte, Utilitaire, Cabriolet, Pickup, Électrique, Camion, Moto
Pays valides : France, Allemagne, Italie, Japon, USA, UK, Suède, Corée, Autre`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-opus-4-5",
        max_tokens: 1024,
        system,
        messages: [{
          role: "user",
          content: [
            {
              type:   "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: "Identifie le véhicule sur cette photo et retourne le JSON.",
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Anthropic] ${response.status}:`, errText);
      return res.status(response.status).json({
        error: `Erreur Anthropic ${response.status}`,
        detail: errText.slice(0, 300),
      });
    }

    const data = await response.json();
    const raw  = (data.content || []).map(b => b.text || "").join("").trim();

    // Extraction robuste du JSON
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) parsed = JSON.parse(fenced[1].trim());
      else {
        const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
        if (s !== -1 && e !== -1) parsed = JSON.parse(raw.slice(s, e + 1));
        else throw new Error("Aucun JSON dans la réponse");
      }
    }

    // Normalise et retourne
    res.json({
      make:                   parsed.make                  || "Inconnu",
      model:                  parsed.model                 || "Inconnu",
      year:                   parsed.year                  || "—",
      category:               parsed.category              || "Berline",
      country_of_origin:      parsed.country_of_origin     || "Autre",
      world_units_produced:   Number(parsed.world_units_produced)   || 0,
      france_units_estimated: Number(parsed.france_units_estimated)  || 0,
      fun_fact:               parsed.fun_fact               || "",
      power_hp:               Number(parsed.power_hp)       || 0,
      top_speed_kmh:          Number(parsed.top_speed_kmh)  || 0,
      zero_to_100:            Number(parsed.zero_to_100)    || 0,
      price_eur_new:          Number(parsed.price_eur_new)  || 0,
      confidence:             Number(parsed.confidence)     || 50,
    });

  } catch (err) {
    console.error("[Server] Erreur:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CarDrive API démarrée sur le port ${PORT}`));
