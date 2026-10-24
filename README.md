# PixBill

Domowa aplikacja do zliczania miesięcznych wydatków ze zdjęć paragonów i ręcznych wpisów.
Działa na własnym serwerze, a dostęp jest wyłącznie przez Tailscale.

## Co jest gotowe (etap 1: infrastruktura i backend)

- `docker-compose.yml`: aplikacja (FastAPI) i Ollama z dostępem do GPU.
- Baza SQLite w `data/pixbill.db`, zdjęcia w `data/photos/`.
- API:
  - logowanie hasłem (`POST /api/login`)
  - sekcje: lista, dodawanie, edycja, archiwizacja (`/api/categories`)
  - wydatki: ręczne dodawanie z opisem i sekcją, filtrowanie po miesiącu i sekcji (`/api/expenses`)
  - paragony: wgranie zdjęcia, odczyt w tle przez Ollamę, ekran weryfikacji i zatwierdzenie (`/api/receipts`)
  - statystyki: suma miesiąca, podział na sekcje, porównanie z poprzednim miesiącem, trend (`/api/stats`)
- Zdjęcie paragonu jest kasowane 10 dni po zatwierdzeniu. Dane zostają w bazie.
- Dokumentacja API po uruchomieniu: `http://127.0.0.1:8000/docs`.

Następny etap: interfejs (PWA na telefon) z wykresami.

## Instalacja

Zobacz [docs/INSTALL.md](docs/INSTALL.md).

## Praca lokalna i testy

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest
PIXBILL_DATA_DIR=../data uvicorn app.main:app --reload
```

## Ustawienia (`.env`)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PIXBILL_PASSWORD` | `zmien-mnie` | Hasło do aplikacji |
| `PIXBILL_SECRET_KEY` | | Sekret sesji (`openssl rand -hex 32`) |
| `PIXBILL_OLLAMA_MODEL` | `qwen2.5vl:3b` | Model do odczytu paragonów, np. `gemma3:4b` |
| `PIXBILL_PHOTO_RETENTION_DAYS` | `10` | Po ilu dniach od zatwierdzenia kasować zdjęcie |
