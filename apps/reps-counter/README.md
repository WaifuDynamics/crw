# Licznik pompek

Liczy pompki z kamery na żywo albo z pliku wideo. Wykrywa sylwetkę (MediaPipe Pose),
mierzy kąt w łokciu i zalicza powtórzenie przy pełnym cyklu góra → dół → góra.

## Instalacja

```
pip install -r requirements.txt
```

Model pozy (~9 MB) pobiera się sam przy pierwszym uruchomieniu do `models/`.

## Użycie

```
python -m pushups                        # kamera domyślna
python -m pushups --camera 1             # inna kamera
python -m pushups --video trening.mp4    # plik wideo
```

Sterowanie w oknie: **q** wyjście, **r** reset licznika, **spacja** pauza.

### Analiza pliku bez podglądu (szybko) + zapis wyników

```
python -m pushups --video trening.mp4 --no-show --fast --json wynik.json --csv reps.csv
```

### Nagranie z nakładką (licznik, szkielet)

```
python -m pushups --video trening.mp4 --save-video wynik.mp4
```

## Opcje

| flaga | znaczenie |
|---|---|
| `--camera N` / `--video PLIK` | źródło obrazu |
| `--model lite\|full\|heavy` | szybkość vs. dokładność (domyślnie `full`) |
| `--up` / `--down` | progi kąta w łokciu (stopnie) |
| `--no-adaptive` | wyłącza auto-kalibrację progów |
| `--smoothing 0..1` | wygładzanie kąta; więcej = stabilniej, wolniejsza reakcja |
| `--no-show` | bez okna — do przetwarzania wsadowego |
| `--fast` | plik przetwarzany najszybciej jak się da, nie w tempie nagrania |
| `--width PX` | skalowanie klatki (mniej = szybciej) |
| `--beep` | dźwięk przy każdym powtórzeniu |
| `--no-mirror` | nie odbija obrazu z kamery |
| `--json` / `--csv` / `--save-video` | zapis wyników |

## Jak to liczy

**Sygnał** — kąt bark–łokieć–nadgarstek, uśredniony z obu rąk (gdy widać tylko jedną,
liczy się ta jedna). Landmarki przeliczane są na piksele, więc proporcje obrazu nie
zniekształcają kąta.

**Auto-kalibracja progów** — nie każdy prostuje ręce do 175° i nie każdy schodzi
do 80°. Sztywne progi gubiłyby takie powtórzenia, więc z ostatnich ~20 s bierzemy
5. i 95. percentyl kąta i ustawiamy progi na 30% / 70% tego zakresu. Percentyle,
a nie min/max — pojedynczy błąd wykrycia sylwetki nie rozjeżdża wtedy progów.
Zanim zbierze się sensowny zakres, działają progi stałe (`--up` / `--down`).

**Odsiewanie fałszywych zliczeń** — powtórzenie musi mieć zakres ruchu ≥ 35°,
trwać ≥ 0,35 s i ≤ 15 s. Bujanie na prostych rękach nie przechodzi tego progu.
Wykrywanie pozy raz na kilkadziesiąt klatek strzela wartością zupełnie obok
(np. 179° w środku dołu pompki), więc górna pozycja musi się potwierdzić przez
2 klatki. Dno — nie: przy tempie ~1 s na powtórzenie dno trwa często jedną klatkę
i każde opóźnienie gubiłoby zliczenia. Z tego samego powodu odpada filtrowanie
samego sygnału (mediana ścinała prawdziwe dna razem z artefaktami).

**Punkty poza kadrem** — MediaPipe ekstrapoluje stawy poza obraz i daje im
przyzwoitą pewność. Tuż za krawędzią to zwykle sensowne (przy ciasnym kadrze dłonie
schodzą kilka procent poniżej dołu), dalej niż 15% wymiaru obrazu — już zgadywanie
i takie punkty są odrzucane. Do samego liczenia wystarczy jedno kompletne ramię;
biodra i nogi wchodzą dopiero do oceny sylwetki.

**Przerwy** — odpoczynek w górnej pozycji nie jest wliczany do czasu powtórzenia,
a chwilowe zniknięcie z kadru nie kasuje licznika.

