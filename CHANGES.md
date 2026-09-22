# Zmiany względem repozytorium

Porównanie z ostatnim commitem na `origin/main` (`ebb6e4c`, *Add a development script that refills the weekly leaderboard*). Nic z poniższego nie jest jeszcze zacommitowane.

## Funkcje

1. **Tryby Pompki i Przysiady (`/pushups`, `/squats`)**
   - Nowe ekrany z licznikiem powtórzeń z kamery (osadzony licznik z `pompki.szybki-drop.pl`), w kolorach i czcionkach CRW+.
   - Wyniki meczów zalogowanych graczy zapisują się na koncie.
   - Pliki: `src/screens/Reps.tsx`, `src/reps.ts`.

2. **Ekran Play (środkowy przycisk w dolnym pasku)**
   - Wybór ćwiczenia (pompki / przysiady) i trybu (Solo, 1v1, 2v2) z dołączaniem do kolejki na żywo.
   - Liczba osób w kolejkach i w trwających meczach, odświeżana na bieżąco.
   - Karta „Your record” (wygrane, procent wygranych, wygrane 1v1/2v2, powtórzenia) i ranking top 3 na świecie.
   - Wskazówki „Get in frame”, jak ustawić się przed kamerą.
   - Pliki: `src/screens/Play.tsx`, `src/components/BottomBar.tsx`, `docs/PLAY.md`.

3. **Wyniki meczów i ranking w bazie danych**
   - Tabela `rep_matches`; endpointy `POST /reps/results` (zapis wyniku, bez duplikatów), `GET /reps/me`, `GET /reps/leaderboard` (tylko publiczne profile biorące udział w rankingu).
   - Pliki: `migrations/005_rep_matches.sql`, `src/routes/reps.ts`.

4. **Solo: rekordy i historia sesji**
   - Przycisk **Finish** w trybie solo i podsumowanie sesji: powtórzenia, najlepsza seria, czas, tempo, rekordy (lifetime, najlepsza seria w historii, liczba sesji) oraz komunikat „New best set!”.
   - Tabela `rep_sessions`; endpointy `POST /reps/sessions` i `GET /reps/sessions`; statystyki solo w `GET /reps/me`.
   - Sekcja „Your personal records” na ekranie Play (lifetime, najlepsza seria, najlepsza sesja; osobno pompki i przysiady).
   - Pliki: `migrations/007_rep_sessions.sql`.

5. **Logowanie przez Google**
   - Przycisk Google (po angielsku, w stylu aplikacji) z weryfikacją tokenu na serwerze (`jose`).
   - Konto Google łączy się z istniejącym kontem o tym samym, zweryfikowanym przez Google adresie email; próba przejęcia konta przez inne konto Google jest blokowana.
   - Endpointy: `GET /auth/google/config`, `POST /auth/google`.
   - Pliki: `src/components/GoogleSignIn.tsx`, `src/routes/account.ts`, `docs/AUTH.md`.

6. **Tabela kont użytkowników**
   - `user_accounts`: zdjęcie, imię, nazwisko, email, kraj, język aplikacji, powiązanie z Google.
   - `password_hash` może być pusty (konta tylko przez Google).
   - Endpointy `GET /account` i `PATCH /account`; `/auth/me` zwraca też dane konta.
   - Pliki: `migrations/004_google_accounts.sql`.

7. **Rozszerzona rejestracja (onboarding w 6 krokach)**
   - Język, kraj, wiek, waga, wzrost i zgoda na maile.
   - Każdy krok można pominąć; wtedy pojawia się ostrzeżenie, że pominięcie pogorszy liczenie kalorii itp.
   - Pojawia się po rejestracji lub logowaniu oraz raz na sesję dla kont bez ukończonego onboardingu.
   - Pliki: `src/screens/Onboarding.tsx`, `migrations/006_body_profile.sql`.

8. **Wybór języka**
   - Lista wszystkich języków ISO 639-1 z nazwami w danym języku, domyślnie język urządzenia.
   - Wybór zapisuje się na koncie; aplikacja zostaje po angielsku, a pozostałe języki mają oznaczenie „SOON”.
   - Pliki: `src/languages.ts`, `src/countries.ts`.

9. **Konta demo w bazie zamiast zmyślonych danych**
   - 12 fikcyjnych kont (bez zdjęć) z danymi konta, wagą i wzrostem oraz 60 meczami do rankingu.
   - Komenda `npm run demo:accounts`; `seed` używa tych samych kont.
   - Pliki: `src/demo.ts`, `src/seed.ts`.

10. **Mapy Mapbox z prawdziwą lokalizacją**
    - Ciemny styl Mapbox na stronie; niebieska kropka z kręgiem dokładności, śledzenie pozycji i przycisk centrowania.
    - Mapa „Your location” w Trackingu, trasa na żywo podczas biegu i lokalizacja na mapie aktywności.
    - Bez tokenu mapy korzystają z OpenStreetMap.
    - Pliki: `src/mapbox.ts`, `src/components/LiveMap.web.tsx`, `RunMap.web.tsx`, `ActivityMap.web.tsx`.

