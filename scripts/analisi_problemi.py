#!/usr/bin/env python3
"""Analisi statistica delle recensioni per Issue Detection.

Tutta la logica qui dentro e' matematica pura (conteggi, percentuali,
variazioni nel tempo) — NESSUNA chiamata a un modello AI. Le categorie di
problema sono definite a mano con parole chiave: una recensione "appartiene"
a una categoria se il suo testo contiene almeno una di quelle parole
(case-insensitive). E' una scelta deliberata: trasparente, gratuita,
istantanea, e facile da correggere a mano (basta aggiungere una parola alla
lista) invece di dover "spiegare" a un modello perche' ha sbagliato.

Uso:
    echo '[...]' | python3 analisi_problemi.py            # stampa JSON
    echo '[...]' | python3 analisi_problemi.py --grafico  # stampa un PNG

L'input via stdin e' un array JSON di recensioni:
    [{"rating": 1, "text": "...", "review_date": "2026-08-12T..", "platform": "steam"}, ...]

Chiamato da src/services/pythonAnalytics.js (child_process), non lo lanci
tu a mano di solito — ma puoi farlo, e' un programma Python normale.
"""
import json
import sys
from datetime import datetime, timedelta, timezone

# Ogni categoria: un nome mostrato all'utente + le parole/frasi che, se
# presenti nel testo di una recensione, la fanno contare per quella
# categoria. Aggiungerne una nuova e' letteralmente aggiungere una riga qui.
CATEGORIE = [
    {
        "id": "multiplayer",
        "nome": "Multiplayer disconnects",
        "parole_chiave": ["disconnect", "kicked from", "connection lost", "dropped from the match", "can't stay connected"],
    },
    {
        "id": "performance",
        "nome": "Performance drops and stuttering",
        "parole_chiave": ["lag", "stutter", "fps", "frame rate", "freeze", "freezes", "slow down", "performance"],
    },
    {
        "id": "controller",
        "nome": "Controller not detected",
        "parole_chiave": ["controller not detected", "controller doesn't work", "gamepad not", "input lag", "button not working", "controller issue"],
    },
    {
        "id": "ui",
        "nome": "UI text overlapping",
        "parole_chiave": ["ui overlap", "text overlap", "ui bug", "menu glitch", "text is cut off", "ui is broken"],
    },
    {
        "id": "crash",
        "nome": "Crashes",
        "parole_chiave": ["crash", "crashes", "won't start", "wont start", "freezes on launch", "unplayable"],
    },
    {
        "id": "save",
        "nome": "Save/progress lost",
        "parole_chiave": ["lost my save", "save file", "progress reset", "didn't save", "save is gone"],
    },
    {
        "id": "audio",
        "nome": "Audio issues",
        "parole_chiave": ["no sound", "audio bug", "sound cuts out", "music stops", "audio glitch"],
    },
]

PIATTAFORME_NOTE = ["steam", "xbox", "google_play", "app_store"]


def testo_contiene(testo, parole_chiave):
    if not testo:
        return False
    testo_min = testo.lower()
    return any(p in testo_min for p in parole_chiave)


def parse_data(valore):
    try:
        # Node manda ISO 8601 con 'Z'; Python vuole '+00:00'.
        return datetime.fromisoformat(valore.replace("Z", "+00:00"))
    except (ValueError, AttributeError, TypeError):
        return None


def gravita_da_percentuale(percentuale, andamento):
    # Soglie scelte per un catalogo piccolo (poche centinaia di recensioni):
    # una categoria che copre piu' del 15% delle recensioni, o che sta
    # crescendo di piu' del 50% settimana su settimana, merita attenzione
    # subito. Sono numeri di partenza, non una scienza esatta — vanno
    # aggiustati guardando dati veri quando ce ne saranno.
    if percentuale >= 15 or (andamento is not None and andamento >= 50):
        return "alta"
    if percentuale >= 5 or (andamento is not None and andamento > 0):
        return "media"
    return "bassa"


def analizza(recensioni):
    ora = datetime.now(timezone.utc)
    una_settimana_fa = ora - timedelta(days=7)
    due_settimane_fa = ora - timedelta(days=14)

    totale_recensioni = len(recensioni)
    risultati = []

    for categoria in CATEGORIE:
        corrispondenti = [r for r in recensioni if testo_contiene(r.get("text"), categoria["parole_chiave"])]
        if not corrispondenti:
            continue

        conteggio = len(corrispondenti)
        percentuale = round((conteggio / totale_recensioni) * 100, 1) if totale_recensioni else 0.0

        date_valide = [parse_data(r.get("review_date")) for r in corrispondenti]
        date_valide = [d for d in date_valide if d is not None]

        settimana_corrente = sum(1 for d in date_valide if d >= una_settimana_fa)
        settimana_precedente = sum(1 for d in date_valide if due_settimane_fa <= d < una_settimana_fa)

        if settimana_precedente > 0:
            andamento = round(((settimana_corrente - settimana_precedente) / settimana_precedente) * 100)
        elif settimana_corrente > 0:
            andamento = None  # "nuovo" — non c'era nulla la settimana prima, la % non ha senso
        else:
            andamento = 0

        piattaforme = {}
        for r in corrispondenti:
            p = r.get("platform") or "steam"
            piattaforme[p] = piattaforme.get(p, 0) + 1

        esempi = []
        visti = set()
        for r in sorted(corrispondenti, key=lambda r: r.get("review_date") or "", reverse=True):
            testo = (r.get("text") or "").strip()
            if not testo or testo in visti:
                continue
            visti.add(testo)
            esempi.append(testo[:200])
            if len(esempi) >= 2:
                break

        risultati.append({
            "id": categoria["id"],
            "nome": categoria["nome"],
            "totale_recensioni": conteggio,
            "percentuale": percentuale,
            "andamento_settimanale": andamento,
            "gravita": gravita_da_percentuale(percentuale, andamento),
            "primo_segnalato": min(date_valide).isoformat() if date_valide else None,
            "ultimo_segnalato": max(date_valide).isoformat() if date_valide else None,
            "piattaforme": piattaforme,
            "esempi": esempi,
        })

    ordine_gravita = {"alta": 0, "media": 1, "bassa": 2}
    risultati.sort(key=lambda r: (ordine_gravita[r["gravita"]], -r["totale_recensioni"]))
    return risultati


def genera_grafico(risultati):
    import matplotlib
    matplotlib.use("Agg")  # nessun display: genera solo l'immagine
    import matplotlib.pyplot as plt

    colore_gravita = {"alta": "#ff3b30", "media": "#ffad35", "bassa": "#39963c"}

    if not risultati:
        risultati = [{"nome": "Nessun problema rilevato", "totale_recensioni": 0, "gravita": "bassa"}]

    nomi = [r["nome"] for r in reversed(risultati)]
    valori = [r["totale_recensioni"] for r in reversed(risultati)]
    colori = [colore_gravita[r["gravita"]] for r in reversed(risultati)]

    altezza = max(2.5, 0.6 * len(nomi))
    fig, ax = plt.subplots(figsize=(9, altezza), dpi=150)
    ax.barh(nomi, valori, color=colori)
    ax.set_xlabel("Recensioni")
    ax.set_title("Issue Detection — problemi rilevati per numero di recensioni")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()

    fig.savefig(sys.stdout.buffer, format="png")
    plt.close(fig)


def main():
    recensioni = json.load(sys.stdin)
    risultati = analizza(recensioni)

    if "--grafico" in sys.argv:
        genera_grafico(risultati)
    else:
        json.dump(risultati, sys.stdout)


if __name__ == "__main__":
    main()