**Sylwetka** — kąt bark–biodro–kostka (lub bark–biodro–kolano) poniżej 150° oznacza
zapadnięte biodra; powtórzenie jest liczone, ale oznaczone jako `good_form: false`
i na obrazie pojawia się ostrzeżenie. Gdy nóg nie widać, ocena jest pomijana —
raport mówi wtedy „nie oceniona", a nie „poprawna".

### Dwie miary czasu

- `avg_rep_s` — czas samej fazy ruchu (opuszczanie + wypychanie).
- `avg_cadence_s` — tempo, czyli co ile sekund wypada kolejne powtórzenie.

Kadencja jest zawsze dłuższa, bo obejmuje też postój w górze.

## Ustawienie kamery

Najlepiej **z boku**, cały tułów i ręce w kadrze. Ujęcie od przodu też działa
(kąt w łokciu pozostaje czytelny), ale jest mniej dokładne przy głębokich pompkach.
Jeśli licznik gubi powtórzenia, w pasku na dole widać bieżący kąt i aktywne progi —
można je nadpisać przez `--up` / `--down`.

## Testy

```
python -m pytest tests/ -q
```

18 testów: logika zliczania na syntetycznym przebiegu kąta oraz bramkowanie
widoczności landmarków — bez kamery i bez modelu.

### Zweryfikowane na nagraniu

`iso-republic-free-video-065.mp4` (14,2 s, 1080p, ujęcie z bliska, nogi poza kadrem):
**14 pompek — 14/14 trafień**. Prawdę porównawczą wyznaczył niezależny detektor
szczytów kąta: 15 szczytów w regularnym rytmie co 29 klatek, czyli 14 pełnych cykli
(pierwsze opuszczanie jest przed początkiem nagrania). Przetwarzanie ~43 fps, czyli
szybciej niż czas rzeczywisty.

## Struktura

```
pushups/
  counter.py    maszyna stanów: kąt w czasie -> powtórzenia (czysta logika)
  geometry.py   kąty i miary na landmarkach
  pose.py       wrapper MediaPipe PoseLandmarker + pobieranie modelu
  overlay.py    rysowanie szkieletu i HUD
  app.py        pętla wideo/kamera, zapis wyników
  __main__.py   CLI
```

---

# Wersja web — pojedynek dwóch graczy

Ta sama logika licznika. Widzisz kwadratowy podgląd swojej kamery ze szkieletem
rysowanym na ciele, swój licznik i paski postępu obu graczy. Serwer dobiera
graczy w pary.

Podgląd jest większy w kolejce (wtedy ustawiasz się w kadrze) i mniejszy w trakcie
wyścigu, żeby nie zabierać miejsca licznikom. Ręce — bark, łokieć, nadgarstek —
mają mocny kolor, bo to na nich opiera się liczenie; reszta sylwetki jest
rysowana na biało. Punkty poza kadrem nie są dorysowywane. Po zaliczonym
powtórzeniu ramka podglądu błyska na zielono, a podpis pod spodem mówi, czy
jesteś w dole, w górze, czy sylwetki w ogóle nie widać.

Obraz z kamery nie opuszcza przeglądarki — na serwer idzie wyłącznie liczba
zrobionych pompek.

```
python -m pushups.server                 # http://localhost:8000
python -m pushups.server --https         # gdy drugi gracz jest na innym komputerze
python -m pushups.server --target 30     # wyścig do 30 pompek (domyślnie 20)
```

**Interfejs aplikacji jest po angielsku** (ta dokumentacja zostaje po polsku).

Po wejściu i zgodzie na kamerę wybierasz tryb:

| tryb | co robi |
|---|---|
| **Solo** | Tylko Ty. Licznik, czas, tempo (powt./min) i najlepsza seria. Nie łączy się z serwerem w ogóle. |
| **Duo — 1v1** | Kolejka na dwie osoby, pierwszy do celu wygrywa. |
| **Duo — 2v2** | Kolejka na cztery osoby, dwie drużyny po dwóch. **Wynik drużyny to suma powtórzeń obu graczy**, pod paskiem widać rozbicie na osoby. |

Gdy komplet się zbierze, rusza 3-sekundowe odliczanie i lecisz. Nie ma logowania
ani kodu. Serię w Solo liczy się jako ciąg powtórzeń z przerwami krótszymi niż 5 s.