11. **Mapy w aplikacji mobilnej bez Google Maps**
    - Usunięte `react-native-maps` (wymagało klucza Google i konta rozliczeniowego).
    - Ta sama mapa Leaflet + Mapbox w `react-native-webview`, z lokalizacją z GPS telefonu, grupowaniem pinezek i wyborem aktywności.
    - Leaflet jest wbudowany w aplikację (`npm run maps:embed`).
    - Pliki: `MapWebView.tsx`, `mapPage.ts`, `leafletAssets.ts`, `useNativeLocation.ts`, `LiveMap.tsx`, `RunMap.tsx`, `ActivityMap.tsx`.

12. **Prawdziwe miasto zamiast „Beirut / Lebanon”**
    - Nagłówki Discover i Food pokazują miasto z GPS (odwrotne geokodowanie Mapbox na stronie, systemowe w aplikacji).
    - Miasto jest pamiętane przez 30 minut; bez lokalizacji widać kraj z konta lub urządzenia.
    - Pliki: `src/place.ts`.

13. **Naprawiony tracking treningu**
    - Wrócił przycisk „Start run”; mapa lokalizacji jest pod nim.
    - Na stronie GPS faktycznie nalicza dystans (błąd w `expo-location` na web; nagrywanie korzysta teraz bezpośrednio z Geolocation API).
    - W trakcie biegu ekran się nie wygasza (Wake Lock), zegar odświeża się co sekundę, a przed pierwszym precyzyjnym sygnałem widać komunikat „Waiting for a precise GPS signal”.
    - Pliki: `src/tracking/recorder.ts`, `src/screens/Tracking.tsx`, `TrackingDashboard.tsx`.

14. **Health Connect (Android)**
    - **Import:**
      - wszystkie rodzaje treningów z 30 dni (nie tylko biegi) z dystansem, czasem, kaloriami, tętnem, krokami i trasą;
      - dzisiejsze kroki, kalorie i tętno;
      - waga i wzrost uzupełniają profil.
    - **Zapis** (przełącznik, domyślnie wyłączony):
      - biegi CRW+ z trasą, dystansem i kaloriami (automatycznie po „Finish” albo przyciskiem w podsumowaniu);
      - sesje solo pompek i przysiadów;
      - waga i wzrost z profilu.
    - Nie ma duplikatów przy ponownym zapisie ani importu własnych rekordów CRW+.
    - Status połączenia i przejście do uprawnień Health Connect; 13 uprawnień w manifeście.
    - Szacowanie kalorii na podstawie wagi (70 kg, gdy jej brak); w podsumowaniu biegu kalorie i średnie tętno; historia „Recent workouts” pokazuje rodzaj treningu.
    - Pliki: `health.android.ts`, `healthConnectMapping.ts` (+ testy), `healthSync.ts`, `calories.ts`, `model.ts`, `docs/TRACKING.md`.

15. **Maile w stylu CRW+**
    - Wspólny szablon HTML (ciemny, z logo, przyciskami i kartami) z wersją tekstową.
    - Dotyczy potwierdzenia adresu, resetu hasła i potwierdzenia rezerwacji (nazwa, termin, miejsce, cena).
    - Pliki: `src/emails.ts`.

16. **Codzienny mail marketingowy (tylko za zgodą)**
    - Najwyżej raz dziennie po 7:00 UTC, tylko do osób ze zgodą i potwierdzonym adresem.
    - Treść: wyzwanie dnia, rekordy osoby, do 3 aktywności z najbliższego tygodnia (najpierw z jej miasta).
    - Zgoda (domyślnie wyłączona, z datą) w onboardingu i w Ustawieniach.
    - Wypisanie jednym kliknięciem: nagłówek `List-Unsubscribe`, a link otwiera stronę z przyciskiem, żeby skanery linków nikogo nie wypisywały.
    - Ustawienia `MARKETING_SEND_HOUR_UTC` i `MARKETING_EMAILS=off`.
    - Pliki: `src/marketing.ts`, `src/routes/email.ts`, `migrations/008_marketing_email.sql`.

17. **Usuwanie konta z potwierdzeniem mailem**
    - „Delete account” wysyła mail z przyciskiem (link ważny godzinę, działa tylko najnowszy i tylko raz); konto znika dopiero po kliknięciu na stronie potwierdzenia.
    - Usuwane są też dane konta: imię, email, waga, wzrost i zgoda na maile; wszystkie sesje są wylogowywane.
    - Pliki: `src/routes/accountDeletion.ts`, `migrations/009_account_deletion_tokens.sql`.

18. **Aplikacja instalowalna (PWA)**
    - Manifest z ikonami (także adaptacyjnymi i dla iPhone’a) i skrótami do Play, Push-ups i Squats.
    - Service worker: aplikacja otwiera się bez internetu, z własną stroną offline; API, mapy i logowanie nigdy nie są brane z pamięci.
    - Nagłówki cache w nginx i Vercel.
    - Pliki: `apps/mobile/public/*`, `vercel.json`, `deploy/nginx.conf`.

