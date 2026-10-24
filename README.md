# PixBill

Domowa aplikacja do zliczania miesięcznych wydatków ze zdjęć paragonów i ręcznych wpisów.
Działa na własnym serwerze, a dostęp jest wyłącznie przez Tailscale.

## Aplikacja na telefon

Interfejs to PWA serwowane przez backend pod adresem z `tailscale serve`
(np. `https://<laptop>.<tailnet>.ts.net`). Otwierasz go na telefonie z włączonym Tailscale i instalujesz:

- Android (Chrome): menu ⋮ → „Zainstaluj aplikację”,
- iPhone (Safari): Udostępnij → „Do ekranu początkowego”.

Ekrany: pulpit (suma miesiąca, wykres kołowy sekcji, porównanie z poprzednim miesiącem, 6 miesięcy wstecz),
dodawanie (aparat, galeria, ręczny wpis), sprawdzanie odczytanego paragonu, lista wydatków z filtrem sekcji,
sekcje z porównaniem miesięcy i trendem z 12 miesięcy, ustawienia sekcji.
Przy paragonie ze znanego sklepu aplikacja podpowiada sekcję z ostatniego zakupu.
Bez połączenia z serwerem aplikacja pokazuje ostatnio pobrane dane, a nowe wydatki i zdjęcia paragonów trzyma w telefonie i wysyła je sama, gdy połączenie wróci (każdy zapis ma identyfikator, więc ponowne wysłanie nie robi duplikatu).
Opłaty stałe (czynsz, internet, abonamenty) dodajesz raz w Ustawieniach, a aplikacja co miesiąc sama dopisuje je do wydatków w wybranym dniu.

## Backend

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
| `PIXBILL_SECRET_KEY` | | Sekret sesji; gdy pusty, aplikacja sama tworzy losowy w `data/secret_key` |
| `PIXBILL_OLLAMA_MODEL` | `qwen2.5vl:3b` | Model do odczytu paragonów, np. `gemma3:4b` |
| `PIXBILL_PHOTO_RETENTION_DAYS` | `10` | Po ilu dniach od zatwierdzenia kasować zdjęcie |