Wyjście gracza w trakcie kończy się walkowerem na rzecz przeciwnej drużyny (także
w 2v2 — niepełny skład kończy mecz), brak sygnału przez 8 s traktowany jest jak
rozłączenie. Licznik w trakcie meczu tylko rośnie: gdy ktoś przeładuje stronę
i przyśle zero, jego wkład do wyniku drużyny nie znika.

### Kto jest rywalem

Gdy nie wpiszesz nazwy, serwer nadaje unikalną (Falcon, Otter, Badger…) — widzisz
ją w polu nazwy, więc wiesz, jak widzą Cię inni. Mecz zapisuje nazwy i wyniki
graczy u siebie: rywal, który się rozłączy, zostaje na ekranie ze swoim wynikiem
i dopiskiem „(left)", a ekran końcowy mówi „beaten by Rival" zamiast
„Opponent" i 0:0.

### Odświeżanie wyniku rywala

Klient używa długiego odpytywania: serwer przetrzymuje żądanie, dopóki stan się
nie zmieni, i odpowiada w chwili, gdy rywal zrobi powtórzenie. Własne powtórzenie
przerywa oczekujące żądanie, żeby wynik poleciał od razu. Zmierzone przez tunel
Cloudflare: **mediana 99 ms** od wysłania wyniku przez rywala do pokazania go
w przeglądarce (wcześniej odpytywanie co 250–900 ms).

## Gra przez internet — tunel Cloudflare

Przeglądarka udostępnia kamerę tylko w bezpiecznym kontekście. `localhost` jest
wyjątkiem, więc Ty zagrasz lokalnie po http — ale ktokolwiek inny musi wejść po
HTTPS. Tunel załatwia to najlepiej: daje publiczny adres z ważnym certyfikatem,
bez ostrzeżeń i bez wspólnej sieci.

```
python -m pushups.server --tunnel --pin 4321
```

Wypisze adres `https://…trycloudflare.com` — wysyłasz go rywalowi i gracie.
Adres jest losowy i żyje tyle, co proces.

### Własna domena

```
cloudflared tunnel login                                  # raz, otwiera przeglądarkę
python -m pushups.server --hostname pompki.szybki-drop.pl --pin 4321
```

Logowanie musisz zrobić sam — wybiera domenę na Twoim koncie Cloudflare.
Resztę skrypt robi sam: tworzy tunel `pompki` i wpis DNS, idempotentnie,
więc kolejne uruchomienia nic nie psują.

**Ochrona istniejącego DNS-u.** Skrypt nie nadpisze wpisu, który nie należy do
jego tunelu — literówka w `--hostname` trafiająca w inną usługę na tej samej
domenie zatrzyma uruchomienie z komunikatem zamiast skasować działający wpis.
Świadome zastąpienie wymaga `--force-dns`.

### Kto może dołączyć

Każdy, kto zna adres. Nie ma kodu ani logowania — wejście na stronę to wejście
do kolejki, więc rywalem zostaje pierwsza osoba, która trafi tam w tym samym
czasie co Ty.

### Alternatywa bez tunelu

`--https` generuje certyfikat self-signed (potrzebny `openssl`) i działa w obrębie
sieci lokalnej, ale przeglądarka pokaże ostrzeżenie do ręcznego zaakceptowania.

## Tryb testowy bez robienia pompek

```
http://localhost:8000/?video=test.mp4     # liczy z pliku zamiast z kamery
http://localhost:8000/?model=lite         # szybszy model na słabszym sprzęcie
```

## Zweryfikowane

- Port logiki do JS (`web/counter.js`) przechodzi te same testy co wersja Pythona:
  `cd web && node --test counter.test.mjs` — 12/12.
- Ten sam licznik w przeglądarce na `test.mp4`: **14/14**, czasy powtórzeń zgodne
  z wersją Pythona co do ~0,1 s. Model `lite` dawał 13/14, stąd `full` jako domyślny.
- Przebieg rozgrywki przetestowany end-to-end w Chrome: kolejka → odliczanie →
  wyścig z aktualizacją pasków na żywo → ekran wyniku; osobno walkower i timeout.