19. **Wdrożenie produkcyjne (sport.konekocode.pl)**
    - Docker Compose: Postgres, Redis, MinIO, migracje, API i nginx; tunel Cloudflare dla `sport`, `sport-api` i `sport-media`.
    - Maile przez Resend z domeny `sport.konekocode.pl`.
    - Pliki: `deploy/compose.production.yaml`, `deploy/nginx.conf`, `docs/DEPLOYMENT.md`.

20. **Build Androida na tym komputerze (bez EAS)**
    - `scripts/build-android.ps1` generuje projekt, używa JDK/SDK/NDK z instalacji Unity, wymusza zainstalowane wersje narzędzi i tworzy `dist-android/crw-plus-<wersja>-release.apk`.
    - `eas.json`: produkcyjne adresy i token Mapbox dla profili `preview` i `production`; w `app.config.ts` ID projektu EAS i właściciel.
    - Dodane `expo-system-ui`, zaktualizowane pakiety Expo do wersji wymaganych przez SDK 57.

21. **Compete: ranking kilometrów i czytelniejsze przełączniki**
    - Zostaje sam leaderboard (Global / kraj / Friends); sekcje Challenges, Achievements i Seasons usunięte.
    - Przyciski Reps / Wins / Kilometres; ranking przerysowuje się przy każdej zmianie.
    - `POST /workouts` zapisuje ukończone treningi (tylko dystans i czas, trasa zostaje na telefonie), `metric=km` w `/reps/leaderboard`.

22. **Jasny motyw**
    - Ustawienia → Appearance: Dark (domyślny), Light, Same as device; zmiana działa od razu.
    - `src/theme.ts`: paleta, `tint()` dla kolorów z ciemnego projektu, `themed()` dla stylów; mapy Mapbox w wersji jasnej.
    - Licznik powtórzeń dostaje kolory aplikacji (także `panel2`).

23. **Powiadomienia push przez Firebase (FCM)**
    - Firebase w projekcie `crw-plus`, aplikacja Android `app.crwplus.fitness`, plik `apps/mobile/google-services.json`.
    - Serwer wysyła przez FCM HTTP v1 (`apps/api/src/push.ts`) z kanałem, kolorem, ikoną CRW+ i zdjęciem; konto usługi `crw-push` w `FCM_SERVICE_ACCOUNT`.
    - Kanały na Androidzie: ogólne, zaproszenia do znajomych, aktywność znajomych, wydarzenia, rankingi, oferty.
    - Znajomi dostają powiadomienie, gdy ktoś skończy trening (min. 500 m) albo zrobi 20+ powtórzeń; najwyżej raz na 3 godziny od jednej osoby, do wyłączenia w ustawieniach.
    - Trening na żywo: stałe powiadomienie z czasem, dystansem i tempem oraz przyciskami Pause / Resume / Finish; odświeża się też przy zablokowanym ekranie.
    - Wylogowanie wyrejestrowuje telefon (`DELETE /devices`).

24. **iOS w GitHub Actions**
    - Expo SDK 57 wymaga Swifta z Xcode 27, więc job iOS działa na obrazie `xcode-27` (wersja beta: build symulatora i ad-hoc działają, App Store przyjmie dopiero po premierze Xcode 27).

## Poprawki

1. **Zmiana danych konta nie działała:** CORS nie pozwalał na PATCH/PUT/DELETE, więc zapis danych konta (np. odpowiedzi z onboardingu) kończył się błędem „Failed to fetch”.
2. **„Body cannot be empty…” przy usuwaniu konta:** aplikacja wysyła nagłówek JSON tylko razem z treścią, a API akceptuje też puste zapytania z tym nagłówkiem.
3. **Wybór trybu nie otwierał licznika:** przy wejściu bezpośrednio na `/play` (albo skrótem z PWA) aplikacja drugi raz obsługiwała ten sam adres i przykrywała licznik ekranem Play.
4. **Onboarding zasłaniał dolny pasek:** otwierał się też wtedy, gdy nie było danych konta.
5. **Rejestracja powiadomień push:** działa bez zmiennej `EXPO_PUBLIC_EAS_PROJECT_ID`, bo bierze ID projektu z konfiguracji aplikacji.
6. **Link „Email settings” z maili:** otwiera profil (`/settings`).

## Testy

- API: 54 testy, nowe pliki `google.test.ts`, `reps.test.ts`, `marketing.test.ts`, `deletion.test.ts` (plus poprawki w `core.test.ts`).
- Aplikacja: `npm test -w @crw/mobile` (mapowanie Health Connect i kalorie); `scripts/tracking-smoke.mjs` dostosowany do onboardingu.

## Poza tym repozytorium

Licznik powtórzeń (`../pushups`, `../web`) nie należy do tego repo. Doszło w nim m.in.:
- tryb przysiadów;
- matchmaking Solo/1v1/2v2 z long pollingiem;
- pakiet embed;
- tryb solo z przyciskiem Finish i rekordami;
- tunel `pompki.szybki-drop.pl`.