- 2v2 rozegrane z przeglądarki przeciwko trzem botom: składy „You + Bot-C" vs
  „Bot-B + Bot-A", suma drużyny i rozbicie na graczy, paski proporcjonalne do
  celu, wynik 8:20 i ekran przegranej. Solo sprawdzone osobno — nie wysyła
  ani jednego żądania do serwera.
- Przez tunel Cloudflare: `isSecureContext` = true, pełny pojedynek rozegrany na
  publicznym adresie, model ładuje się z cache przeglądarki w 16 ms zamiast
  pobierania na nowo.
- Podgląd kamery ze szkieletem obejrzany na klatce z nagrania testowego:
  kwadratowy kadr, zielone kreski na rękach z punktami w stawach, białe na
  tułowiu, brak kresek tam, gdzie punktów nie widać. Rozmiar 230 px w kolejce
  i 150 px w wyścigu.

## Dlaczego serwer słucha na IPv6

Na Windowsie `localhost` rozwiązuje się najpierw na `::1`. Serwer związany tylko
z `0.0.0.0` odrzucał to połączenie, a klient dopiero po timeoucie próbował IPv4 —
**2046 ms na żądanie zamiast 1 ms**. Przy odpytywaniu cztery razy na sekundę gra
była nie do użycia. Stąd `DualStackServer` z wyłączonym `IPV6_V6ONLY`.

## Struktura

```
web/
  index.html    ekrany: dołączanie, kolejka, odliczanie, wyścig, wynik
  app.js        kamera bez podglądu, pętla detekcji, synchronizacja z serwerem
  counter.js    port logiki licznika (1:1 z pushups/counter.py)
  counter.test.mjs  testy portu
  vendor/       MediaPipe + modele, serwowane lokalnie (CDN jest zbędny)
pushups/
  server.py     serwer stdlib: pliki statyczne + matchmaking
  tunnel.py     uruchamianie cloudflared (tunel szybki albo na własnej domenie)
```

### Niski FPS detekcji

Na słabym telefonie albo bez GPU detekcja pozy potrafi iść 4–6 kl./s zamiast 30.
Licznik liczył wygładzanie i potwierdzanie górnej pozycji w klatkach, więc przy
takim tempie spłaszczał ruch i gubił większość powtórzeń. Teraz oba liczą się
w czasie między próbkami. Zmierzone na żywej stronie w headless Chromium
z kamerą karmioną nagraniem testowym:

| model | FPS detekcji | powtórzeń w 12 s przed | po |
|---|---|---|---|
| full | ~4 | 3 | 11 |
| lite | ~6 | 6 | 10 |

Przy 30 kl./s wynik na nagraniu bez zmian: 14/14.

## Dlaczego odpytywanie ma zmienny odstęp

Przez tunel jedno żądanie potrafi trwać dłużej niż odstęp odpytywania. Bez
zabezpieczenia żądania nakładałyby się, a starsza odpowiedź mogłaby cofnąć
nowszy stan. Klient pilnuje więc jednego żądania naraz, odrzuca odpowiedzi
przyszłe z opóźnieniem i dobiera odstęp do zmierzonego RTT (250–900 ms).

---

# Pakiet embed — widget na cudzą stronę

Kolega wkleja dwie linijki i ma licznik na swojej stronie:

```html
<div data-pushups></div>
<script src="https://pompki.szybki-drop.pl/embed.js" async></script>
```

Paczkę do wysłania buduje:

```
python scripts/build_embed.py        # -> dist/pushups-embed.zip
```

W środku jest `README.md` (po angielsku: opcje, zdarzenia, API, React, prywatność,
rozwiązywanie problemów), `example.html` z podglądem zdarzeń i `embed.js` do wglądu.
Sam skrypt ładuje się z serwera gry, więc poprawki trafiają do wszystkich
bez rozsyłania paczki od nowa.

Widget łączy się domyślnie z tym serwerem, więc gracze ze strony kolegi i z Twojej
trafiają do tych samych kolejek. **Działa tylko wtedy, gdy ten komputer i tunel
chodzą** — Solo działa zawsze, tryby Duo pokażą błąd połączenia. Kto potrzebuje
niezależności, stawia własny serwer i ustawia `data-server`.

Źródła pakietu: `embed/README.md`, `embed/example.html`, `web/embed.js`;
tryb osadzenia w aplikacji włącza parametr `?embed=1`.

---

## Przysiady

Obok pompek aplikacja liczy przysiady — po kącie w kolanie (biodro–kolano–kostka),
tą samą maszyną stanów i auto-kalibracją co pompki, tylko z innymi progami
startowymi (160° / 110°).

```
python -m pushups --exercise squat                    # kamera
python -m pushups --video przysiady.mp4 --exercise squat
```

Na stronie przełącznik **Push-ups / Squats** jest nad wyborem trybu, a widget
przyjmuje `data-exercise="squat"`. Kolejki 1v1 i 2v2 są osobne dla każdego
ćwiczenia, więc przysiady nie trafiają na pompki.

Do przysiadów w kadrze musi być **cała sylwetka razem ze stopami** — bez kostki
kąt w kolanie byłby zgadywany, więc licznik go wtedy nie liczy i podgląd pisze
„can't see your legs". W podglądzie na zielono świecą nogi zamiast rąk. Ocena
sylwetki (linia bark–biodro–kostka) jest dla przysiadów wyłączona, bo w przysiadzie
ta linia z natury się łamie.

**Zweryfikowane na nagraniu:** `squat-test.webm` (18,7 s, 504x900, 25 kl./s,
ujęcie z boku, cała sylwetka w kadrze) — **7 przysiadów, 7/7 trafień**.

Prawdę odniesienia wyznaczył niezależny detektor szczytów kąta w kolanie: dna
w klatkach 8, 73, 128, 183, 240, 296, 346, 402, 459 i wyprosty w 40, 96, 150,
207, 268, 323, 373, 430. Pierwsze dno jest przed pierwszym wyprostem (nagranie
zaczyna się w połowie ruchu), a po ostatnim dnie film się kończy — pełnych cykli
góra→dół→góra jest więc 7. Każde zaliczone powtórzenie pokrywa się z osobnym
szczytem (różnica 240–440 ms, bo powtórzenie zamyka przekroczenie progu „góra",
a nie sam wierzchołek), zakres ruchu 112–117°, czas 1,2–1,5 s.

Tryb przysiadów na nagraniu z pompkami daje 0, bo nóg nie widać w kadrze.

---

## Wygrane i tabela wyników

Serwer zapisuje wynik każdego zakończonego meczu 1v1 i 2v2 (także walkowerów)
w `data/stats.json`, więc tabela przeżywa restart. Kluczem jest nazwa gracza bez
rozróżniania wielkości liter — nie ma kont, więc to tabela wyników, a nie
tożsamość. W 2v2 wygraną dostaje każdy z drużyny zwycięzców.

```
GET /api/leaderboard?limit=3      -> {"top": [{name, wins, matches, reps, byMode, byExercise}, ...]}
GET /api/stats?name=Alex%20Morgan -> {name, wins, matches, reps, byMode, byExercise}
```

Endpointy `/api/*` mają nagłówki CORS (`Access-Control-Allow-Origin: *`), bo czyta
je aplikacja CRW+ z innej domeny, także przez publiczny adres Cloudflare. Ranking:
najpierw liczba wygranych, potem suma powtórzeń.

Testy nie dopisują się do prawdziwej tabeli — `tests/conftest.py` podmienia plik
na tymczasowy. `data/` jest w `.gitignore`.

### Ekran Play w CRW+

Środkowy przycisk dolnego paska („Play", ikona hantli) otwiera ekran `Play`
(adres `/play`). Na górze: wygrane zalogowanego użytkownika (łącznie, 1v1, 2v2,
per ćwiczenie) i top 3 na świecie; niżej wybór ćwiczenia i trybu. Solo po prostu
liczy, 1v1 i 2v2 od razu dołączają do działającej kolejki. Ekran jest celowo bez
stylu: czarne tło, biały tekst.

Nazwa gracza pochodzi z pola `display_name` konta CRW+. Domyślnie aplikacja łączy
się z `https://pompki.szybki-drop.pl`; `EXPO_PUBLIC_REPS_URL=http://localhost:8000`
przełącza ją na lokalny serwer.
